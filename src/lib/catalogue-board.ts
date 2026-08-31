import { subcategoryName, type Listing } from "@/lib/listings";
import type { Taxonomy } from "@/lib/api/types";

export type BoardQuery = {
  q: string;
  kind: string;
  onBoard: OnBoardFilter;
  sort: CatalogueSort;
};

export type OnBoardFilter = "all" | "on_the_board" | "hidden";
export type CatalogueSort = "board" | "name" | "price_low" | "price_high" | "fastest";

export const PAGE_SIZE = 12;
export const MAX_HUNT_LENGTH = 80;

export const ON_BOARD_OPTIONS: readonly { value: OnBoardFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "on_the_board", label: "On the board" },
  { value: "hidden", label: "Hidden" },
];

export const CATALOGUE_SORTS: readonly {
  value: CatalogueSort;
  label: string;
  detail: string;
}[] = [
  { value: "board", label: "Default", detail: "The order they sit on the wall." },
  { value: "name", label: "Name", detail: "A to Z." },
  { value: "price_low", label: "Price, low to high", detail: "Cheapest quote first." },
  { value: "price_high", label: "Price, high to low", detail: "Highest quote first." },
  { value: "fastest", label: "Fastest first", detail: "Shortest ready-in at the top." },
];

export const DEFAULT_BOARD_QUERY: BoardQuery = {
  q: "",
  kind: "all",
  onBoard: "all",
  sort: "board",
};

export function isHunting(query: BoardQuery): boolean {
  return query.q.trim().length > 0;
}

export function kindsWithListings(
  listings: readonly Listing[],
  taxonomy: Taxonomy | null,
): Array<{ code: string; name: string }> {
  const seen = new Map<string, string>();
  for (const listing of listings) {
    const code = listing.subcategoryCode;
    if (!code || seen.has(code)) continue;
    seen.set(code, subcategoryName(taxonomy, code));
  }
  return [...seen.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export type CatalogListQuery = {
  q?: string | null;
  sort?: CatalogueSort;
  subcategoryCode?: string | null;
  active?: boolean | null;
  limit?: number | null;
  cursor?: string | null;
};

export function toListQuery(
  query: BoardQuery,
  cursor: string | null = null,
  pageSize = PAGE_SIZE,
): CatalogListQuery {
  return {
    q: query.q.trim() || null,
    sort: query.sort,
    subcategoryCode: query.kind === "all" ? null : query.kind,
    active: query.onBoard === "all" ? null : query.onBoard === "on_the_board",
    limit: pageSize,
    cursor,
  };
}

export const EMPTY_HUNT_SENTENCE = "Nothing on your board matches that hunt. Try a shorter word, or clear it.";
export const EMPTY_CUT_SENTENCE = "Nothing matches these filters. Clear them to see the rest of your board.";
