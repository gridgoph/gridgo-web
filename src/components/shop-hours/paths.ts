/** The tree a shared shop-hours screen is mounted in; links stay inside it. */
export type ShopHoursTree = "ops" | "admin";

export function shopHoursHref(tree: ShopHoursTree, supplierId?: string): string {
  const base = `/${tree}/shop-hours`;
  return supplierId ? `${base}/${encodeURIComponent(supplierId)}` : base;
}
