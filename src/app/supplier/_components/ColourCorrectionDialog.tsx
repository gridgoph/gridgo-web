"use client";

import { useEffect, useMemo, useState } from "react";

import { CoverageGlyph } from "@/components/colour/CoverageGlyph";
import { useCommandKeys } from "@/components/refunds/useCommand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestOrderChange, type OrderChangeInput } from "@/lib/api/client";
import type { Order, ProductionItem } from "@/lib/api/types";
import {
  bpsPercent,
  correctionBaseline,
  correctionDraft,
  quoteA3Limit,
  readColourQuote,
  readCorrection,
  sheetsLine,
  tierFor,
  tierLabel,
  type ColourQuote,
  type CorrectionDraftRow,
} from "@/lib/colour-pricing";
import { formatPhp, minorToPesosInput } from "@/lib/format";
import { CHANGE_REASON_MAX, changeReasonError, shopChangeErrorMessage } from "@/lib/order-changes";

const medium = { fontFamily: "var(--font-medium)" } as const;

/** Colour-priced lines on the job, with the reading the shop may correct. */
export function correctableColourLines(
  job: Pick<Order, "productionItems">,
): Array<{ item: ProductionItem; quote: ColourQuote }> {
  return (job.productionItems ?? []).flatMap((item) => {
    const quote = readColourQuote(item.colourPricing);
    return quote?.pricedByColour && quote.pages.length ? [{ item, quote }] : [];
  });
}

type Props = {
  job: Order;
  lineItemId: string | null;
  open: boolean;
  onClose: () => void;
  onSent: (message: string) => Promise<void> | void;
};

/**
 * The shop's correction of a clearly wrong colour estimate, sent as a change
 * request for the client to approve (gridgo-api docs/COLOUR_PRICING_API.md,
 * "Operations, order evidence and corrections"). The shop never prints at a
 * different price than the client agreed.
 *
 * Every page is listed with what GRIDGO measured. The shop changes the
 * reading of the pages it inspected and sets its own sheet rate for each;
 * the tier follows the reading under the original thresholds. The extra is
 * worked out here only to show it: the server derives it again from the
 * pages. A lower total is a refund, which goes through the GRIDGO Team.
 */
