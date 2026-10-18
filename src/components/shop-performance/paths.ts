/** The tree a shared shop-performance screen is mounted in; links stay inside it. */
export type PerformanceTree = "ops" | "admin";

export function shopPerformanceHref(tree: PerformanceTree, supplierId?: string): string {
  const base = `/${tree}/shop-performance`;
  return supplierId ? `${base}/${encodeURIComponent(supplierId)}` : base;
}

export function orderHref(tree: PerformanceTree, orderId: string): string {
  return `/${tree}/orders/${encodeURIComponent(orderId)}`;
}
