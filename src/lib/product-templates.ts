import { getApiBase } from "@/lib/api/client";
import { formatPhp, pesosToMinor } from "@/lib/format";
import { manilaDateTime, manilaDayLabel } from "@/lib/production-time-choice";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/**
 * GRIDGO product templates (gridgo-supplier#268, report DC8522D2; contract
 * gridgo-api `docs/PRODUCT_TEMPLATES_API.md`). The only reader of their shapes
 * on the web, for the shop's three-step flow and for the GRIDGO team's desk.
 *
 * A template is GRIDGO's own product: name, stock photo, description, every
 * option combination, the unit it is priced in. A shop adds it by pricing the
 * combinations it makes in full. Nothing here holds a template, price or ready
 * time of its own; all of them come from the API, and an API without these
 * routes answers 404, which is how the screens know to keep today's builder.
 *
 * Plain words on every screen that uses this (the supplier app's PR 284 words):
 * a listing is a **product**, on or off the board is **Live** or **Hidden**, a
 * sample is a **photo**, and Operations is **the GRIDGO team**.
 */

export type TemplateUnit = "page" | "sheet" | "sq_ft" | "piece";
export const TEMPLATE_UNITS: readonly TemplateUnit[] = [
  "page",
  "sheet",
  "sq_ft",
  "piece",
];

export type SpecBinding = { fieldCode: string; valueCode: string };
export type TemplateOption = {
  key: string;
  label: string;
  specBinding: SpecBinding | null;
};
export type OptionList = { name: string; options: string[] };
export type StockPhoto = { url: string; altText: string | null; src: string | null };
export type PriceRange = { minMinor: number; maxMinor: number };

export type ProductTemplate = {
  id: string;
  version: number | null;
  active: boolean;
  name: string;
  description: string;
  categoryCode: string;
  subcategoryCode: string;
  group: string;
  unit: TemplateUnit;
  options: TemplateOption[];
  /** The option lists the combinations are built from ("Paper size: A4, A3"). */
  optionLists: OptionList[];
  fileTypes: string[];
  clientTips: string[];
  express: boolean;
  machinesNeeded: string[];
  stockPhotos: StockPhoto[];
  /** First stock photo's address, ready for an `<img>`. */
  photoUrl: string | null;
  photoAlt: string;
  /** Advisory usual range, a hint for the price check only, never a cap. */
  priceRange: PriceRange | null;
  /** This shop's products made from it, hidden ones included. Shop reads only. */
  addedItemIds: string[];
  /** Advisory: null when the shop named no machines. Shop reads only. */
  machineMatch: boolean | null;
};

export type ReadyTimeChip = { code: string; label: string };

export type MigrationAction = {
  action: "match" | "merge_duplicate" | "hide_unpriced" | "merge_variants" | string;
  itemId: string;
  expectedVersion: number | null;
  templateId: string | null;
  mergedInto: string | null;
  variants: {
    itemId: string;
    label: string;
    priceMinor: number;
    expectedVersion: number | null;
  }[];
};

export type MigrationManual = {
  itemId: string;
  reason: string;
  templateIds: string[];
};

export type MigrationPlan = {
  supplierId: string;
  dryRun: boolean;
  actions: MigrationAction[];
  manual: MigrationManual[];
};

/** `checkYourProducts` from `GET /me/product-templates`. */
export type CheckYourProducts = {
  /** Products hidden until the shop gives them a price. */
  unpricedItemIds: string[];
  /** Tidy-ups the GRIDGO team could make (matches, merges). Advisory. */
  suggestedCount: number;
};

export type TemplateCatalogue = {
  templates: ProductTemplate[];
  readyTimes: ReadyTimeChip[];
  check: CheckYourProducts | null;
};

export type PriceFlag = {
  optionKey: string;
  code: string;
  priceMinor: number | null;
  range: PriceRange | null;
};

/** `item.template` on a catalogue item: what it remembers of its template. */
export type TemplateFacts = {
  templateId: string | null;
  templateVersion: number | null;
  /** Priced through the full table (not only matched by the migration). */
  managed: boolean;
  /** True while the only change is prices: the price check skips the photo checks. */
  priceOnly: boolean;
  /** False while GRIDGO-prepared prices wait for the shop to confirm them. */
  shopConfirmed: boolean;
  needsPrice: boolean;
  readyTime: string | null;
  unit: TemplateUnit | null;
  clientTips: string[];
  mergedInto: string | null;
  /** Option key → catalogue option id is kept server-side; this is the reverse lookup. */
  optionKeys: Record<string, string>;
  priceCheck: {
    required: boolean;
    submittedAt: string | null;
    /** Manila day the check should be done by (same-day target). */
    targetBy: string | null;
    flags: PriceFlag[];
  } | null;
};

