"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { PrinterMaxWidthField } from "@/app/supplier/_components/PrinterMaxWidthField";
import {
  ClientSees,
  FlowAction,
  FlowHeading,
  FlowLayout,
} from "@/components/product-templates/supplier/FlowParts";
import { MoreOptions } from "@/components/product-templates/supplier/MoreOptions";
import { PriceTable } from "@/components/product-templates/supplier/PriceTable";
import { ReadyTimeChips } from "@/components/product-templates/supplier/ReadyTimeChips";
import { templateErrorMessage } from "@/components/product-templates/supplier/errors";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { updateCatalogItem } from "@/lib/api/client";
import {
  confirmTemplateProduct,
  getTemplateProduct,
  listMyProductTemplates,
  templateReadyPreview,
  updateTemplateProduct,
} from "@/lib/api/product-templates";
import {
  needsPrinterMaxWidth,
  normalizeListing,
  parsePrinterMaxWidthFeet,
  type Listing,
} from "@/lib/listings";
import { normalizePreview } from "@/lib/production-time-choice";
import {
  draftRows,
  fromPriceLine,
  moreOptionsBlocker,
  moreOptionsBody,
  moreOptionsFrom,
  normalizeCatalogue,
  normalizePriceRows,
  priceBlocker,
  priceErrors,
  pricesBody,
  readyByLine,
  readyChipLabel,
  stockPhotoSrc,
  templateFactsOf,
  templateStanding,
  type DraftRow,
  type MoreOptionsDraft,
  type ProductTemplate,
  type ReadyTimeChip,
  type TemplateFacts,
} from "@/lib/product-templates";

type Form = {
  rows: DraftRow[];
  readyTime: string | null;
  more: MoreOptionsDraft;
  printerFeet: number | null;
};

type Product = {
  listing: Listing;
  facts: TemplateFacts;
  photoSrc: string | null;
  realPhoto: boolean;
};

/**
 * One GRIDGO template product (gridgo-supplier#268): its full price table,
 * ready time, More options and the Live / Hidden switch on one page.
 *
 * Three things a shop comes here to do, each with the one yellow action it
 * needs and no other:
 *
 * - Confirm prices the GRIDGO team prepared. Nothing goes live before this.
 *   Untouched, the action is "Confirm prices"; changed, "Save and confirm"
 *   (saving a corrected table also confirms it).
 * - Change prices. "Save changes" appears only once something changed.
 * - Hide it or make it live. A switch, instant, even during a price check.
 */
