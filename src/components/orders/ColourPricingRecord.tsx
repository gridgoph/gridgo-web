"use client";

/**
 * Each page's strong colour, tier and sheet price on an order line, as
 * GRIDGO measured it at checkout (issue report 0BE07331; contract gridgo-api
 * docs/COLOUR_PRICING_API.md, "Operations, order evidence and corrections").
 *
 * The result is frozen with the order: it is the evidence in a price dispute,
 * and a later threshold, listing or file change never rewrites it. The GRIDGO
 * Team reads it at the quality check beside the file, with both the shop's
 * rate and the client's all-in rate; the shop reads its own rates on the job.
 * A correction the client agreed to is shown under the original, never in
 * place of it.
 *
 * Renders nothing when no line carries a colour reading.
 */

import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import { CoverageGlyph } from "@/components/colour/CoverageGlyph";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Order, ProductionItem } from "@/lib/api/types";
import {
  bpsPercent,
  quantityModeLabel,
  quoteA3Limit,
  readColourQuote,
  sheetsLine,
  tierLabel,
  type ColourPage,
  type ColourQuote,
} from "@/lib/colour-pricing";
import { formatDateTime, formatPhp } from "@/lib/format";
import { cn } from "@/lib/utils";

const medium = { fontFamily: "var(--font-medium)" } as const;

/** Long documents start folded so the decision stays on screen. */
const FOLDED_PAGES = 12;

type Audience = "staff" | "shop";

export function colourItems(
  order: Pick<Order, "productionItems">,
): Array<{ item: ProductionItem; quote: ColourQuote }> {
  return (order.productionItems ?? []).flatMap((item) => {
    const quote = readColourQuote(item.colourPricing);
    return quote && quote.pages.length ? [{ item, quote }] : [];
  });
}

export function ColourPricingRecord({
  order,
  audience,
  className,
}: {
  order: Pick<Order, "productionItems">;
  audience: Audience;
  className?: string;
}) {
  const items = colourItems(order);
  if (!items.length) return null;
  const named = (order.productionItems ?? []).length > 1;
  return (
    <div className={cn("flex flex-col gap-3", className)} data-testid="colour-pricing-record">
      {items.map(({ item, quote }) => (
        <LineRecord
          key={item.id}
          item={item}
          quote={quote}
          audience={audience}
          title={named ? `Colour pricing · ${item.itemName}` : "Colour pricing"}
        />
      ))}
    </div>
  );
}

function LineRecord({
  item,
  quote,
  audience,
  title,
}: {
  item: ProductionItem;
  quote: ColourQuote;
  audience: Audience;
  title: string;
}) {
  const priced = quote.pricedByColour;
  const correction = item.agreedColourCorrection ? readColourQuote(item.agreedColourCorrection) : null;
  const pages = quote.pages.length;
  const quantity = quote.quantity;
  return (
    <section
      aria-label={title}
      className="border-outline @container flex flex-col gap-3 rounded-card border p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-caption text-text-muted">{title}</span>
          <span className="text-body-lg text-text-primary" style={medium}>
            {priced
              ? `${quote.paperSize ?? "Paper"}, priced by strong colour`
              : "One colour service, fixed price"}
          </span>
          <span className="text-body text-text-secondary tabular-nums">
            {sheetsLine(quote.quantityMode, quantity, pages)}
            {quote.quantityMode ? ` (${quantityModeLabel(quote.quantityMode).toLowerCase()})` : ""}
          </span>
        </div>
        <StatusChip tone="info" icon="circle-help" label="Estimate" />
      </div>

      {quote.warning ? (
        <p className="border-warning text-body text-text-primary m-0 flex items-start gap-2 rounded-field border p-2">
          <TriangleAlert size={16} aria-hidden className="text-warning mt-0.5 shrink-0" />
          <span className="min-w-0">
            The client was told: &ldquo;{quote.warning}&rdquo;
          </span>
        </p>
      ) : null}

      <PageTable quote={quote} audience={audience} />

      {priced ? <Totals quote={quote} audience={audience} label="Line total" /> : null}

      {correction ? (
        <div className="border-outline-subtle flex flex-col gap-2 border-t pt-3">
          <p className="text-body text-text-primary m-0" style={medium}>
            Corrected by the shop, agreed by the client
            {item.agreedColourCorrection?.appliedAt
              ? ` ${formatDateTime(item.agreedColourCorrection.appliedAt)}`
              : ""}
          </p>
          <p className="text-caption text-text-secondary m-0 max-w-prose">
            The shop inspected the pages at print size and the client approved and paid for
            the corrected prices. The reading above stays as GRIDGO measured it.
          </p>
          <PageTable quote={{ ...correction, request: quote.request }} audience={audience} />
          <Totals quote={correction} audience={audience} label="Corrected line total" />
        </div>
      ) : null}

      <p className="text-caption text-text-muted m-0 max-w-prose">
        Strong colour is the share of the whole sheet, margins included, in saturated
        colour, measured on the paper and layout the client chose. Saved with the order as
        price evidence; later setting or listing changes never rewrite it. If a page is
        clearly in another tier, the shop sends a change request with the corrected price.
      </p>
    </section>
  );
}

