/**
 * The GRIDGO team's Product setup desk (gridgo-supplier#268): pure rules the
 * screens render. Contract: gridgo-api `docs/PRODUCT_TEMPLATES_API.md`.
 *
 * - Requests: shops asking for a template, or for the team to set products up.
 * - Templates: the full definition the API stores as sent (`PUT` replaces it).
 * - Shops: products prepared for one shop, and the existing-product match.
 */

import { isApiError } from "@/lib/api/client";
import { pesosToMinor } from "@/lib/format";
import type { ProductTemplate, SetupRequest, TemplateUnit } from "@/lib/product-templates";
import { minorToInput, TEMPLATE_UNITS } from "@/lib/product-templates";
import type { Listing } from "@/lib/listings";
import { timeFields } from "@/lib/production-time";

/* ------------------------------------------------------------- requests -- */

/** Waiting ones first, oldest first (they have waited longest); then the rest, newest first. */
export function orderRequests(requests: readonly SetupRequest[]): SetupRequest[] {
  const at = (r: SetupRequest) => r.createdAt ?? "";
  const waiting = requests.filter((r) => r.status === "pending").sort((a, b) => at(a).localeCompare(at(b)));
  const rest = requests
    .filter((r) => r.status !== "pending")
    .sort((a, b) => (b.updatedAt ?? at(b)).localeCompare(a.updatedAt ?? at(a)));
  return [...waiting, ...rest];
}

export function requestKindLabel(request: Pick<SetupRequest, "kind">): string {
  return request.kind === "template" ? "Add a template" : "Set up products";
}

/** The team's view of a request's status. */
export function staffRequestStatus(request: Pick<SetupRequest, "status">): string {
  if (request.status === "completed") return "Done";
  if (request.status === "needs_revision") return "Asked the shop for more";
  return "Waiting";
}

export const DECISION_REASON_MAX = 2000;

/** Ready-made words the shop reads; the reviewer can edit them. */
export function completeReasonSuggestion(request: Pick<SetupRequest, "kind">, templateName?: string | null): string {
  return request.kind === "template"
    ? `${templateName ?? "The product you asked for"} is now in the list. Open Products, Add a product, and tick it.`
    : "Your products are ready. Open Products, check each price, and confirm them so they can go live.";
}

export const NEEDS_MORE_SUGGESTIONS = [
  "We could not read the price list. Send a clearer photo, or type the prices in a message.",
  "Tell us the sizes, paper or materials you offer and the price for each.",
] as const;

/** Why the decision cannot be sent yet, or null. */
export function decisionBlocker(input: {
  request: Pick<SetupRequest, "kind">;
  status: "completed" | "needs_revision";
  reason: string;
  templateId: string | null;
}): string | null {
  if (input.status === "completed" && input.request.kind === "template" && !input.templateId)
    return "Choose the template that answers this request.";
  if (!input.reason.trim()) return "Write what the shop reads.";
  if (input.reason.trim().length > DECISION_REASON_MAX) return "Keep it under 2,000 characters.";
  return null;
}

/* ------------------------------------------------------------ templates -- */

export type OptionDraft = { key: string; label: string; specBinding: { fieldCode: string; valueCode: string } | null };
export type OptionListDraft = { name: string; values: string };

export type TemplateDraft = {
  id: string;
  isNew: boolean;
  version: number | null;
  name: string;
  description: string;
  group: string;
  categoryCode: string;
  subcategoryCode: string;
  unit: TemplateUnit;
  active: boolean;
  express: boolean;
  options: OptionDraft[];
  optionLists: OptionListDraft[];
  fileTypes: string[];
  /** One tip per line. */
  clientTips: string;
  /** Codes, comma or line separated. */
  machinesNeeded: string;
  stockPhotos: { url: string; altText: string }[];
  priceMin: string;
  priceMax: string;
};

export function emptyTemplateDraft(): TemplateDraft {
  return {
    id: "tpl_",
    isNew: true,
    version: null,
    name: "",
    description: "",
    group: "",
    categoryCode: "",
    subcategoryCode: "",
    unit: "piece",
    active: true,
    express: false,
    options: [{ key: "standard", label: "Standard", specBinding: null }],
    optionLists: [],
    fileTypes: [],
    clientTips: "",
    machinesNeeded: "",
    stockPhotos: [],
    priceMin: "",
    priceMax: "",
  };
}

