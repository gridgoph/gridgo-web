import { listStaffCatalogItems, listUsers } from "@/lib/api/client";
import { readStaffShop } from "@/lib/supplier-products";

export type ShopRef = { supplierId: string; name: string };

/**
 * Every shop the team can set products up for: the staff listing index names
 * every shop with a product, and the supplier accounts fill the rest. Sorted
 * by name. Same sources as the Listing reviews desk.
 */
export async function readShops(): Promise<ShopRef[]> {
  const names = new Map<string, string>();
  const [index, suppliers] = await Promise.all([
    listStaffCatalogItems({ limit: 1 }).catch(() => null),
    listUsers("supplier").catch(() => []),
  ]);
  const shops =
    index && typeof index === "object" && "shops" in index ? (index as { shops: unknown }).shops : [];
  for (const raw of Array.isArray(shops) ? shops : []) {
    const shop = readStaffShop(raw);
    if (shop?.shopName) names.set(shop.supplierId, shop.shopName);
  }
  for (const user of suppliers) {
    const name = user.supplierName?.trim() || user.name?.trim();
    if (name && !names.has(user.id)) names.set(user.id, name);
  }
  return [...names.entries()]
    .map(([supplierId, name]) => ({ supplierId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function shopNameOf(shops: readonly ShopRef[] | null, supplierId: string | null): string {
  if (!shops) return "…";
  return (supplierId ? shops.find((s) => s.supplierId === supplierId)?.name : null) ?? "Unnamed shop";
}

export type Tree = "ops" | "admin";

export function deskHref(tree: Tree, tab?: "requests" | "templates" | "shops"): string {
  return `/${tree}/product-setup${tab && tab !== "requests" ? `?tab=${tab}` : ""}`;
}

export function templateHref(tree: Tree, id: string): string {
  return `/${tree}/product-setup/templates/${encodeURIComponent(id)}`;
}

export function shopHref(tree: Tree, supplierId: string, request?: string | null): string {
  return `/${tree}/product-setup/shops/${encodeURIComponent(supplierId)}${request ? `?request=${encodeURIComponent(request)}` : ""}`;
}