export type PriceRow = { optionKey: string; priceMinor: number };

export type SetupRequestKind = "template" | "setup";
export type SetupRequestStatus = "pending" | "completed" | "needs_revision";

export type SetupRequest = {
  id: string;
  supplierId: string | null;
  kind: SetupRequestKind;
  requestedName: string | null;
  message: string | null;
  fileIds: string[];
  status: SetupRequestStatus;
  reason: string | null;
  templateId: string | null;
  version: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/* --------------------------------------------------------------------------
   Reading
   -------------------------------------------------------------------------- */

type Raw = Record<string, unknown>;

function record(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Raw)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .map((v) => v.trim())
    : [];
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/**
 * A stock photo's address. GRIDGO names it by path
 * (`/product-template-photos/…jpg`, a public redirect to a signed read that
 * never expires on the page) or by a signed `downloadUrl`. A path is joined to
 * the API base; an absolute URL is used as it is, if it is http(s).
 */
export function templatePhotoUrl(url: string | null | undefined): string | null {
  const value = typeof url === "string" ? url.trim() : "";
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return `${getApiBase()}${value}`;
}

function readStockPhoto(value: unknown): StockPhoto | null {
  const raw = record(value);
  if (!raw) return null;
  const url = text(raw.url);
  // The path is stable; a signed downloadUrl expires in minutes.
  const src = templatePhotoUrl(url) ?? templatePhotoUrl(text(raw.downloadUrl));
  if (!url && !src) return null;
  return { url, altText: text(raw.altText) || null, src };
}

/** The stock photo on a catalogue item that has no photo of its own, or null. */
export function stockPhotoSrc(rawItem: unknown): string | null {
  const raw = record(rawItem);
  if (!raw) return null;
  const photos = Array.isArray(raw.photos) ? raw.photos.map(record) : [];
  const stock = photos.find(
    (p) => p && !text(p.fileId) && (text(p.url) || text(p.downloadUrl)),
  );
  if (stock)
    return templatePhotoUrl(text(stock.url)) ?? templatePhotoUrl(text(stock.downloadUrl));
  const template = record(raw.template);
  const first = (Array.isArray(template?.stockPhotos) ? template.stockPhotos : [])
    .map(readStockPhoto)
    .find(Boolean);
  return first?.src ?? null;
}

function readSpecBinding(value: unknown): SpecBinding | null {
  const raw = record(value);
  const fieldCode = text(raw?.fieldCode);
  const valueCode = text(raw?.valueCode);
  return fieldCode && valueCode ? { fieldCode, valueCode } : null;
}

function readRange(value: unknown): PriceRange | null {
  const raw = record(value);
  const minMinor = positiveInt(raw?.minMinor);
  const maxMinor = positiveInt(raw?.maxMinor);
  return minMinor && maxMinor ? { minMinor, maxMinor } : null;
}

export function normalizeTemplate(value: unknown): ProductTemplate | null {
  const raw = record(value);
  if (!raw) return null;
  const id = text(raw.id);
  const name = text(raw.name);
  if (!id || !name) return null;
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map(record)
    .filter((o): o is Raw => o != null)
    .map((o) => ({
      key: text(o.key),
      label: text(o.label),
      specBinding: readSpecBinding(o.specBinding),
    }))
    .filter((o) => o.key && o.label);
  if (!options.length) return null;
  const stockPhotos = (Array.isArray(raw.stockPhotos) ? raw.stockPhotos : [])
    .map(readStockPhoto)
    .filter((p): p is StockPhoto => p != null);
  const first = stockPhotos[0] ?? null;
  return {
    id,
    version: int(raw.version),
    active: raw.active !== false,
    name,
    description: text(raw.description),
    categoryCode: text(raw.categoryCode),
    subcategoryCode: text(raw.subcategoryCode),
    group: text(raw.group),
    unit: TEMPLATE_UNITS.includes(raw.unit as TemplateUnit)
      ? (raw.unit as TemplateUnit)
      : "piece",
    options,
    optionLists: (Array.isArray(raw.optionLists) ? raw.optionLists : [])
      .map(record)
      .filter((l): l is Raw => l != null)
      .map((l) => ({ name: text(l.name), options: strings(l.options) }))
      .filter((l) => l.name && l.options.length),
    fileTypes: strings(raw.fileTypes),
    clientTips: strings(raw.clientTips),
    express: raw.express === true,
    machinesNeeded: strings(raw.machinesNeeded),
    stockPhotos,
    photoUrl: first?.src ?? null,
    photoAlt: first?.altText || name,
    priceRange: readRange(raw.priceRange),
    addedItemIds: strings(raw.addedItemIds),
    machineMatch: typeof raw.machineMatch === "boolean" ? raw.machineMatch : null,
  };
}

function readMigrationAction(value: unknown): MigrationAction | null {
  const raw = record(value);
  const itemId = text(raw?.itemId);
  const action = text(raw?.action);
  if (!raw || !itemId || !action) return null;
  return {
    action,
    itemId,
    expectedVersion: int(raw.expectedVersion),
    templateId: text(raw.templateId) || null,
    mergedInto: text(raw.mergedInto) || null,
    variants: (Array.isArray(raw.variants) ? raw.variants : [])
      .map(record)
      .filter((v): v is Raw => v != null && text(v.itemId) !== "")
      .map((v) => ({
        itemId: text(v.itemId),
        label: text(v.label),
        priceMinor: int(v.priceMinor) ?? 0,
        expectedVersion: int(v.expectedVersion),
      })),
  };
}

function readMigrationManual(value: unknown): MigrationManual | null {
  const raw = record(value);
  const itemId = text(raw?.itemId);
  if (!raw || !itemId) return null;
  return {
    itemId,
    reason: text(raw.reason) || "manual",
    templateIds: strings(raw.templateIds),
  };
}

export function normalizeMigrationPlan(body: unknown): MigrationPlan {
  const raw = record(body) ?? {};
  return {
    supplierId: text(raw.supplierId),
    dryRun: raw.dryRun !== false,
    actions: (Array.isArray(raw.actions) ? raw.actions : [])
      .map(readMigrationAction)
      .filter((a): a is MigrationAction => a != null),
    manual: (Array.isArray(raw.manual) ? raw.manual : [])
      .map(readMigrationManual)
      .filter((m): m is MigrationManual => m != null),
  };
}

export function normalizeReadyTimes(value: unknown): ReadyTimeChip[] {
  return (Array.isArray(value) ? value : [])
    .map(record)
    .filter((c): c is Raw => c != null)
    .map((c) => ({ code: text(c.code), label: text(c.label) }))
    .filter((c) => c.code && c.label);
}

export function normalizeCatalogue(body: unknown): TemplateCatalogue {
  const raw = record(body) ?? {};
  const check = record(raw.checkYourProducts);
  return {
    templates: (Array.isArray(raw.templates) ? raw.templates : [])
      .map(normalizeTemplate)
      .filter((t): t is ProductTemplate => t != null),
    readyTimes: normalizeReadyTimes(raw.readyTimes),
    check: check
      ? {
          unpricedItemIds: strings(check.unpricedItemIds),
          suggestedCount: Array.isArray(check.actions) ? check.actions.length : 0,
        }
      : null,
  };
}

/** `item.template` from a catalogue item, or null for a custom product. */
export function readTemplateFacts(value: unknown): TemplateFacts | null {
  const raw = record(value);
  if (!raw) return null;
  const check = record(raw.priceCheck);
  const optionKeys: Record<string, string> = {};
  const keys = record(raw.optionKeys);
  if (keys)
    for (const [id, key] of Object.entries(keys))
      if (typeof key === "string") optionKeys[id] = key;
  return {
    templateId: text(raw.templateId) || null,
    templateVersion: int(raw.templateVersion),
    managed: raw.managed === true,
    priceOnly: raw.priceOnly === true,
    shopConfirmed: raw.shopConfirmed !== false,
    needsPrice: raw.needsPrice === true,
    readyTime: text(raw.readyTime) || null,
    unit: TEMPLATE_UNITS.includes(raw.unit as TemplateUnit)
      ? (raw.unit as TemplateUnit)
      : null,
    clientTips: strings(raw.clientTips),
    mergedInto: text(raw.mergedInto) || null,
    optionKeys,
    priceCheck: check
      ? {
          required: check.required === true,
          submittedAt: text(check.submittedAt) || null,
          targetBy: text(check.targetBy) || null,
          flags: (Array.isArray(check.flags) ? check.flags : [])
            .map(record)
            .filter((f): f is Raw => f != null && text(f.optionKey) !== "")
            .map((f) => ({
              optionKey: text(f.optionKey),
              code: text(f.code) || "outside_usual_range",
              priceMinor: int(f.priceMinor),
              range: readRange(f.range),
            })),
        }
      : null,
  };
}

/** `item.template` read straight off a raw catalogue item body. */
export function templateFactsOf(rawItem: unknown): TemplateFacts | null {
  const raw = record(rawItem);
  const item = record(raw?.item) ?? raw;
  return readTemplateFacts(item?.template);
}

export function normalizePriceRows(value: unknown): PriceRow[] {
  return (Array.isArray(value) ? value : [])
    .map(record)
    .filter((r): r is Raw => r != null)
    .map((r) => ({
      optionKey: text(r.optionKey),
      priceMinor: positiveInt(r.priceMinor) ?? 0,
    }))
    .filter((r) => r.optionKey);
}

const SETUP_STATUSES: readonly SetupRequestStatus[] = [
  "pending",
  "completed",
  "needs_revision",
];

export function normalizeSetupRequest(value: unknown): SetupRequest | null {
  const raw = record(value);
  if (!raw) return null;
  const id = text(raw.id);
  if (!id) return null;
  return {
    id,
    supplierId: text(raw.supplierId) || null,
    kind: raw.kind === "template" ? "template" : "setup",
    requestedName: text(raw.requestedName) || null,
    message: text(raw.message) || null,
    // File ids go into `/files/:id` paths; anything not id-shaped is dropped.
    fileIds: strings(raw.fileIds).filter((id) => /^[A-Za-z0-9_-]{1,120}$/.test(id)),
    status: SETUP_STATUSES.includes(raw.status as SetupRequestStatus)
      ? (raw.status as SetupRequestStatus)
      : "pending",
    reason: text(raw.reason) || null,
    templateId: text(raw.templateId) || null,
    version: int(raw.version),
    createdAt: text(raw.createdAt) || null,
    updatedAt: text(raw.updatedAt) || null,
  };
}

/** Newest first. The API returns its last 100 rows oldest first. */
export function normalizeSetupRequests(body: unknown): SetupRequest[] {
  const raw = record(body);
  return (Array.isArray(raw?.requests) ? raw.requests : [])
    .map(normalizeSetupRequest)
    .filter((r): r is SetupRequest => r != null)
    .reverse();
}

/* --------------------------------------------------------------------------
   Words
   -------------------------------------------------------------------------- */

/** "per page", "per sq ft". */
export function unitLabel(unit: TemplateUnit | null): string {
  switch (unit) {
    case "page":
      return "per page";
    case "sheet":
      return "per sheet";
    case "sq_ft":
      return "per sq ft";
    default:
      return "per piece";
  }
}

/** "Page", "Sq ft": the unit as a noun, for the team's editor. */
export function unitName(unit: TemplateUnit): string {
  return { page: "Page", sheet: "Sheet", sq_ft: "Sq ft", piece: "Piece" }[unit];
}

/**
 * The group chip's name. GRIDGO sends codes; an unknown one still reads as
 * words rather than as a code. Same names as the supplier app.
 */
const GROUP_NAMES: Record<string, string> = {
  documents: "Documents",
  books_binding: "Books & binding",
  marketing: "Marketing",
  large_format: "Large format",
  stickers_labels: "Stickers & labels",
  wearables: "Wearables",
  gifts: "Gifts",
  recognition: "Awards",
};

export function groupLabel(code: string): string {
  if (GROUP_NAMES[code]) return GROUP_NAMES[code];
  const words = code.replace(/_/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : "Other";
}

/** Group codes in the order GRIDGO's list first uses them. */
export function groupsOf(templates: ProductTemplate[]): string[] {
  return [...new Set(templates.map((t) => t.group).filter(Boolean))];
}

const MACHINE_NAMES: Record<string, string> = {
  document_printer: "a document printer",
  large_format_printer: "a large-format printer",
  specialist_equipment: "specialist equipment",
};

/** "Needs a large-format printer", or null when GRIDGO names nothing. */
export function machinesLine(
  template: Pick<ProductTemplate, "machinesNeeded">,
): string | null {
  const names = template.machinesNeeded.map(
    (m) => MACHINE_NAMES[m] ?? m.replace(/_/g, " "),
  );
  return names.length ? `Needs ${names.join(" and ")}` : null;
}

/* --------------------------------------------------------------------------
   Which service line a template sits under
   -------------------------------------------------------------------------- */

type ServiceLineLike = { id: string; categoryCode: string; state?: string };

/**
 * The shop's own service line for the template's category, or null.
 *
 * A template never creates a service line: a shop that does not offer the
 * category yet adds the service first. `resolve` maps a retired category code
 * to its current one (pass the taxonomy's resolver when there is one).
 */
export function serviceFor<S extends ServiceLineLike>(
  template: Pick<ProductTemplate, "categoryCode">,
  services: S[],
  resolve: (code: string) => string = (code) => code,
): S | null {
  const usable = services.filter(
    (s) => s.state !== "withdrawn" && s.state !== "rejected",
  );
  return usable.find((s) => resolve(s.categoryCode) === template.categoryCode) ?? null;
}

/* --------------------------------------------------------------------------
   The price table
   -------------------------------------------------------------------------- */

/** One row as the shop is filling it in: ticked, and the pesos as typed. */
export type DraftRow = { optionKey: string; on: boolean; price: string };

export const PRICE_REQUIRED = "Enter a price above ₱0, or untick it.";
export const PRICE_NONE_TICKED = "Tick at least one option you make.";

function typedMinor(value: string): number | null {
  const minor = pesosToMinor(value);
  return minor != null && minor > 0 ? minor : null;
}

/**
 * What is wrong with each ticked row, keyed by option.
 *
 * The ₱0 block: a ticked row with no price, a zero price, or anything that is
 * not pesos cannot be saved. GRIDGO refuses it too (`template_price_required`),
 * so this only says it sooner and on the row.
 */
export function priceErrors(rows: DraftRow[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const row of rows) {
    if (row.on && typedMinor(row.price) == null) errors[row.optionKey] = PRICE_REQUIRED;
  }
  return errors;
}

/** The first sentence that stops the table being saved, or null. */
export function priceBlocker(rows: DraftRow[]): string | null {
  if (!rows.some((r) => r.on)) return PRICE_NONE_TICKED;
  const count = Object.keys(priceErrors(rows)).length;
  if (!count) return null;
  return count === 1
    ? "One ticked option needs a price above ₱0."
    : `${count} ticked options need a price above ₱0.`;
}

/** The `prices` body: every ticked row at its full price. Call after `priceBlocker`. */
export function pricesBody(rows: DraftRow[]): PriceRow[] {
  return rows
    .filter((r) => r.on)
    .map((r) => ({ optionKey: r.optionKey, priceMinor: typedMinor(r.price) ?? 0 }));
}

/** Rows for a template, filled from a saved table when there is one. */
export function draftRows(
  template: Pick<ProductTemplate, "options">,
  saved: PriceRow[] = [],
): DraftRow[] {
  const byKey = new Map(saved.map((r) => [r.optionKey, r.priceMinor]));
  // A fresh table with a single option is ticked for the shop: there is nothing to choose.
  const only = template.options.length === 1 && saved.length === 0;
  return template.options.map((o) => {
    const minor = byKey.get(o.key);
    return {
      optionKey: o.key,
      on: minor != null || only,
      price: minor != null && minor > 0 ? minorToInput(minor) : "",
    };
  });
}

/** 1250 → "12.50", 1200 → "12". */
export function minorToInput(minor: number): string {
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  return cents ? `${whole}.${String(cents).padStart(2, "0")}` : String(whole);
}

/** "From ₱12.00 per page", for the client-sees bar. Null while nothing is priced. */
export function fromPriceLine(
  rows: DraftRow[],
  unit: TemplateUnit | null,
): string | null {
  const prices = pricesBody(rows)
    .map((r) => r.priceMinor)
    .filter((m) => m > 0);
  if (!prices.length) return null;
  const low = Math.min(...prices);
  return `${prices.length > 1 ? "From " : ""}${formatPhp(low)} ${unitLabel(unit)}`;
}

/** "From ₱12.00 per page" for a saved table. */
export function fromPriceOfRows(
  rows: PriceRow[],
  unit: TemplateUnit | null,
): string | null {
  const prices = rows.map((r) => r.priceMinor).filter((m) => m > 0);
  if (!prices.length) return null;
  return `${prices.length > 1 ? "From " : ""}${formatPhp(Math.min(...prices))} ${unitLabel(unit)}`;
}

/** Ticked option labels, in the template's order. */
export function tickedLabels(
  template: Pick<ProductTemplate, "options">,
  rows: DraftRow[],
): string[] {
  const on = new Set(rows.filter((r) => r.on).map((r) => r.optionKey));
  return template.options.filter((o) => on.has(o.key)).map((o) => o.label);
}

/** Is a ticked price outside GRIDGO's usual range? A hint, never a block. */
export function outsideUsualRange(
  template: Pick<ProductTemplate, "priceRange">,
  row: DraftRow,
): boolean {
  if (!row.on || !template.priceRange) return false;
  const minor = typedMinor(row.price);
  if (minor == null) return false;
  return minor < template.priceRange.minMinor || minor > template.priceRange.maxMinor;
}

/** "Usually ₱10.00 to ₱300.00 per sq ft". */
export function usualRangeLine(
  range: PriceRange | null,
  unit: TemplateUnit | null,
): string | null {
  if (!range) return null;
  return `Usually ${formatPhp(range.minMinor)} to ${formatPhp(range.maxMinor)} ${unitLabel(unit)}`;
}

/**
 * The value of one option list inside a combined option label. Template
 * labels join list values with " / " in list order ("Eco solvent / 10oz
 * tarpaulin / Matte"), which is what the price table's filter chips read.
 */
export function labelParts(label: string): string[] {
  return label.split(" / ").map((part) => part.trim());
}

/** Rows whose option label contains every chosen value, for the table's quick filter. */
export function rowsMatching(
  template: Pick<ProductTemplate, "options">,
  chosen: string[],
): Set<string> {
  if (!chosen.length) return new Set(template.options.map((o) => o.key));
  return new Set(
    template.options
      .filter((o) => {
        const parts = labelParts(o.label);
        return chosen.every((value) => parts.includes(value));
      })
      .map((o) => o.key),
  );
}

/* --------------------------------------------------------------------------
   More options
   -------------------------------------------------------------------------- */

export type MoreOptionsDraft = {
  minimumOrder: string;
  bulkFrom: string;
  bulkPrice: string;
  rushHours: string;
  rushFee: string;
  tips: string;
};

export const EMPTY_MORE: MoreOptionsDraft = {
  minimumOrder: "",
  bulkFrom: "",
  bulkPrice: "",
  rushHours: "",
  rushFee: "",
  tips: "",
};

function wholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** What is half-filled in More options, said as the fix. Null when it can be saved. */
export function moreOptionsBlocker(more: MoreOptionsDraft): string | null {
  if (more.minimumOrder.trim() && wholeNumber(more.minimumOrder) == null)
    return "Minimum order must be a whole number, 1 or more.";
  if (more.bulkFrom.trim() || more.bulkPrice.trim()) {
    if ((wholeNumber(more.bulkFrom) ?? 0) < 2)
      return "Bulk discount: enter how many it starts at (2 or more).";
    if (typedMinor(more.bulkPrice) == null)
      return "Bulk discount: enter the price each, above ₱0.";
  }
  if (more.rushHours.trim() || more.rushFee.trim()) {
    const hours = wholeNumber(more.rushHours);
    if (hours == null || hours > 24)
      return "Rush: enter how many hours it takes, 1 to 24.";
    if (typedMinor(more.rushFee) == null) return "Rush: enter the extra fee, above ₱0.";
  }
  if (more.tips.length > 2000)
    return "Tips for the client: keep it under 2,000 characters.";
  return null;
}

/** The More options part of a save body. Omitted bulk and rush clear them, as GRIDGO documents. */
export function moreOptionsBody(more: MoreOptionsDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    minimumOrderQuantity: wholeNumber(more.minimumOrder),
    priceTiers: [],
    speedTiers: [],
  };
  const bulkFrom = wholeNumber(more.bulkFrom);
  const bulkPrice = typedMinor(more.bulkPrice);
  if (bulkFrom && bulkFrom >= 2 && bulkPrice) {
    body.priceTiers = [{ minQuantity: bulkFrom, unitPriceMinor: bulkPrice }];
  }
  const hours = wholeNumber(more.rushHours);
  const fee = typedMinor(more.rushFee);
  if (hours && hours <= 24 && fee) {
    body.speedTiers = [
      {
        label: "Rush",
        turnaroundMinutes: hours * 60,
        priceMinor: null,
        surchargeMinor: fee,
      },
    ];
  }
  if (more.tips.trim()) body.clientTips = more.tips.trim();
  return body;
}

/** How many More options are set, for the folded header ("2 set"). */
export function moreOptionsCount(more: MoreOptionsDraft): number {
  return [
    more.minimumOrder.trim(),
    more.bulkFrom.trim() || more.bulkPrice.trim(),
    more.rushHours.trim() || more.rushFee.trim(),
    more.tips.trim(),
  ].filter(Boolean).length;
}

type SavedTier = { minQuantity: number; unitPriceMinor: number };
type SavedSpeed = { turnaroundMinutes: number | null; surchargeMinor: number | null };

/** More options as a saved product holds them. */
export function moreOptionsFrom(input: {
  minimumOrderQuantity: number | null;
  priceTiers: SavedTier[];
  speedTiers: SavedSpeed[];
  clientTips: string[];
  templateTips: string[];
}): MoreOptionsDraft {
  const bulk = input.priceTiers[0];
  const rush = input.speedTiers.find(
    (t) => t.turnaroundMinutes != null && t.surchargeMinor != null,
  );
  const tips = input.clientTips.join("\n");
  return {
    minimumOrder: input.minimumOrderQuantity ? String(input.minimumOrderQuantity) : "",
    bulkFrom: bulk ? String(bulk.minQuantity) : "",
    bulkPrice: bulk ? minorToInput(bulk.unitPriceMinor) : "",
    rushHours: rush?.turnaroundMinutes
      ? String(Math.max(1, Math.round(rush.turnaroundMinutes / 60)))
      : "",
    rushFee: rush?.surchargeMinor ? minorToInput(rush.surchargeMinor) : "",
    // GRIDGO's own tips are the default; only the shop's own words are kept here.
    tips: tips && tips !== input.templateTips.join("\n") ? tips : "",
  };
}

/* --------------------------------------------------------------------------
   Requests
   -------------------------------------------------------------------------- */

/** The shop's view of its own request. */
export function setupRequestStatus(
  request: Pick<SetupRequest, "kind" | "status">,
): string {
  switch (request.status) {
    case "completed":
      return request.kind === "template"
        ? "Added: find it in the list"
        : "Done: check your products";
    case "needs_revision":
      return "The GRIDGO team needs more from you";
    default:
      return request.kind === "template"
        ? "With the GRIDGO team, about one working day"
        : "With the GRIDGO team";
  }
}

export function setupRequestTone(status: SetupRequestStatus): {
  tone: StatusTone;
  icon: StatusIconName;
} {
  if (status === "completed") return { tone: "success", icon: "circle-check" };
  if (status === "needs_revision") return { tone: "warning", icon: "triangle-alert" };
  return { tone: "info", icon: "clock" };
}

/** Setup files GRIDGO takes (`purpose=product_setup`): images, PDF, voice notes. */
export const SETUP_FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf,audio/mp4,audio/x-m4a,audio/mpeg,audio/ogg,audio/wav,.m4a,.mp3,.ogg,.wav";
export const SETUP_FILES_MAX = 10;
export const SETUP_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const REQUEST_NAME_MAX = 120;
export const REQUEST_MESSAGE_MAX = 2000;

/* --------------------------------------------------------------------------
   Ready time
   -------------------------------------------------------------------------- */

/**
 * The one dated example under the chips: GRIDGO's own earliest ready-by for an
 * order placed now, on the shop's hours and queue. Never worked out from the
 * chip in the browser ("next day" on a Saturday is not Sunday).
 */
export function readyByLine(
  preview: { earliestReadyBy: string | null } | null,
): string | null {
  if (!preview?.earliestReadyBy) return null;
  return `Ordered now, ready by ${manilaDateTime(preview.earliestReadyBy)}`;
}

/** The chip's own words, for the client-sees bar. */
export function readyChipLabel(
  chips: ReadyTimeChip[],
  code: string | null,
): string | null {
  const chip = chips.find((c) => c.code === code);
  return chip ? `Ready: ${chip.label.toLowerCase()}` : null;
}

/* --------------------------------------------------------------------------
   Standing of a saved template product
   -------------------------------------------------------------------------- */

export type TemplateStanding = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** One sentence under the chip, or null. */
  detail: string | null;
  /** Whether the Live / Hidden switch may move. */
  switchable: boolean;
};