export function draftFromTemplate(t: ProductTemplate): TemplateDraft {
  return {
    id: t.id,
    isNew: false,
    version: t.version,
    name: t.name,
    description: t.description,
    group: t.group,
    categoryCode: t.categoryCode,
    subcategoryCode: t.subcategoryCode,
    unit: t.unit,
    active: t.active,
    express: t.express,
    options: t.options.map((o) => ({ key: o.key, label: o.label, specBinding: o.specBinding })),
    optionLists: t.optionLists.map((l) => ({ name: l.name, values: l.options.join(", ") })),
    fileTypes: [...t.fileTypes],
    clientTips: t.clientTips.join("\n"),
    machinesNeeded: t.machinesNeeded.join(", "),
    stockPhotos: t.stockPhotos.filter((p) => p.url).map((p) => ({ url: p.url, altText: p.altText ?? t.name })),
    priceMin: t.priceRange ? minorToInput(t.priceRange.minMinor) : "",
    priceMax: t.priceRange ? minorToInput(t.priceRange.maxMinor) : "",
  };
}

function splitList(value: string, separator: RegExp): string[] {
  return value
    .split(separator)
    .map((v) => v.trim())
    .filter(Boolean);
}

const TEMPLATE_ID = /^[a-z][a-z0-9_]{0,99}$/;

type ValidationContext = {
  /** Active subcategories and their category. */
  subcategories: { code: string; categoryCode: string }[];
  /** Active accepted artwork formats. */
  formatCodes: ReadonlySet<string>;
  /** Stock photo paths the API governs. */
  photoUrls: ReadonlySet<string>;
};

/**
 * What stops the template being saved, field by field, mirroring the API's
 * checks so the team reads the fix before a `400 invalid_template_request`.
 */
export function templateErrors(draft: TemplateDraft, ctx: ValidationContext): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!TEMPLATE_ID.test(draft.id)) errors.id = "Lowercase letters, numbers and _ only, starting with a letter.";
  if (!draft.name.trim()) errors.name = "Give it a name.";
  else if (draft.name.trim().length > 120) errors.name = "Keep the name under 120 characters.";
  if (!draft.description.trim()) errors.description = "Describe it for clients.";
  else if (draft.description.trim().length > 4000) errors.description = "Keep it under 4,000 characters.";
  if (!draft.group.trim()) errors.group = "Choose a group.";
  else if (draft.group.trim().length > 80) errors.group = "Keep the group under 80 characters.";
  const sub = ctx.subcategories.find((s) => s.code === draft.subcategoryCode);
  if (!sub || sub.categoryCode !== draft.categoryCode) errors.subcategoryCode = "Choose a product type in this category.";
  if (!TEMPLATE_UNITS.includes(draft.unit)) errors.unit = "Choose how it is priced.";
  const options = draft.options;
  if (!options.length) errors.options = "Add at least one option.";
  else if (options.length > 200) errors.options = "Keep it to 200 options or fewer.";
  else {
    const keys = new Set<string>();
    const labels = new Set<string>();
    for (const o of options) {
      const key = o.key.trim();
      const label = o.label.trim();
      if (!key || key.length > 80 || !label || label.length > 100) {
        errors.options = "Every option needs a key (80 characters or fewer) and a name (100 or fewer).";
        break;
      }
      if (keys.has(key) || labels.has(label.toLowerCase())) {
        errors.options = `Each option needs its own key and name (“${label}” repeats).`;
        break;
      }
      keys.add(key);
      labels.add(label.toLowerCase());
    }
  }
  const files = draft.fileTypes;
  if (!files.length || files.length > 20) errors.fileTypes = "Choose 1 to 20 artwork formats.";
  else if (files.some((c) => !ctx.formatCodes.has(c))) errors.fileTypes = "One format is no longer offered. Untick it.";
  const tips = splitList(draft.clientTips, /\n/);
  if (!tips.length || tips.length > 20) errors.clientTips = "Write 1 to 20 tips, one per line.";
  else if (tips.some((t) => t.length > 2000)) errors.clientTips = "Keep each tip under 2,000 characters.";
  const machines = splitList(draft.machinesNeeded, /[,\n]/);
  if (!machines.length || machines.length > 20) errors.machinesNeeded = "Name 1 to 20 machines.";
  if (!draft.stockPhotos.length || draft.stockPhotos.length > 5) errors.stockPhotos = "Choose 1 to 5 photos.";
  else if (draft.stockPhotos.some((p) => !ctx.photoUrls.has(p.url))) errors.stockPhotos = "Choose photos from GRIDGO's set.";
  const min = pesosToMinor(draft.priceMin);
  const max = pesosToMinor(draft.priceMax);
  if (!min || !max) errors.priceRange = "Enter both ends of the usual price, above ₱0.";
  else if (min > max) errors.priceRange = "The low end must not be above the high end.";
  return errors;
}

