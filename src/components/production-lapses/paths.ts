/** The tree a shared late-production screen is mounted in; links stay inside it. */
export type LapseTree = "ops" | "admin";

export function lateProductionHref(tree: LapseTree, supplierId?: string): string {
  const base = `/${tree}/late-production`;
  return supplierId ? `${base}/${encodeURIComponent(supplierId)}` : base;
}

export function orderHref(tree: LapseTree, orderId: string): string {
  return `/${tree}/orders/${encodeURIComponent(orderId)}`;
}

export function settingsHref(tree: LapseTree): string {
  return `/${tree}/settings`;
}