export default function TemplateProductPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [product, setProduct] = useState<Product | null>(null);
  const [template, setTemplate] = useState<ProductTemplate | null>(null);
  const [chips, setChips] = useState<ReadyTimeChip[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [initial, setInitial] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [example, setExample] = useState<{ key: string | null; line: string | null }>({
    key: null,
    line: null,
  });

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const [raw, catalogueBody] = await Promise.all([
        getTemplateProduct(id),
        listMyProductTemplates().catch(() => null),
      ]);
      const listing = normalizeListing(raw);
      const facts = templateFactsOf(raw);
      if (!listing || !facts) {
        setLoadError(
          "This product has no GRIDGO price table. Change it in the full product builder.",
        );
        return;
      }
      const catalogue = normalizeCatalogue(catalogueBody);
      // An unpriced product moved over without a template picks the one GRIDGO
      // offers for its kind of work; saving its prices records that choice.
      const sameKind = catalogue.templates.filter(
        (t) => t.subcategoryCode === listing.subcategoryCode,
      );
      const found =
        catalogue.templates.find((t) => t.id === facts.templateId) ??
        (!facts.templateId && sameKind.length === 1 ? sameKind[0]! : null);
      const item =
        raw && typeof raw === "object" ? (raw as { item?: unknown }).item : null;
      const photos =
        (item as { photos?: { realPhoto?: boolean }[] } | null)?.photos ?? [];
      setProduct({
        listing,
        facts,
        photoSrc: stockPhotoSrc(item) ?? found?.photoUrl ?? null,
        realPhoto: listing.photos.length > 0 || photos[0]?.realPhoto === true,
      });
      setChips(catalogue.readyTimes);
      setTemplate(found);
      if (!found) {
        setLoadError(
          "This product has no GRIDGO price table yet. Change it in the full product builder, or message the GRIDGO team.",
        );
        return;
      }
      const next: Form = {
        rows: draftRows(found, normalizePriceRows((raw as { prices?: unknown })?.prices)),
        readyTime: facts.readyTime,
        printerFeet: listing.printerMaxWidthFeet,
        more: moreOptionsFrom({
          minimumOrderQuantity: listing.minimumOrderQuantity,
          priceTiers: listing.priceTiers,
          speedTiers: listing.speedTiers.map((tier) => ({
            turnaroundMinutes:
              tier.turnaround.unit === "hours" ? tier.turnaround.minutes : null,
            surchargeMinor: tier.surchargeMinor,
          })),
          clientTips: facts.clientTips,
          templateTips: found.clientTips,
        }),
      };
      setForm(next);
      setInitial(JSON.stringify(next));
      setTried(false);
    } catch (err) {
      setLoadError(templateErrorMessage(err, "This product did not open."));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // GRIDGO's dated example for the chosen chip.
  const readyTime = form?.readyTime ?? null;
  useEffect(() => {
    if (!id || !readyTime) return;
    let cancelled = false;
    templateReadyPreview(id, readyTime).then(
      (raw) => {
        if (!cancelled)
          setExample({ key: readyTime, line: readyByLine(normalizePreview(raw)) });
      },
      () => {
        if (!cancelled) setExample({ key: readyTime, line: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, readyTime]);

  const errors = useMemo(() => (form ? priceErrors(form.rows) : {}), [form]);

  if (!product || !form || !template) {
    return loadError ? (
      <ErrorState
        title="This product did not open here"
        body={loadError}
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void load()}>Try again</Button>
            {id ? (
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href={`/supplier/catalogue/${encodeURIComponent(id)}`} />}
              >
                Open the full product builder
              </Button>
            ) : null}
          </div>
        }
      />
    ) : (
      <SkeletonDetail label="Opening this product" />
    );
  }

  const { listing, facts } = product;
  const dirty = JSON.stringify(form) !== initial;
  const standing = templateStanding({ ...listing, template: facts });
  const toConfirm = !facts.shopConfirmed;
  const needsPrice = facts.needsPrice;

  function problem(): string | null {
    if (!form || !template) return null;
    return (
      priceBlocker(form.rows) ??
      (needsPrinterMaxWidth(template.subcategoryCode) &&
      parsePrinterMaxWidthFeet(form.printerFeet) == null
        ? "Set how wide your printer prints, in whole feet from 1 to 20."
        : null) ??
      (!form.readyTime ? "Choose when it is ready." : null) ??
      moreOptionsBlocker(form.more)
    );
  }

  async function run(label: string, call: () => Promise<unknown>, done: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await call();
      await load();
      setNotice(done);
    } catch (err) {
      setError(templateErrorMessage(err, "This product did not change."));
      await load();
    } finally {
      setBusy(null);
    }
  }

  function save() {
    if (!form || !template || listing.version == null) return;
    if (problem()) {
      setTried(true);
      return;
    }
    void run(
      toConfirm ? "Saving and confirming…" : "Saving your prices…",
      () =>
        updateTemplateProduct(listing.id, listing.version!, {
          templateId: template.id,
          readyTime: form.readyTime,
          prices: pricesBody(form.rows),
          ...(needsPrinterMaxWidth(template.subcategoryCode)
            ? { printerMaxWidthFeet: form.printerFeet }
            : {}),
          ...moreOptionsBody(form.more),
        }),
      toConfirm || needsPrice
        ? "Saved. The GRIDGO team checks the prices today, and we tell you when it is live."
        : "Saved. New prices are for new orders only; orders already placed keep their price.",
    );
  }

  function confirm() {
    if (listing.version == null) return;
    void run(
      "Confirming prices…",
      () => confirmTemplateProduct(listing.id, listing.version!),
      "Confirmed. The GRIDGO team checks the prices today, and we tell you when it is live.",
    );
  }

  function toggleLive(next: boolean) {
    void run(
      next ? "Making it live…" : "Hiding it…",
      () => updateCatalogItem(listing.id, listing.version, { active: next }),
      next
        ? "Live. Clients can order it."
        : "Hidden. Clients cannot see it. Your prices are kept.",
    );
  }

  const action = toConfirm
    ? dirty
      ? { label: "Save and confirm", hint: "I-save ug kumpirmahon", run: save }
      : { label: "Confirm prices", hint: "Kumpirmahon ang presyo", run: confirm }
    : dirty
      ? { label: needsPrice ? "Save prices" : "Save changes", hint: "I-save", run: save }
      : null;

  return (
    <FlowLayout
      header={
        <FlowHeading title={listing.name || template.name}>
          <div className="flex flex-col gap-1">
            <div className="flex">
              <StatusChip
                tone={standing.tone}
                icon={standing.icon}
                label={standing.label}
              />
            </div>
            {standing.detail ? (
              <p className="text-caption text-text-secondary m-0">{standing.detail}</p>
            ) : null}
          </div>
        </FlowHeading>
      }
      clientSees={(compact) => (
        <ClientSees
          compact={compact}
          name={listing.name || template.name}
          photoUrl={product.photoSrc}
          photoAlt={template.photoAlt}
          priceLine={fromPriceLine(form.rows, template.unit)}
          readyLine={readyChipLabel(chips, form.readyTime)}
          realPhoto={product.realPhoto}
        />
      )}
      footNote={tried ? problem() : null}
      action={
        action ? (
          <FlowAction
            label={action.label}
            hint={action.hint}
            onClick={action.run}
            busy={busy != null}
            busyLabel={busy ?? undefined}
          />
        ) : (
          <p className="text-caption text-text-muted m-0">
            Change a price or the ready time to save.
          </p>
        )
      }
    >
      {notice ? (
        <p
          className="rounded-card border border-outline bg-surface-variant text-body text-text-primary m-0 p-3"
          role="status"
          data-testid="product-notice"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-card border-error bg-surface text-body text-text-primary m-0 border p-3"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {standing.switchable ? (
        <label className="rounded-card border border-outline bg-surface flex min-h-14 items-center gap-3 px-4 py-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className="text-body text-text-primary"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {listing.onTheBoard ? "Live" : "Hidden"}
            </span>
            <span className="text-caption text-text-muted">
              Hiding is instant. Your prices are kept.
            </span>
          </span>
          <Switch
            checked={listing.onTheBoard}
            disabled={busy != null}
            aria-label={
              listing.onTheBoard
                ? "Live. Turn off to hide it"
                : "Hidden. Turn on to make it live"
            }
            onCheckedChange={(next) => toggleLive(Boolean(next))}
          />
        </label>
      ) : null}

      <section aria-labelledby="prices-heading" className="flex flex-col gap-2">
        <h2 id="prices-heading" className="text-h3 text-text-primary m-0">
          {toConfirm ? "Prices to confirm" : "Prices"}
        </h2>
        <p className="text-caption text-text-muted m-0">
          {toConfirm
            ? "Check each price the GRIDGO team filled in. Change any that are wrong."
            : "Full price for each option you make. A new price is for new orders only."}
        </p>
        <PriceTable
          template={template}
          rows={form.rows}
          onChange={(rows) => setForm({ ...form, rows })}
          errors={errors}
          showErrors={tried}
          flagged={facts.priceCheck?.flags.map((flag) => flag.optionKey)}
        />
        {needsPrinterMaxWidth(template.subcategoryCode) ? (
          <PrinterMaxWidthField
            value={form.printerFeet}
            onChange={(printerFeet) => setForm({ ...form, printerFeet })}
          />
        ) : null}
      </section>

      <section aria-labelledby="ready-heading" className="flex flex-col gap-2">
        <h2 id="ready-heading" className="text-h3 text-text-primary m-0">
          Ready time
        </h2>
        <ReadyTimeChips
          chips={chips}
          value={form.readyTime}
          onChange={(next) => setForm({ ...form, readyTime: next })}
          example={example.key === form.readyTime ? example.line : null}
          loadingExample={form.readyTime != null && example.key !== form.readyTime}
        />
      </section>

      <MoreOptions
        value={form.more}
        onChange={(more) => setForm({ ...form, more })}
        defaultTips={template.clientTips}
        afterSave={<></>}
      />
      <Link
        href={`/supplier/catalogue/${encodeURIComponent(listing.id)}`}
        className="rounded-card border border-outline bg-surface hover:bg-overlay-hover flex min-h-14 items-center gap-3 px-3 py-2.5 no-underline"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className="text-body text-text-primary"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            Photos and extras
          </span>
          <span className="text-caption text-text-muted">
            Your own photos get a &quot;Real photo&quot; badge. Extras like lamination
            too. The GRIDGO team gives these changes its full check.
          </span>
        </span>
        <ChevronRight className="text-text-muted size-5 shrink-0" aria-hidden />
      </Link>
    </FlowLayout>
  );
}
