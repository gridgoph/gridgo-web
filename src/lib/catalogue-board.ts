import {
  LISTING_STANDING_LABEL,
  LISTING_STANDING_ORDER,
  subcategoryName,
  type BoardStanding,
  type Listing,
  type ListingStandingKind,
} from "@/lib/listings";
import type { Taxonomy } from "@/lib/api/types";

export type BoardQuery = {
  q: string;
  kind: string;
  standing: StandingFilter;
  sort: CatalogueSort;
};

/** "all", or one of the six standings the supplier app shows. */
export type StandingFilter = "all" | ListingStandingKind;
export type CatalogueSort = "board" | "name" | "price_low" | "price_high" | "fastest";

/**
 * The list endpoint's largest page. Standing is worked out here from the
 * listing, its review and readiness, not by the API, so the page reads the
 * whole board (a shop has tens of listings, not thousands) and filters it.
 */
export const PAGE_SIZE = 50;
/** Pages read before the board stops and says it is showing a part. */
export const MAX_BOARD_PAGES = 20;
export const MAX_HUNT_LENGTH = 80;

export const STANDING_OPTIONS: readonly { value: StandingFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...LISTING_STANDING_ORDER.map((kind) => ({ value: kind, label: LISTING_STANDING_LABEL[kind] })),
];

export type StandingCounts = Record<StandingFilter, number>;

/**
 * How many listings each filter shows. A Live listing with an edit under
 * review or sent back counts under Live and under that state, so the
 * choices can add up to more than All.
 */
export function standingCounts(
  standings: readonly Pick<BoardStanding, "kind" | "secondary">[],
): StandingCounts {
  const counts = { all: standings.length } as StandingCounts;
  for (const kind of LISTING_STANDING_ORDER) counts[kind] = 0;
  for (const standing of standings) {
    counts[standing.kind] += 1;
    if (standing.secondary) counts[standing.secondary] += 1;
  }
  return counts;
}

/**
 * Filters worth showing. All always stays. A status with nothing in it leaves
 * the row, unless it is the one already selected — clearing the selection out
 * from under the shop would hide where they are. `null` counts (still loading)
 * keep every status, with no zero to shout.
 */
export function standingChoices(
  counts: StandingCounts | null,
  selected: StandingFilter,
): readonly { value: StandingFilter; label: string }[] {
  return STANDING_OPTIONS.filter((option) => {
    if (option.value === "all" || option.value === selected || counts == null) return true;
    return counts[option.value] > 0;
  });
}

/**
 * Board order for scanning. What the shop still has to deal with (a send-back,
 * then something in review) comes before Live, Hidden, Taken down, and Not
 * ready yet. A live listing with an edit in review or sent back sorts with
 * that attention, and stays Live in `boardStanding`. Ties keep the order the
 * board was read in.
 */
const ATTENTION_RANK: readonly ListingStandingKind[] = [
  "needs_changes",
  "pending_review",
  "live",
  "hidden",
  "taken_down",
  "not_ready",
];

export function attentionRank(
  standing: Pick<BoardStanding, "kind" | "secondary">,
): number {
  const attention =
    standing.secondary === "needs_changes" || standing.kind === "needs_changes"
      ? "needs_changes"
      : standing.secondary === "pending_review" || standing.kind === "pending_review"
        ? "pending_review"
        : standing.kind;
  const rank = ATTENTION_RANK.indexOf(attention);
  return rank === -1 ? ATTENTION_RANK.length : rank;
}

export function orderByAttention<T>(
  rows: readonly T[],
  standingOf: (row: T) => Pick<BoardStanding, "kind" | "secondary">,
): T[] {
  return rows
    .map((row, index) => ({ row, index, rank: attentionRank(standingOf(row)) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.row);
}

export function matchesStanding(
  standing: Pick<BoardStanding, "kind" | "secondary">,
  filter: StandingFilter,
): boolean {
  return filter === "all" || standing.kind === filter || standing.secondary === filter;
}

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
  standing: "all",
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
    limit: pageSize,
    cursor,
  };
}

export const EMPTY_HUNT_SENTENCE = "Nothing on your board matches that hunt. Try a shorter word, or clear it.";
export const EMPTY_CUT_SENTENCE = "Nothing matches these filters. Clear them to see the rest of your board.";