type StandingInput = {
  onTheBoard: boolean;
  suspendReason?: string | null;
  suspendedAt?: string | null;
  reviewStatus?: string | null;
  reviewReason?: string | null;
  hasApprovedVersion?: boolean | null;
  template?: TemplateFacts | null;
};

/**
 * Where a template product stands, in the plain words of #268: Live or Hidden,
 * and what the shop is waiting on or owes before that. Same wording as the
 * supplier app.
 */
export function templateStanding(item: StandingInput): TemplateStanding {
  const t = item.template;
  if (t?.mergedInto)
    return {
      label: "Merged",
      tone: "neutral",
      icon: "circle-dashed",
      detail: "This product was merged into another one.",
      switchable: false,
    };
  if (item.suspendReason || item.suspendedAt)
    return {
      label: "Taken down by GRIDGO",
      tone: "error",
      icon: "circle-x",
      detail: "Only the GRIDGO team can put it back. Message them to ask why.",
      switchable: false,
    };
  if (t?.needsPrice)
    return {
      label: "Needs a price",
      tone: "warning",
      icon: "triangle-alert",
      detail: "Hidden until you add its prices.",
      switchable: false,
    };
  if (t && !t.shopConfirmed)
    return {
      label: "Prices to confirm",
      tone: "warning",
      icon: "square-pen",
      detail: "The GRIDGO team filled these in. Nothing goes live until you confirm.",
      switchable: false,
    };
  if (item.reviewStatus === "needs_revision")
    return {
      label: "Needs changes",
      tone: "warning",
      icon: "square-pen",
      detail: item.reviewReason
        ? `The GRIDGO team says: ${item.reviewReason}`
        : "The GRIDGO team asked for a change.",
      switchable: true,
    };
  const checking = item.reviewStatus === "pending";
  if (!item.onTheBoard)
    return {
      label: "Hidden",
      tone: "neutral",
      icon: "circle-dashed",
      detail: checking
        ? "Clients cannot see it. The GRIDGO team is still checking its prices."
        : "Clients cannot see it. Turn it on any time.",
      switchable: true,
    };
  if (checking && item.hasApprovedVersion !== true)
    return {
      label: "Price check today",
      tone: "info",
      icon: "clock",
      detail:
        "The GRIDGO team checks the prices today. It goes live once they do, and we tell you.",
      switchable: true,
    };
  return {
    label: "Live",
    tone: "success",
    icon: "circle-check",
    detail: checking
      ? "Clients see your earlier prices until the GRIDGO team checks the new ones."
      : "Clients can order it.",
    switchable: true,
  };
}