function PageTable({ quote, audience }: { quote: ColourQuote; audience: Audience }) {
  const [open, setOpen] = useState(false);
  const limit = quoteA3Limit(quote);
  const staff = audience === "staff" && quote.pricedByColour;
  const rows = open ? quote.pages : quote.pages.slice(0, FOLDED_PAGES);
  const files = [...new Set(quote.pages.map((page) => page.fileId))];
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-outline-subtle border-b">
            <th scope="col" className="text-caption text-text-muted py-1.5 pr-2 font-normal">
              Page
            </th>
            <th scope="col" className="text-caption text-text-muted py-1.5 pr-2 text-right font-normal">
              Strong colour
            </th>
            {quote.pricedByColour ? (
              <>
                <th scope="col" className="text-caption text-text-muted hidden py-1.5 pr-2 font-normal @md:table-cell">
                  Tier
                </th>
                <th scope="col" className="text-caption text-text-muted py-1.5 pr-2 text-right font-normal">
                  {staff ? "Shop / sheet" : "Your price / sheet"}
                </th>
                {staff ? (
                  <th scope="col" className="text-caption text-text-muted py-1.5 text-right font-normal">
                    Client / sheet
                  </th>
                ) : null}
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((page) => (
            <PageRow
              key={`${page.fileId}:${page.page}`}
              page={page}
              limit={limit}
              priced={quote.pricedByColour}
              staff={staff}
              fileIndex={files.length > 1 ? files.indexOf(page.fileId) + 1 : 0}
            />
          ))}
        </tbody>
      </table>
      {quote.pages.length > FOLDED_PAGES ? (
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Show fewer pages" : `Show all ${quote.pages.length} pages`}
        </Button>
      ) : null}
    </div>
  );
}

function PageRow({
  page,
  limit,
  priced,
  staff,
  fileIndex,
}: {
  page: ColourPage;
  limit: number;
  priced: boolean;
  staff: boolean;
  /** Pages are numbered within their file; 0 when the line has one file. */
  fileIndex: number;
}) {
  const missing = priced && page.sheetPriceMinor == null;
  return (
    <tr className="border-outline-subtle border-b last:border-b-0" data-testid="colour-page-row">
      <th scope="row" className="py-1.5 pr-2 font-normal">
        <span className="flex items-center gap-2">
          <CoverageGlyph bps={page.strongColourBps} size="sm" />
          <span className="text-body text-text-primary whitespace-nowrap">
            Page {page.page}
            {fileIndex ? (
              <span className="text-caption text-text-muted block">File {fileIndex}</span>
            ) : null}
            {/* A narrow column (the workspace rail, a phone) drops the Tier column: name it here. */}
            {priced ? (
              <span className="text-caption text-text-secondary block whitespace-normal @md:hidden">
                {page.tier ? tierLabel(page.tier, limit) : "No tier on this paper"}
              </span>
            ) : null}
          </span>
        </span>
      </th>
      <td className="text-body text-text-primary py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">
        {bpsPercent(page.strongColourBps)}
      </td>
      {priced ? (
        <>
          <td className="text-body text-text-secondary hidden py-1.5 pr-2 @md:table-cell">
            {page.tier ? tierLabel(page.tier, limit) : "No tier on this paper"}
          </td>
          <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">
            {missing ? (
              <span className="text-body text-text-primary inline-flex items-center gap-1" style={medium}>
                <TriangleAlert size={14} aria-hidden className="text-warning shrink-0" />
                Price check
              </span>
            ) : (
              <span className="text-body text-text-primary">{formatPhp(page.sheetPriceMinor ?? 0)}</span>
            )}
          </td>
          {staff ? (
            <td className="text-body text-text-secondary py-1.5 text-right whitespace-nowrap tabular-nums">
              {page.clientSheetPriceMinor == null ? "—" : formatPhp(page.clientSheetPriceMinor)}
            </td>
          ) : null}
        </>
      ) : null}
    </tr>
  );
}

function Totals({
  quote,
  audience,
  label,
}: {
  quote: ColourQuote & { correctedLineSubtotalMinor?: number; correctedClientLineSubtotalMinor?: number | null };
  audience: Audience;
  label: string;
}) {
  const shop = quote.correctedLineSubtotalMinor ?? quote.lineSubtotalMinor ?? null;
  const client = quote.correctedClientLineSubtotalMinor ?? quote.clientLineSubtotalMinor ?? null;
  return (
    <dl className="bg-surface-variant m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-field p-2.5">
      <dt className="text-body text-text-secondary">
        {label}
        {audience === "staff" ? ", shop" : ""}
      </dt>
      <dd className="text-body text-text-primary m-0 text-right tabular-nums" style={medium}>
        {shop == null ? "Needs a price check" : formatPhp(shop)}
      </dd>
      {audience === "staff" ? (
        <>
          <dt className="text-body text-text-secondary">{label}, client all-in</dt>
          <dd className="text-body text-text-primary m-0 text-right tabular-nums" style={medium}>
            {client == null ? "—" : formatPhp(client)}
          </dd>
        </>
      ) : null}
    </dl>
  );
}
