"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";

import { loadShopServiceLines } from "@/app/supplier/_lib/listings-api";
import { PrinterMaxWidthField } from "@/app/supplier/_components/PrinterMaxWidthField";
import {
  ClientSees,
  FlowAction,
  FlowHeading,
  FlowLayout,
  StepTrack,
} from "@/components/product-templates/supplier/FlowParts";
import { MoreOptions } from "@/components/product-templates/supplier/MoreOptions";
import { PriceTable } from "@/components/product-templates/supplier/PriceTable";
import { ReadyTimeChips } from "@/components/product-templates/supplier/ReadyTimeChips";
import {
  TemplateTile,
  type TileState,
} from "@/components/product-templates/supplier/TemplateTile";
import { templateErrorMessage } from "@/components/product-templates/supplier/errors";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createTemplateProduct,
  isTemplatesAbsent,
  listMyProductTemplates,
  previewTemplateProduct,
} from "@/lib/api/product-templates";
import {
  needsPrinterMaxWidth,
  normalizeServiceLines,
  parsePrinterMaxWidthFeet,
  type ServiceLine,
} from "@/lib/listings";
import { normalizePreview } from "@/lib/production-time-choice";
import {
  EMPTY_MORE,
  draftRows,
  fromPriceLine,
  groupLabel,
  groupsOf,
  moreOptionsBlocker,
  moreOptionsBody,
  normalizeCatalogue,
  priceBlocker,
  priceErrors,
  pricesBody,
  readyByLine,
  readyChipLabel,
  serviceFor,
  type DraftRow,
  type MoreOptionsDraft,
  type ProductTemplate,
  type ReadyTimeChip,
} from "@/lib/product-templates";

type Step = 0 | 1 | 2;

/** One ticked product on its way through prices and ready time. */
type Draft = {
  template: ProductTemplate;
  rows: DraftRow[];
  printerFeet: number | null;
  readyTime: string | null;
  more: MoreOptionsDraft;
};

type Saved = { id: string; name: string };

const PRINTER_PROBLEM = "Set how wide your printer prints, in whole feet from 1 to 20.";

/** Search the way the API does: name, group and option words. */
function matches(template: ProductTemplate, q: string): boolean {
  const words = q.trim().toLowerCase();
  if (!words) return true;
  return `${template.name} ${groupLabel(template.group)} ${template.group} ${template.options
    .map((o) => o.label)
    .join(" ")}`
    .toLowerCase()
    .includes(words);
}

/**
 * Add a product in three screens (gridgo-supplier#268, the supplier app's
 * PR 284 on the web).
 *
 * 1. What you make: tick GRIDGO products from a photo grid.
 * 2. Prices: the full price of each option the shop makes.
 * 3. Ready time: one chip, one dated example from GRIDGO, More options folded.
 *
 * Ticking several runs steps 2 and 3 once for each ("Product 2 of 3"). Back
 * walks back through the steps before it leaves. Against an API without
 * templates this page hands over to today's builder at once.
 */