export function ColourCorrectionDialog({ job, lineItemId, open, onClose, onSent }: Props) {
  const lines = correctableColourLines(job);
  const line = lines.find((entry) => entry.item.id === lineItemId) ?? lines[0] ?? null;
  const quote = line?.quote ?? null;

  const [rows, setRows] = useState<CorrectionDraftRow[]>([]);
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keys = useCommandKeys();

  useEffect(() => {
    if (!open) return;
    setRows(quote ? correctionDraft(quote) : []);
    setReason("");
    setShowErrors(false);
    setConfirming(false);
    setError(null);
    // Reset only when the dialog opens or the line changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line?.item.id]);

  const limit = quote ? quoteA3Limit(quote) : 0;
  const tierSet = quote?.tierSet ?? "large_format";
  /** The shop's own rate per tier on this paper, from the pages GRIDGO priced. */
  const knownRates = useMemo(() => {
    const out = new Map<string, number>();
    for (const page of quote?.pages ?? []) {
      if (page.tier && page.sheetPriceMinor != null) out.set(page.tier, page.sheetPriceMinor);
    }
    return out;
  }, [quote]);

  if (!line || !quote) return null;
  const baseline = correctionBaseline(quote, line.item.agreedColourCorrection ?? null);
  const read = readCorrection(quote, rows, baseline ?? 0);
  const reasonProblem = changeReasonError(reason);
  const draftProblem = !read.ok
    ? read.problem
    : baseline == null
      ? "This job has no complete colour price to correct. Contact the GRIDGO Team."
      : !read.changed
        ? "Change the reading or price of at least one page."
        : read.extraMinor < 0
          ? "These prices come to less than the client paid. A lower price is a refund: contact the GRIDGO Team, who refund the client through Operations."
          : null;

  function setRow(index: number, patch: Partial<CorrectionDraftRow>) {
    setRows((current) =>
      current.map((row, at) => {
        if (at !== index) return row;
        const next = { ...row, ...patch };
        // A new reading in another tier takes the shop's rate for that tier,
        // when one of the job's pages already shows it.
        if (patch.percent != null) {
          const before = tierOf(row.percent);
          const after = tierOf(patch.percent);
          const rate = after ? knownRates.get(after) : undefined;
          if (after && after !== before && rate != null) next.price = minorToPesosInput(rate);
        }
        return next;
      }),
    );
  }

  function tierOf(percent: string): string | null {
    const value = Number(percent);
    if (!/^\d+(\.\d{1,2})?$/.test(percent.trim()) || value > 100) return null;
    return tierFor(Math.round(value * 100), tierSet, limit);
  }

  function review() {
    if (draftProblem || reasonProblem) {
      setShowErrors(true);
      return;
    }
    setError(null);
    setConfirming(true);
  }

  async function send() {
    if (!read.ok || !line) return;
    const body: OrderChangeInput = {
      lineItemId: line.item.id,
      reason: reason.trim(),
      colourCorrection: { pages: read.pages },
      extraPrincipalMinor: read.extraMinor,
    };
    setBusy(true);
    setError(null);
    try {
      await requestOrderChange(job.id, body, keys.keyFor(body));
      keys.reset();
      await onSent(
        read.extraMinor
          ? `Colour correction sent for ${formatPhp(read.extraMinor)} extra. The client approves or declines it.`
          : "Colour correction sent at the same price. The client approves or declines it.",
      );
    } catch (err) {
      setConfirming(false);
      setError(
        shopChangeErrorMessage(err) ?? "Could not send this correction. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const corrected = read.ok ? read.correctedLineSubtotalMinor : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{confirming ? "Send this colour correction?" : "Correct the colour price"}</DialogTitle>
          <DialogDescription>
            {confirming
              ? "The client approves or declines. Until they approve, print every page at the price agreed at checkout."
              : "GRIDGO's reading is an estimate. If a page is clearly in another tier at print size, set its reading and your price for it. The client approves the corrected price before anything changes."}
          </DialogDescription>
        </DialogHeader>

        <p className="text-body text-text-secondary m-0 tabular-nums">
          {line.item.itemName} on {quote.paperSize ?? "the chosen paper"}:{" "}
          {sheetsLine(quote.quantityMode, quote.quantity, quote.pages.length)}.
        </p>

        {confirming && read.ok ? (
          <dl className="bg-surface-variant border-outline m-0 flex flex-col gap-2 rounded-field border p-3">
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-text-muted">Pages you corrected</dt>
              <dd className="text-body text-text-primary m-0 tabular-nums">
                {read.pages
                  .filter((page) => {
                    const was = quote.pages.find((row) => row.fileId === page.fileId && row.page === page.page);
                    return !was || was.strongColourBps !== page.strongColourBps || was.sheetPriceMinor !== page.sheetPriceMinor;
                  })
                  .map(
                    (page) =>
                      `Page ${page.page}: ${bpsPercent(page.strongColourBps)}, ${formatPhp(page.sheetPriceMinor)} a sheet`,
                  )
                  .join("; ")}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-text-muted">Your line total</dt>
              <dd className="text-body text-text-primary m-0 tabular-nums">
                {formatPhp(baseline ?? 0)} to {formatPhp(read.correctedLineSubtotalMinor)}, extra{" "}
                {formatPhp(read.extraMinor)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-text-muted">Why</dt>
              <dd className="text-body text-text-secondary m-0 break-words">{reason.trim()}</dd>
            </div>
          </dl>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="border-outline overflow-x-auto rounded-field border">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-outline-subtle bg-surface-variant border-b">
                    <th scope="col" className="text-caption text-text-muted px-3 py-2 font-normal">
                      Page, as GRIDGO measured it
                    </th>
                    <th scope="col" className="text-caption text-text-muted px-2 py-2 font-normal">
                      Strong colour
                    </th>
                    <th scope="col" className="text-caption text-text-muted px-3 py-2 font-normal">
                      Your price a sheet
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quote.pages.map((page, index) => {
                    const row = rows[index];
                    if (!row) return null;
                    const tier = tierOf(row.percent);
                    const rowProblem = showErrors && !read.ok && read.page === page.page;
                    return (
                      <tr key={`${page.fileId}:${page.page}`} className="border-outline-subtle border-b last:border-b-0">
                        <th scope="row" className="px-3 py-2 align-top font-normal">
                          <span className="flex items-start gap-2">
                            <CoverageGlyph bps={page.strongColourBps} size="sm" />
                            <span className="min-w-0">
                              <span className="text-body text-text-primary block">Page {page.page}</span>
                              <span className="text-caption text-text-muted block tabular-nums">
                                {bpsPercent(page.strongColourBps)}
                                {page.sheetPriceMinor != null ? `, ${formatPhp(page.sheetPriceMinor)}` : ""}
                              </span>
                            </span>
                          </span>
                        </th>
                        <td className="px-2 py-2 align-top">
                          <div className="relative w-24">
                            <Input
                              aria-label={`Page ${page.page} strong colour percent`}
                              inputMode="decimal"
                              autoComplete="off"
                              className="pr-7 tabular-nums"
                              value={row.percent}
                              aria-invalid={rowProblem ? true : undefined}
                              onChange={(event) => setRow(index, { percent: event.target.value })}
                            />
                            <span
                              aria-hidden
                              className="text-caption text-text-muted pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
                            >
                              %
                            </span>
                          </div>
                          <span className="text-caption text-text-secondary mt-1 block">
                            {tier ? tierLabel(tier, limit) : "0 to 100"}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="relative w-32">
                            <span
                              aria-hidden
                              className="text-body text-text-secondary pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                            >
                              ₱
                            </span>
                            <Input
                              aria-label={`Page ${page.page} your price a sheet`}
                              inputMode="decimal"
                              autoComplete="off"
                              className="pl-7 tabular-nums"
                              value={row.price}
                              aria-invalid={rowProblem ? true : undefined}
                              onChange={(event) => setRow(index, { price: event.target.value })}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
              <dt className="text-body text-text-secondary">Your line total now</dt>
              <dd className="text-body text-text-primary m-0 text-right tabular-nums">
                {baseline == null ? "—" : formatPhp(baseline)}
              </dd>
              <dt className="text-body text-text-secondary">Corrected, at {quote.quantity} × each page</dt>
              <dd className="text-body text-text-primary m-0 text-right tabular-nums">
                {corrected == null ? "—" : formatPhp(corrected)}
              </dd>
              <dt className="text-body text-text-primary" style={medium}>
                Extra for your shop
              </dt>
              <dd className="text-body text-text-primary m-0 text-right tabular-nums" style={medium}>
                {read.ok && baseline != null ? formatPhp(read.extraMinor) : "—"}
              </dd>
            </dl>
            <p className="text-caption text-text-muted m-0 max-w-prose">
              GRIDGO adds its own fee on top for the client; it never comes out of your extra.
              The client pays for an increase before the job takes the new price. Your extra
              is paid with your last payout part.
            </p>

            {showErrors && draftProblem ? (
              <p className="text-body text-error m-0" role="alert">
                {draftProblem}
              </p>
            ) : null}

            <Field data-invalid={showErrors && reasonProblem ? true : undefined}>
              <FieldLabel htmlFor="colour-correction-reason">What did you see at print size?</FieldLabel>
              <Textarea
                id="colour-correction-reason"
                rows={3}
                maxLength={CHANGE_REASON_MAX}
                value={reason}
                aria-invalid={showErrors && reasonProblem ? true : undefined}
                placeholder="Page 1 has a large orange fill across the title block when printed at 20x30."
                onChange={(event) => setReason(event.target.value)}
              />
              <FieldDescription>The client reads this when they decide.</FieldDescription>
              {showErrors && reasonProblem ? <FieldError>{reasonProblem}</FieldError> : null}
            </Field>
          </div>
        )}

        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
                Not yet
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void send()}>
                {busy ? "Sending…" : "Send correction"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Not now
              </Button>
              <Button variant="primary" onClick={review}>
                Review correction
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