/** The `template` body of `PUT /ops/product-templates/:id`: the complete definition. */
export function templateBody(draft: TemplateDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    categoryCode: draft.categoryCode,
    subcategoryCode: draft.subcategoryCode,
    group: draft.group.trim(),
    unit: draft.unit,
    active: draft.active,
    express: draft.express,
    options: draft.options.map((o) => ({
      key: o.key.trim(),
      label: o.label.trim(),
      specBinding: o.specBinding,
    })),
    optionLists: draft.optionLists
      .map((l) => ({ name: l.name.trim(), options: splitList(l.values, /,/) }))
      .filter((l) => l.name && l.options.length),
    fileTypes: [...draft.fileTypes],
    clientTips: splitList(draft.clientTips, /\n/),
    machinesNeeded: splitList(draft.machinesNeeded, /[,\n]/),
    stockPhotos: draft.stockPhotos.map((p) => ({ url: p.url, altText: p.altText.trim() || draft.name.trim() })),
    priceRange: { minMinor: pesosToMinor(draft.priceMin) ?? 0, maxMinor: pesosToMinor(draft.priceMax) ?? 0 },
  };
}

/**
 * Every combination of the option lists, joined " / " in list order, as the
 * first catalogue does. Existing options keep their keys (shops' price tables
 * point at them); new combinations get the next free `variant_n` key.
 */
export function combineOptionLists(lists: OptionListDraft[], existing: OptionDraft[]): OptionDraft[] {
  const values = lists.map((l) => splitList(l.values, /,/)).filter((v) => v.length);
  if (!values.length) return existing;
  let labels: string[] = [""];
  for (const list of values) labels = labels.flatMap((prefix) => list.map((v) => (prefix ? `${prefix} / ${v}` : v)));
  const byLabel = new Map(existing.map((o) => [o.label.trim().toLowerCase(), o]));
  const used = new Set(existing.map((o) => o.key));
  let next = 1;
  const freshKey = () => {
    if (!used.has("standard")) {
      used.add("standard");
      return "standard";
    }
    while (used.has(`variant_${next}`)) next += 1;
    const key = `variant_${next}`;
    used.add(key);
    return key;
  };
  return labels.map((label) => byLabel.get(label.toLowerCase()) ?? { key: freshKey(), label, specBinding: null });
}

/** Options a save would drop that shops may have priced. */
export function removedOptionKeys(before: OptionDraft[], after: OptionDraft[]): string[] {
  const kept = new Set(after.map((o) => o.key));
  return before.filter((o) => !kept.has(o.key)).map((o) => o.label);
}

/** Every governed stock photo already in use, the only ones the API accepts. */
export function governedPhotos(templates: readonly ProductTemplate[]): { url: string; altText: string; src: string | null }[] {
  const seen = new Map<string, { url: string; altText: string; src: string | null }>();
  for (const t of templates)
    for (const p of t.stockPhotos)
      if (p.url && !seen.has(p.url)) seen.set(p.url, { url: p.url, altText: p.altText ?? t.name, src: p.src });
  return [...seen.values()].sort((a, b) => a.altText.localeCompare(b.altText));
}

/** Group codes in use, for the group picker; a new group can be typed. */
export function knownGroups(templates: readonly ProductTemplate[]): string[] {
  return [...new Set(templates.map((t) => t.group).filter(Boolean))];
}

export function templateErrorMessage(err: unknown): string | null {
  if (!isApiError(err)) return null;
  switch (err.code) {
    case "product_template_stale":
      return "Someone else saved this template. The latest version is shown; make your change again.";
    case "invalid_template_options":
      return "Each option needs its own key and name, 200 at most.";
    case "invalid_template_request":
      return "Check the fields marked below; the API refused one of them.";
    case "invalid_spec_binding":
      return "An option points at a spec this category no longer has.";
    default:
      return null;
  }
}

