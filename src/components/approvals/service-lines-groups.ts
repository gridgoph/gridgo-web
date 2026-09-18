/**
 * Pure grouping, ordering, and filtering for the service-lines approval queue.
 * One shop block, three sections: waiting, live, suspended/withdrawn.
 */

import type { SupplierService, Taxonomy, User } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { presentZone } from "@/lib/order-state";

export type TaxonomyNames = {
  categories: Record<string, string>;
  materials: Record<string, string>;
  finishes: Record<string, string>;
};

export type ShopServiceBlock = {
  supplierId: string;
  supplier: User | null;
  shopName: string;
  contactName: string;
  phone: string;
  shopAddress: string;
  detailsUnavailable: boolean;
  verificationStatus: User["verificationStatus"];
  accountApproved: boolean;
  waitingCount: number;
  latestUpdatedAt: string;
  lines: SupplierService[];
  pendingLines: SupplierService[];
};

export type ServiceLineSection = "waiting" | "live" | "suspended";

export type ServiceLineSections = {
  waiting: ShopServiceBlock[];
  live: ShopServiceBlock[];
  suspended: ShopServiceBlock[];
};

export function isWaitingService(state: string): boolean {
  return state === "draft" || state === "pending_verification";
}

export function taxonomyNames(taxonomy: Taxonomy | null | undefined): TaxonomyNames {
  const categories: Record<string, string> = {};
  const materials: Record<string, string> = {};
  const finishes: Record<string, string> = {};
  for (const category of taxonomy?.categories ?? []) {
    categories[category.code] = category.name;
  }
  for (const material of taxonomy?.materials ?? []) {
    materials[material.code] = material.name;
  }
  for (const finish of taxonomy?.finishes ?? []) {
    finishes[finish.code] = finish.name;
  }
  return { categories, materials, finishes };
}

export function presentCategoryName(code: string, names: Record<string, string>): string {
  return names[code] ?? code.replace(/_/g, " ");
}

export function isMakeAllLiveEligible(block: ShopServiceBlock): boolean {
  return block.accountApproved && block.pendingLines.length >= 2;
}

export function sectionForBlock(block: ShopServiceBlock): ServiceLineSection {
  if (block.lines.some((line) => isWaitingService(line.state))) return "waiting";
  if (block.lines.some((line) => line.state === "live")) return "live";
  return "suspended";
}

function lineRank(state: string): number {
  if (isWaitingService(state)) return 0;
  if (state === "live") return 1;
  return 2;
}

function compareUpdatedDesc(a: { updatedAt?: string }, b: { updatedAt?: string }): number {
  return (b.updatedAt || "").localeCompare(a.updatedAt || "");
}

export function sortServiceLines(lines: SupplierService[]): SupplierService[] {
  return [...lines].sort((a, b) => {
    const rank = lineRank(a.state) - lineRank(b.state);
    if (rank !== 0) return rank;
    return compareUpdatedDesc(a, b);
  });
}

function latestUpdatedAt(lines: SupplierService[]): string {
  return lines.reduce(
    (max, line) => ((line.updatedAt || "") > max ? line.updatedAt || "" : max),
    "",
  );
}

function toBlock(
  supplierId: string,
  lines: SupplierService[],
  supplier: User | null,
): ShopServiceBlock {
  const sorted = sortServiceLines(lines);
  const pendingLines = sorted.filter((line) => isWaitingService(line.state));
  return {
    supplierId,
    supplier,
    shopName: supplier ? supplier.supplierName || supplier.name : supplierId,
    contactName: supplier?.name ?? "",
    phone: supplier?.phone ?? "",
    shopAddress: supplier?.shop?.label ?? "",
    detailsUnavailable: supplier == null,
    verificationStatus: supplier?.verificationStatus,
    accountApproved: supplier?.verificationStatus === "approved",
    waitingCount: pendingLines.length,
    latestUpdatedAt: latestUpdatedAt(sorted),
    lines: sorted,
    pendingLines,
  };
}

export function groupServiceLinesByShop(
  services: SupplierService[],
  suppliers: User[],
): ShopServiceBlock[] {
  const byId = new Map(suppliers.map((user) => [user.id, user]));
  const grouped = new Map<string, SupplierService[]>();
  for (const service of services) {
    const list = grouped.get(service.supplierId) ?? [];
    list.push(service);
    grouped.set(service.supplierId, list);
  }
  const blocks: ShopServiceBlock[] = [];
  for (const [supplierId, lines] of grouped) {
    blocks.push(toBlock(supplierId, lines, byId.get(supplierId) ?? null));
  }
  return blocks;
}

