import { serviceMatchesCategory } from "@/app/admin/_lib/taxonomy-usage";
import type {
  PublicCatalogListing,
  PublicCatalogShop,
  SupplierService,
  SupplierServiceState,
  TaxonomyCategoryAlias,
  User,
} from "@/lib/api/types";

export type FloorListing = {
  id: string;
  name: string;
  subcategoryCode: string;
  fromPriceMinor: number | null;
  photoFileId: string | null;
};

export type FloorShop = {
  supplierId: string;
  shopName: string;
  serviceState: SupplierServiceState;
  listings: FloorListing[];
};

export type PublicShopListings = {
  supplierId: string;
  shopName: string;
  listings: FloorListing[];
};

function rank(state: SupplierServiceState): number {
  if (state === "live") return 4;
  if (state === "pending_verification") return 3;
  if (state === "suspended") return 2;
  if (state === "draft") return 1;
  return 0;
}

function strongestState(services: SupplierService[]): SupplierServiceState {
  let best: SupplierService | undefined;
  for (const service of services) {
    if (!best || rank(service.state) > rank(best.state)) best = service;
  }
  return best?.state ?? "draft";
}

function shopNameFor(
  supplierId: string,
  users: User[],
  publicRows: PublicShopListings[],
): string {
  const user = users.find((entry) => entry.id === supplierId);
  const fromUser = user?.supplierName?.trim() || user?.name?.trim();
  if (fromUser) return fromUser;
  const fromPublic = publicRows.find((row) => row.supplierId === supplierId)?.shopName?.trim();
  if (fromPublic) return fromPublic;
  return "Shop";
}

export function listingFromPublicItem(raw: PublicCatalogListing): FloorListing | null {
  const id = raw.id?.trim();
  const name = raw.name?.trim();
  if (!id || !name) return null;
  const photo = raw.photos?.find((entry) => entry.fileId)?.fileId ?? null;
  const price = raw.fromPriceMinor ?? raw.basePriceMinor ?? null;
  return {
    id,
    name,
    subcategoryCode: raw.subcategoryCode ?? "",
    fromPriceMinor: typeof price === "number" ? price : null,
    photoFileId: photo,
  };
}

export function listingsFromPublicShop(
  shop: PublicCatalogShop | null | undefined,
  subcategoryCode?: string,
): FloorListing[] {
  const items = (shop?.services ?? []).flatMap((service) => service.items ?? []);
  const listings = items
    .map(listingFromPublicItem)
    .filter((entry): entry is FloorListing => entry != null);
  if (!subcategoryCode) return listings;
  return listings.filter((entry) => entry.subcategoryCode === subcategoryCode);
}

export function assembleFloorShops(input: {
  services: SupplierService[];
  categoryCode: string;
  aliases?: TaxonomyCategoryAlias[];
  users: User[];
  publicRows: PublicShopListings[];
  subcategoryCode?: string;
}): FloorShop[] {
  const byShop = new Map<string, SupplierService[]>();
  for (const service of input.services) {
    if (!serviceMatchesCategory(service.categoryCode, input.categoryCode, input.aliases)) {
      continue;
    }
    const list = byShop.get(service.supplierId) ?? [];
    list.push(service);
    byShop.set(service.supplierId, list);
  }

  const publicByShop = new Map(input.publicRows.map((row) => [row.supplierId, row]));
  const shops: FloorShop[] = [];
  for (const [supplierId, shopServices] of byShop) {
    const publicRow = publicByShop.get(supplierId);
    let listings = publicRow?.listings ?? [];
    if (input.subcategoryCode) {
      listings = listings.filter((entry) => entry.subcategoryCode === input.subcategoryCode);
    }
    shops.push({
      supplierId,
      shopName: shopNameFor(supplierId, input.users, input.publicRows),
      serviceState: strongestState(shopServices),
      listings,
    });
  }

  shops.sort((a, b) => {
    if (a.listings.length && !b.listings.length) return -1;
    if (!a.listings.length && b.listings.length) return 1;
    return a.shopName.localeCompare(b.shopName);
  });
  return shops;
}

export function floorHeadline(
  shops: FloorShop[],
  jobName?: string,
): { title: string; body: string } {
  const onBoard = shops.filter((shop) => shop.listings.length > 0).length;
  const listingCount = shops.reduce((sum, shop) => sum + shop.listings.length, 0);
  const job = jobName ?? "this work";
  if (shops.length === 0) {
    return {
      title: "No shops yet",
      body: `No shop is accredited here. When Operations accredits a shop on this category, it can file ${job}.`,
    };
  }
  const shopBit = `${shops.length} shop${shops.length === 1 ? "" : "s"} accredited`;
  if (listingCount === 0) {
    return {
      title: shopBit,
      body: `None have a ${job} listing on the board yet.`,
    };
  }
  return {
    title: shopBit,
    body: `${listingCount} listing${listingCount === 1 ? "" : "s"} on the board from ${onBoard} shop${onBoard === 1 ? "" : "s"}.`,
  };
}
