import type { ShopRankingRow } from "@/lib/api/types";

/** The columns a row can be ordered by. Stars sort high first; price low first. */
export type SortKey = "overall" | "quality" | "speed" | "value" | "onTime" | "price";

function sortValue(row: ShopRankingRow, key: SortKey): number | null {
  switch (key) {
    case "onTime":
      return row.onTime ? row.onTime.rate : null;
    case "price":
      return row.fromPriceMinor;
    default:
      return row[key];
  }
}

/**
 * Ranked shops first, ordered by the chosen column; shops with nothing in
 * that column keep their place at the end rather than being sorted as zero.
 * The rank number itself never moves — it is the platform's order by overall
 * stars, so a shop can be read as "#4 overall but the cheapest".
 */
export function orderRows(rows: ShopRankingRow[], key: SortKey): ShopRankingRow[] {
  const ranked = rows.filter((row) => row.count > 0);
  const unranked = rows.filter((row) => row.count === 0);
  const direction = key === "price" ? 1 : -1;
  const byKey = (left: ShopRankingRow, right: ShopRankingRow) => {
    const a = sortValue(left, key);
    const b = sortValue(right, key);
    if (a == null && b == null) return (left.position ?? 0) - (right.position ?? 0);
    if (a == null) return 1;
    if (b == null) return -1;
    return (a - b) * direction || (left.position ?? 0) - (right.position ?? 0);
  };
  return [...ranked.sort(byKey), ...unranked.sort(byKey)];
}

export function formatStars(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return (Math.round(value * 10) / 10).toFixed(1);
}