/** Does this product open the price table rather than the full builder? */
export function opensPriceTable(template: TemplateFacts | null | undefined): boolean {
  return Boolean(template?.managed || template?.needsPrice);
}

/** "2 need a price, 1 with prices from GRIDGO to confirm. Hidden from clients until you do." */
export function checkProductsLine(counts: {
  needPrice: number;
  toConfirm: number;
}): string {
  const { needPrice, toConfirm } = counts;
  const parts = [
    needPrice ? `${needPrice} ${needPrice === 1 ? "needs" : "need"} a price` : null,
    toConfirm ? `${toConfirm} with prices from GRIDGO to confirm` : null,
  ].filter(Boolean);
  return `${parts.join(", ")}. Hidden from clients until you do.`;
}

/* --------------------------------------------------------------------------
   The GRIDGO team: price check and migration words
   -------------------------------------------------------------------------- */

/** "Today, Tue 24 Nov" / "Overdue since Mon 23 Nov": the same-day target, on Manila days. */
export function priceCheckTargetLine(
  targetBy: string | null,
  today: string,
): string | null {
  if (!targetBy) return null;
  const label = manilaDayLabel(targetBy);
  if (targetBy === today) return `Check today, ${label}`;
  if (targetBy < today) return `Overdue since ${label}`;
  return `Check by ${label}`;
}