export default function AddTemplateProductPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [templates, setTemplates] = useState<ProductTemplate[] | null>(null);
  const [chips, setChips] = useState<ReadyTimeChip[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([]);

  const [ticked, setTicked] = useState<ProductTemplate[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [index, setIndex] = useState(0);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [example, setExample] = useState<{
    key: string | null;
    line: string | null;
    note: string | null;
  }>({
    key: null,
    line: null,
    note: null,
  });
  const done = saved.length > 0 && index >= drafts.length;

  /* ---------------------------------------------------------------- loading */

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [body, lines] = await Promise.all([
        listMyProductTemplates(),
        loadShopServiceLines().catch(() => ({ services: [] })),
      ]);
      const catalogue = normalizeCatalogue(body);
      if (!catalogue.templates.length) {
        router.replace("/supplier/catalogue/new");
        return;
      }
      setTemplates(catalogue.templates);
      setChips(catalogue.readyTimes);
      // Live lines first, so a product sits under the line GRIDGO matches on.
      setServices(
        normalizeServiceLines(lines).sort(
          (a, b) => Number(b.state === "live") - Number(a.state === "live"),
        ),
      );
    } catch (err) {
      if (isTemplatesAbsent(err)) {
        // An API before the release: today's builder, without a detour.
        router.replace("/supplier/catalogue/new");
        return;
      }
      setLoadError(templateErrorMessage(err, "GRIDGO's products did not load."));
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupsOf(templates ?? []), [templates]);
  const shown = useMemo(
    () => (templates ?? []).filter((t) => (!group || t.group === group) && matches(t, q)),
    [templates, group, q],
  );

  /* ------------------------------------------------------------- navigation */

  function goBack() {
    setTried(false);
    setSaveError(null);
    if (step === 2) setStep(1);
    else if (step === 1 && index > 0) {
      setIndex(index - 1);
      setStep(2);
    } else setStep(0);
  }

  /* ---------------------------------------------------------------- step 1 */

  function tileState(template: ProductTemplate): TileState {
    if (template.addedItemIds.length) return "added";
    if (!serviceFor(template, services)) return "no_service";
    return ticked.some((t) => t.id === template.id) ? "ticked" : "open";
  }

  const [serviceAsk, setServiceAsk] = useState<ProductTemplate | null>(null);

  function pressTile(template: ProductTemplate) {
    const state = tileState(template);
    if (state === "added") {
      router.push(
        `/supplier/catalogue/product/${encodeURIComponent(template.addedItemIds[0]!)}`,
      );
      return;
    }
    if (state === "no_service") {
      setServiceAsk(template);
      return;
    }
    setServiceAsk(null);
    setTicked((current) =>
      current.some((t) => t.id === template.id)
        ? current.filter((t) => t.id !== template.id)
        : [...current, template],
    );
  }

  function startPrices() {
    if (!ticked.length) {
      setTried(true);
      return;
    }
    setTried(false);
    // Keep what was already typed for a product still ticked.
    setDrafts((current) =>
      ticked.map(
        (template) =>
          current.find((d) => d.template.id === template.id) ?? {
            template,
            rows: draftRows(template),
            printerFeet: null,
            readyTime: null,
            more: EMPTY_MORE,
          },
      ),
    );
    setSaved([]);
    setIndex(0);
    setStep(1);
    window.scrollTo?.({ top: 0 });
  }

  /* ---------------------------------------------------------- steps 2 and 3 */

  const draft = drafts[index] ?? null;
  const patchDraft = useCallback(
    (next: Partial<Draft>) =>
      setDrafts((current) =>
        current.map((d, i) => (i === index ? { ...d, ...next } : d)),
      ),
    [index],
  );

  const errors = useMemo(() => (draft ? priceErrors(draft.rows) : {}), [draft]);
  const priceProblem = draft ? priceBlocker(draft.rows) : null;
  const capProblem =
    draft &&
    needsPrinterMaxWidth(draft.template.subcategoryCode) &&
    parsePrinterMaxWidthFeet(draft.printerFeet) == null
      ? PRINTER_PROBLEM
      : null;

  const body = useCallback(
    (d: Draft): Record<string, unknown> | null => {
      const service = serviceFor(d.template, services);
      if (!service) return null;
      return {
        templateId: d.template.id,
        supplierServiceId: service.id,
        readyTime: d.readyTime,
        prices: pricesBody(d.rows),
        ...(needsPrinterMaxWidth(d.template.subcategoryCode)
          ? { printerMaxWidthFeet: d.printerFeet }
          : {}),
        ...moreOptionsBody(d.more),
      };
    },
    [services],
  );

  function toReadyTime() {
    if (priceProblem || capProblem) {
      setTried(true);
      return;
    }
    setTried(false);
    setStep(2);
    window.scrollTo?.({ top: 0 });
  }

  // GRIDGO's own ready-by example, asked again whenever the chip changes.
  const previewKey =
    draft && step === 2 && draft.readyTime
      ? `${draft.template.id}|${draft.readyTime}`
      : null;
  const previewBody = useMemo(() => {
    if (!previewKey || !draft) return null;
    const request = body(draft);
    if (!request) return null;
    // More options are not part of the example: a half-typed rush must not block the date.
    return {
      templateId: request.templateId,
      supplierServiceId: request.supplierServiceId,
      readyTime: request.readyTime,
      prices: request.prices,
      ...(request.printerMaxWidthFeet != null
        ? { printerMaxWidthFeet: request.printerMaxWidthFeet }
        : {}),
    };
    // The example follows the chip only, not every keystroke in More options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  useEffect(() => {
    if (!previewKey || !previewBody) return;
    let cancelled = false;
    previewTemplateProduct(previewBody).then(
      (raw) => {
        if (!cancelled)
          setExample({
            key: previewKey,
            line: readyByLine(normalizePreview(raw)),
            note: null,
          });
      },
      () => {
        if (!cancelled)
          setExample({
            key: previewKey,
            line: null,
            note: "Clients see the date worked out on your hours.",
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [previewKey, previewBody]);

  const moreProblem = draft ? moreOptionsBlocker(draft.more) : null;

  async function save() {
    if (!draft) return;
    if (!draft.readyTime || moreProblem) {
      setTried(true);
      return;
    }
    const request = body(draft);
    if (!request) {
      setSaveError("Add this kind of work to the services you offer first.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const raw = (await createTemplateProduct(request)) as {
        item?: { id?: string };
      } | null;
      setSaved((current) => [
        ...current,
        { id: raw?.item?.id ?? "", name: draft.template.name },
      ]);
      setTried(false);
      setIndex(index + 1);
      setStep(1);
      window.scrollTo?.({ top: 0 });
    } catch (err) {
      setSaveError(templateErrorMessage(err, "This product was not saved."));
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- render */

  if (done) return <SavedScreen saved={saved} />;

  if (loadError && !templates) {
    return (
      <ErrorState
        title="GRIDGO's products did not load"
        body={loadError}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }

  const focus =
    step === 0 ? (ticked[ticked.length - 1] ?? null) : (draft?.template ?? null);
  const clientSees = (compact: boolean) => (
    <ClientSees
      compact={compact}
      name={focus?.name ?? null}
      photoUrl={focus?.photoUrl ?? null}
      photoAlt={focus?.photoAlt}
      priceLine={
        draft && step > 0 ? fromPriceLine(draft.rows, draft.template.unit) : null
      }
      readyLine={draft && step > 0 ? readyChipLabel(chips, draft.readyTime) : null}
    />
  );
  const queueLine =
    drafts.length > 1 && step > 0 && draft
      ? `Product ${index + 1} of ${drafts.length}: ${draft.template.name}`
      : null;
  const back =
    step > 0 ? (
      <Button variant="ghost" className="self-start" onClick={goBack}>
        Back
      </Button>
    ) : null;

  if (step === 0) {
    return (
      <FlowLayout
        header={
          <FlowHeading
            title="What do you make?"
            subtitle="Tick everything you print. GRIDGO fills in the name, photo and description."
          >
            <StepTrack step={0} />
          </FlowHeading>
        }
        clientSees={clientSees}
        footNote={tried && !ticked.length ? "Tick at least one product you make." : null}
        action={
          <FlowAction
            label={
              ticked.length > 1 ? `Next: prices for ${ticked.length}` : "Next: prices"
            }
            hint="Sunod"
            onClick={startPrices}
          />
        }
      >
        <Link
          href="/supplier/catalogue/setup"
          className="rounded-card border border-outline bg-surface hover:bg-overlay-hover flex min-h-14 items-center gap-3 px-4 py-3 no-underline"
          data-testid="setup-help-row"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className="text-body text-text-primary"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              Let GRIDGO set it up
            </span>
            <span className="text-caption text-text-muted">
              Send a photo of your price list, or a voice note
            </span>
          </span>
          <ChevronRight className="text-text-muted size-5" aria-hidden />
        </Link>

        <div className="relative">
          <Search
            aria-hidden
            className="text-text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            value={q}
            maxLength={120}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search products"
            aria-label="Search GRIDGO products"
            className="pl-9"
          />
        </div>

        {groups.length ? (
          <ToggleGroup
            value={[group || "all"]}
            onValueChange={(values) => {
              const next = values[0] as string | undefined;
              if (next != null) setGroup(next === "all" ? "" : next);
            }}
            variant="outline"
            spacing={0}
            aria-label="Product groups"
            className="flex flex-wrap gap-1"
          >
            {["all", ...groups].map((code) => (
              <ToggleGroupItem key={code} value={code}>
                {code === "all" ? "All" : groupLabel(code)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}

        {serviceAsk ? (
          <div
            role="status"
            className="rounded-card border-warning bg-surface flex flex-col gap-2 border p-3"
          >
            <p className="text-body text-text-primary m-0">
              GRIDGO lists {serviceAsk.name} only under a service you have. Add the
              service, then come back and tick it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link href="/supplier/services" />}>
                Open my services
              </Button>
              <Button variant="ghost" onClick={() => setServiceAsk(null)}>
                Not now
              </Button>
            </div>
          </div>
        ) : null}

        {!templates ? (
          <div
            className="grid grid-cols-2 gap-3 md:grid-cols-3 min-[1280px]:grid-cols-4"
            aria-label="Loading GRIDGO products"
          >
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="aspect-[3/4] rounded-card" />
            ))}
          </div>
        ) : shown.length ? (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 min-[1280px]:grid-cols-4">
            {shown.map((template) => (
              <li key={template.id}>
                <TemplateTile
                  template={template}
                  state={tileState(template)}
                  onPress={() => pressTile(template)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-text-secondary m-0">
            {q.trim()
              ? `Nothing called "${q.trim()}" yet.`
              : "Nothing in this group yet."}
          </p>
        )}

        {templates ? <NotInTheList /> : null}
      </FlowLayout>
    );
  }

  if (!draft) return null;
  const lastSaved = saved.length && step === 1 ? saved[saved.length - 1] : null;

  if (step === 1) {
    return (
      <FlowLayout
        header={
          <FlowHeading
            title={`Prices for ${draft.template.name}`}
            subtitle="Tick what you make and type its full price. Untick what you don't make."
          >
            {back}
            <StepTrack step={1} />
            {queueLine ? (
              <p className="text-caption text-text-secondary m-0">{queueLine}</p>
            ) : null}
          </FlowHeading>
        }
        clientSees={clientSees}
        footNote={tried ? (priceProblem ?? capProblem) : null}
        action={
          <FlowAction label="Next: ready time" hint="Sunod" onClick={toReadyTime} />
        }
      >
        {lastSaved ? (
          <p
            className="rounded-card border border-outline bg-surface-variant text-body text-text-primary m-0 p-3"
            role="status"
          >
            {lastSaved.name} is saved. The GRIDGO team checks its prices today.
          </p>
        ) : null}
        <PriceTable
          template={draft.template}
          rows={draft.rows}
          onChange={(rows) => patchDraft({ rows })}
          errors={errors}
          showErrors={tried}
        />
        {needsPrinterMaxWidth(draft.template.subcategoryCode) ? (
          <div className="flex flex-col gap-1">
            <PrinterMaxWidthField
              value={draft.printerFeet}
              onChange={(printerFeet) => patchDraft({ printerFeet })}
            />
            {tried && capProblem ? (
              <p className="text-caption text-error m-0">{capProblem}</p>
            ) : null}
          </div>
        ) : null}
        <p className="text-caption text-text-muted m-0">
          Clients pay your price plus GRIDGO&apos;s service fee, added at checkout.
        </p>
      </FlowLayout>
    );
  }

  return (
    <FlowLayout
      header={
        <FlowHeading
          title="When is it ready?"
          subtitle="Counted on your opening hours, from when the client's file is ready."
        >
          {back}
          <StepTrack step={2} />
          {queueLine ? (
            <p className="text-caption text-text-secondary m-0">{queueLine}</p>
          ) : null}
        </FlowHeading>
      }
      clientSees={clientSees}
      footNote={
        tried ? (!draft.readyTime ? "Choose when it is ready." : moreProblem) : saveError
      }
      action={
        <FlowAction
          label="Save product"
          hint="I-save"
          onClick={() => void save()}
          busy={saving}
          busyLabel="Saving your product…"
        />
      }
    >
      <ReadyTimeChips
        chips={chips}
        value={draft.readyTime}
        onChange={(readyTime) => patchDraft({ readyTime })}
        example={example.key === previewKey ? example.line : null}
        loadingExample={previewKey != null && example.key !== previewKey}
        exampleNote={example.key === previewKey ? example.note : null}
      />
      <MoreOptions
        value={draft.more}
        onChange={(more) => patchDraft({ more })}
        defaultTips={draft.template.clientTips}
      />
      <p className="text-caption text-text-muted m-0">
        The GRIDGO team checks the prices today. It goes live once they do, and we tell
        you.
      </p>
    </FlowLayout>
  );
}

/** "Not in the list?": never a dead end. Ask GRIDGO for it, or build it yourself. */
function NotInTheList() {
  return (
    <section
      aria-labelledby="not-in-list"
      className="rounded-card border border-outline bg-surface flex flex-col gap-3 p-4"
      data-testid="not-in-list"
    >
      <div className="flex flex-col gap-1">
        <h2 id="not-in-list" className="text-h3 text-text-primary m-0">
          Not in the list?
        </h2>
        <p className="text-body text-text-secondary m-0 max-w-2xl">
          Ask GRIDGO to add it: about one working day, and we tell you. Or make it
          yourself with the full product builder; the GRIDGO team reviews it before it
          goes live.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href="/supplier/catalogue/ask" />}>
          Ask GRIDGO to add it
        </Button>
        <Button nativeButton={false} render={<Link href="/supplier/catalogue/new" />}>
          Make a custom product
        </Button>
      </div>
    </section>
  );
}

/** The end of the flow: what was saved, what happens next, and the optional extras. */
function SavedScreen({ saved }: { saved: Saved[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4" data-testid="saved-screen">
      <h1 className="text-h2 text-text-primary m-0">
        {saved.length === 1
          ? `${saved[0]!.name} is saved`
          : `${saved.length} products saved`}
      </h1>
      <p className="text-body text-text-secondary m-0">
        Price check today. The GRIDGO team checks the prices, and each one goes live once
        they do. We tell you when it is live.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {saved.map(({ id, name }) => (
          <li
            key={id || name}
            className="rounded-card border border-outline bg-surface flex flex-wrap items-center gap-3 p-3"
          >
            <span
              className="text-body text-text-primary flex-1"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {name}
            </span>
            {id ? (
              <>
                <Button
                  nativeButton={false}
                  render={<Link href={`/supplier/catalogue/${encodeURIComponent(id)}`} />}
                >
                  Add your photos
                </Button>
                <Button
                  nativeButton={false}
                  render={
                    <Link
                      href={`/supplier/catalogue/product/${encodeURIComponent(id)}`}
                    />
                  }
                >
                  Open product
                </Button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-muted m-0">
        Your own photos get a &quot;Real photo&quot; badge. Extras like lamination are on
        the full product page, and the GRIDGO team checks them.
      </p>
      <Button
        variant="primary"
        className="h-auto min-h-12 flex-col gap-0 self-start py-1.5"
        nativeButton={false}
        render={<Link href="/supplier/catalogue" />}
      >
        <span>Done</span>
        <span aria-hidden className="text-caption opacity-80">
          Human na
        </span>
      </Button>
    </div>
  );
}