function sortWaitingShops(blocks: ShopServiceBlock[]): ShopServiceBlock[] {
  return [...blocks].sort((a, b) => {
    if (b.waitingCount !== a.waitingCount) return b.waitingCount - a.waitingCount;
    return (b.latestUpdatedAt || "").localeCompare(a.latestUpdatedAt || "");
  });
}

function sortShopsByUpdated(blocks: ShopServiceBlock[]): ShopServiceBlock[] {
  return [...blocks].sort((a, b) =>
    (b.latestUpdatedAt || "").localeCompare(a.latestUpdatedAt || ""),
  );
}

export function groupIntoSections(blocks: ShopServiceBlock[]): ServiceLineSections {
  const waiting: ShopServiceBlock[] = [];
  const live: ShopServiceBlock[] = [];
  const suspended: ShopServiceBlock[] = [];
  for (const block of blocks) {
    const section = sectionForBlock(block);
    if (section === "waiting") waiting.push(block);
    else if (section === "live") live.push(block);
    else suspended.push(block);
  }
  return {
    waiting: sortWaitingShops(waiting),
    live: sortShopsByUpdated(live),
    suspended: sortShopsByUpdated(suspended),
  };
}

function presentPricingBasis(basis: string): string {
  switch (basis) {
    case "per_sqm":
      return "Per square metre";
    case "per_pack":
      return "Per pack";
    case "per_unit":
      return "Per unit";
    case "per_hour":
      return "Per hour";
    case "per_piece":
      return "Per piece";
    default:
      return basis.replace(/_/g, " ");
  }
}

export function presentLineFacts(
  line: SupplierService,
  names: TaxonomyNames,
): string[] {
  const facts: string[] = [];
  const materialsAndFinishes = [
    ...line.materialCodes.map(
      (code) => names.materials[code] ?? code.replace(/_/g, " "),
    ),
    ...line.finishCodes.map((code) => names.finishes[code] ?? code.replace(/_/g, " ")),
  ].filter(Boolean);
  if (materialsAndFinishes.length) facts.push(materialsAndFinishes.join(", "));
  if (line.qtyMin != null || line.qtyMax != null) {
    facts.push(`${line.qtyMin ?? "—"}–${line.qtyMax ?? "—"}`);
  }
  if (Number.isFinite(line.turnaroundHours)) {
    facts.push(`${line.turnaroundHours}h`);
  }
  if (line.zones.length) {
    facts.push(line.zones.map(presentZone).join(", "));
  }
  if (line.pricingBasis || line.referenceRateMinor != null) {
    facts.push(
      `${presentPricingBasis(line.pricingBasis)} ${formatPhp(line.referenceRateMinor)}`,
    );
  }
  return facts;
}

function lineMatchesFilter(
  line: SupplierService,
  query: string,
  names: TaxonomyNames,
): boolean {
  const category = presentCategoryName(line.categoryCode, names.categories);
  if (category.toLowerCase().includes(query)) return true;
  if (line.categoryCode.replace(/_/g, " ").toLowerCase().includes(query)) return true;
  for (const zone of line.zones) {
    if (zone.toLowerCase().includes(query)) return true;
    if (presentZone(zone).toLowerCase().includes(query)) return true;
  }
  return false;
}

export function filterShopBlocks(
  blocks: ShopServiceBlock[],
  query: string,
  names: TaxonomyNames,
): ShopServiceBlock[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return blocks;
  const filtered: ShopServiceBlock[] = [];
  for (const block of blocks) {
    const shopHit = [block.shopName, block.contactName, block.supplierId]
      .join(" ")
      .toLowerCase()
      .includes(needle);
    const lines = shopHit
      ? block.lines
      : block.lines.filter((line) => lineMatchesFilter(line, needle, names));
    if (!lines.length) continue;
    filtered.push(toBlock(block.supplierId, lines, block.supplier));
  }
  return filtered;
}

export function presentServiceLineSections(
  services: SupplierService[],
  suppliers: User[],
  query: string,
  names: TaxonomyNames,
): ServiceLineSections {
  return groupIntoSections(
    filterShopBlocks(groupServiceLinesByShop(services, suppliers), query, names),
  );
}