/** Today's Manila day as `YYYY-MM-DD`. */
export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** What a migration action does, in one sentence. */
export function migrationActionLine(
  action: MigrationAction,
  templateName: (id: string | null) => string,
): string {
  switch (action.action) {
    case "match":
      return `Link to ${templateName(action.templateId)}. Prices and photos stay as they are.`;
    case "merge_duplicate":
      return "Hide this exact copy. The product it copies stays live with its orders and photos.";
    case "hide_unpriced":
      return "Hide until the shop adds a price (₱0 today).";
    case "merge_variants":
      return `Merge ${action.variants.length} products into one ${templateName(action.templateId)} with each as an option.`;
    default:
      return "Change this product.";
  }
}

/** Why the migration leaves a product alone. */
export function migrationManualLine(reason: string): string {
  switch (reason) {
    case "open_orders":
      return "Skipped: it has open orders.";
    case "merge_has_open_orders":
      return "Skipped: a product in this merge has open orders.";
    case "already_matched":
      return "Already linked to a template.";
    case "review_or_hold":
      return "Skipped: under review, on hold or taken down.";
    case "ambiguous_template":
      return "Choose which template it is.";
    case "merge_requires_manual_configuration":
      return "Cannot merge automatically: their prices or setup differ.";
    case "merge_variant_labels_required":
      return "Give each product in the merge its own option name.";
    default:
      return "Needs a person to look at it.";
  }
}