/* ------------------------------------------------ product-type requests -- */

/** Pending product-type requests a template can answer: same category. */
export function requestsForTemplate<R extends { status: string; categoryCode: string }>(
  requests: readonly R[],
  template: Pick<ProductTemplate, "categoryCode">,
): R[] {
  return requests.filter((r) => r.status === "pending" && r.categoryCode === template.categoryCode);
}

export function resolveRequestsBody(
  selected: readonly { id: string; version: number }[],
): { id: string; expectedVersion: number }[] {
  return selected.map((r) => ({ id: r.id, expectedVersion: r.version }));
}

/* ---------------------------------------------------------------- shops -- */

/**
 * What a revision sends besides prices and ready time. The API clears any
 * bulk or rush offer, minimum order or shop tip that a PUT leaves out, so a
 * team revision carries the shop's own ones forward unchanged.
 */
export function keepShopExtras(
  listing: Pick<Listing, "minimumOrderQuantity" | "priceTiers" | "speedTiers" | "printerMaxWidthFeet">,
  shopTips: string[] | null,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    minimumOrderQuantity: listing.minimumOrderQuantity ?? null,
    priceTiers: listing.priceTiers.map((t) => ({ minQuantity: t.minQuantity, unitPriceMinor: t.unitPriceMinor })),
    speedTiers: listing.speedTiers.map((t) => ({
      label: t.label,
      ...timeFields("turnaround", t.turnaround),
      priceMinor: t.priceMinor,
      surchargeMinor: t.surchargeMinor,
    })),
  };
  if (shopTips?.length) body.clientTips = shopTips.join("\n");
  if (listing.printerMaxWidthFeet != null) body.printerMaxWidthFeet = listing.printerMaxWidthFeet;
  return body;
}

export function prepareErrorMessage(err: unknown): string | null {
  if (!isApiError(err)) return null;
  switch (err.code) {
    case "template_already_added":
      return "This shop already has this product. Revise its prices instead.";
    case "template_service_required":
      return "The shop has no service line for this category yet. It must add the service first.";
    case "template_price_required":
      return "Every ticked option needs a full price above ₱0.";
    case "printer_cap_required":
      return "Enter the shop's printer width in feet, 1 to 20.";
    case "catalog_item_stale":
      return "The shop changed this product meanwhile. The latest is shown; make your change again.";
    case "listing_suspended":
      return "This product is taken down. Restore it before changing prices.";
    case "product_merged":
      return "This product was merged into another. Revise the surviving product.";
    case "template_formats_unavailable":
      return "The template's artwork formats are switched off. Fix the template first.";
    case "product_template_not_found":
      return "That template is retired or gone. Choose another.";
    default:
      return null;
  }
}

/* ------------------------------------------------------------ migration -- */

export type MergeDraft = { keepId: string; sourceIds: string[]; labels: Record<string, string> };

/** The choices body: only answered ambiguities and complete merge groups. */
export function migrationChoices(
  templateMatches: Record<string, string>,
  merges: MergeDraft[],
): { templateMatches?: Record<string, string>; mergeGroups?: MergeDraft[] } {
  const matches = Object.fromEntries(Object.entries(templateMatches).filter(([, id]) => id));
  const groups = merges.filter((m) => m.keepId && m.sourceIds.length);
  return {
    ...(Object.keys(matches).length ? { templateMatches: matches } : {}),
    ...(groups.length ? { mergeGroups: groups } : {}),
  };
}

export function migrationErrorMessage(err: unknown): string | null {
  if (!isApiError(err)) return null;
  switch (err.code) {
    case "catalog_item_stale":
      return "A product changed since the preview. Preview again, then apply.";
    case "invalid_template_merge":
      return "A product can be in one merge only, with at least one other product.";
    case "catalog_item_not_found":
      return "A merge names a product this shop no longer has. Preview again.";
    default:
      return null;
  }
}

/** Plain words for a ready-time code when the chip list is not loaded. */
export function readyTimeName(chips: { code: string; label: string }[], code: string | null): string {
  return chips.find((c) => c.code === code)?.label ?? "Not set";
}