/** Skipped because of open orders: shown apart, never changed. */
export function isOpenOrderSkip(reason: string): boolean {
  return reason === "open_orders" || reason === "merge_has_open_orders";
}

/** Every version the apply call needs, from a dry run's actions. */
export function expectedVersionsOf(
  plan: Pick<MigrationPlan, "actions">,
): Record<string, number> {
  const versions: Record<string, number> = {};
  for (const action of plan.actions) {
    const rows = action.variants.length ? action.variants : [action];
    for (const row of rows)
      if (row.expectedVersion != null) versions[row.itemId] = row.expectedVersion;
  }
  return versions;
}

/**
 * Full prices of a saved template product, rebuilt from its catalogue item
 * (base + each option's modifier, keyed through `template.optionKeys`). For
 * the GRIDGO team's reads, which carry the item but not `prices`.
 */
export function priceRowsFromItem(rawItem: unknown): PriceRow[] {
  const raw = record(rawItem);
  const item = record(raw?.item) ?? raw;
  const facts = readTemplateFacts(item?.template);
  if (!item || !facts) return [];
  const base = int(item.basePriceMinor) ?? 0;
  const groups = Array.isArray(item.optionGroups) ? item.optionGroups.map(record) : [];
  const rows: PriceRow[] = [];
  for (const group of groups) {
    for (const option of Array.isArray(group?.options) ? group.options.map(record) : []) {
      if (!option || option.active === false) continue;
      const key = facts.optionKeys[text(option.id)];
      if (key)
        rows.push({
          optionKey: key,
          priceMinor: base + (int(option.priceModifierMinor) ?? 0),
        });
    }
  }
  return rows;
}
