"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, List, Plus } from "lucide-react";

import { ListingCard } from "@/app/supplier/_components/ListingCard";
import {
  listingErrorMessage,
  loadShopServiceLines,
} from "@/app/supplier/_lib/listings-api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  CATALOGUE_SORTS,
  DEFAULT_BOARD_QUERY,
  EMPTY_CUT_SENTENCE,
  EMPTY_HUNT_SENTENCE,
  MAX_BOARD_PAGES,
  MAX_HUNT_LENGTH,
  STANDING_OPTIONS,
  isHunting,
  kindsWithListings,
  matchesStanding,
  standingCounts,
  toListQuery,
  type BoardQuery,
  type CatalogueSort,
  type StandingFilter,
} from "@/lib/catalogue-board";
import {
  EMPTY_BOARD_BODY,
  EMPTY_BOARD_TITLE,
  boardContextFor,
  boardCountLine,
  boardStanding,
  normalizeBoardPage,
  normalizeListingReadiness,
  normalizeServiceLines,
  type Listing,
  type ListingReadiness,
  type ServiceLine,
} from "@/lib/listings";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ApiError,
  getSupplierReadiness,
  getTaxonomy,
  listCatalogItems,
  type CatalogListQuery,
} from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";

export default function SupplierCataloguesPage() {
  const { user } = useAuth();
  const shopApproved = user?.verificationStatus === "approved";
  const [query, setQuery] = useState<BoardQuery>(DEFAULT_BOARD_QUERY);
  const [listings, setListings] = useState<Listing[]>([]);
  const [kindSource, setKindSource] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<Map<string, ListingReadiness> | null>(null);
  const [partial, setPartial] = useState(false);
  const [view, setView] = useState<"wall" | "list">("wall");

  // Standing is not an API filter, so only the hunt, kind and sort go back to
  // the server; the standing cut is applied to what came back.
  const { q, kind, sort } = query;
  const listQuery = useMemo(
    () => toListQuery({ ...DEFAULT_BOARD_QUERY, q, kind, sort }),
    [q, kind, sort],
  );

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [board, servicesBody, tax, ready] = await Promise.all([
          readWholeBoard(listQuery),
          loadShopServiceLines().catch(() => ({ services: [] })),
          getTaxonomy(),
          // Readiness is what matching uses; without it the standing falls
          // back to the board's own checklist.
          getSupplierReadiness().then(normalizeListingReadiness, () => null),
        ]);
        setListings(board.listings);
        setTotal(board.total);
        setPartial(board.partial);
        setServices(normalizeServiceLines(servicesBody));
        setTaxonomy(tax);
        setReadiness(ready);
        if (!listQuery.q && !listQuery.subcategoryCode) {
          setKindSource(board.listings);
        }
      } catch (err) {
        setListings([]);
        setError(listingErrorMessage(err, "Could not load your board."));
        if (err instanceof ApiError && err.status === 403) {
          setError("Listings are only available to supplier accounts.");
        }
      } finally {
        setLoading(false);
      }
    }, [listQuery]),
  );

  useLiveReload(["catalog", "services"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const hunting = isHunting(query);
  const kinds = kindsWithListings(kindSource.length ? kindSource : listings, taxonomy);
  const hasBoard = kindSource.length > 0 || total > 0;

  function ask(next: Partial<BoardQuery>) {
    setQuery((current) => ({ ...current, ...next }));
  }

  const standings = useMemo(
    () =>
      listings.map((listing) =>
        boardStanding(
          listing,
          boardContextFor(listing, services),
          shopApproved,
          readiness?.get(listing.id) ?? null,
        ),
      ),
    [listings, services, shopApproved, readiness],
  );
  const counts = standingCounts(standings);
  const shown = listings.filter((_, index) => matchesStanding(standings[index], query.standing));
  const cut = query.standing !== "all" || query.kind !== "all";
  const empty = !loading && shown.length === 0;

  return (
    <div className="flex flex-col gap-5 xl:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-body text-text-secondary m-0 max-w-2xl">
          GRIDGO still decides which shop a job goes to. This is what a client is choosing
          when it comes to you.
        </p>
        <Button
          variant="primary"
          nativeButton={false}
          render={<Link href="/supplier/catalogue/new" />}
        >
          <Plus data-icon="inline-start" aria-hidden />
          Add listing
        </Button>
      </div>

      {!shopApproved ? (
        <div className="rounded-card border-outline bg-surface flex flex-col gap-1 border p-4">
          <p
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            Operations is still reviewing your shop
          </p>
          <p className="text-body text-text-secondary m-0">
            Build your board while you wait. Clients see it the moment your accreditation
            clears, and Operations wants at least one finished listing before then.
          </p>
        </div>
      ) : null}

      {hasBoard || hunting ? (
        <div className="rounded-card border-outline bg-surface flex flex-col gap-3 border p-3 lg:flex-row lg:items-center lg:gap-3">
          <Input
            value={query.q}
            maxLength={MAX_HUNT_LENGTH}
            onChange={(event) => ask({ q: event.target.value })}
            placeholder="Find a sample"
            aria-label="Find a sample"
            className="lg:min-w-0 lg:flex-1"
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Select
              value={query.kind}
              onValueChange={(value) => {
                if (typeof value === "string") ask({ kind: value });
              }}
            >
              <SelectTrigger className="w-auto min-w-40" aria-label="Kind of work">
                <SelectValue>
                  {query.kind === "all"
                    ? "All work"
                    : (kinds.find((entry) => entry.code === query.kind)?.name ??
                      "All work")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All work</SelectItem>
                  {kinds.map((entry) => (
                    <SelectItem key={entry.code} value={entry.code}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={query.sort}
              onValueChange={(value) => {
                if (typeof value === "string") ask({ sort: value as CatalogueSort });
              }}
            >
              <SelectTrigger className="w-auto min-w-40" aria-label="Sort">
                <SelectValue>
                  Sort:{" "}
                  {CATALOGUE_SORTS.find((entry) => entry.value === query.sort)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CATALOGUE_SORTS.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="ml-auto flex gap-1">
              <Button
                variant={view === "wall" ? "default" : "outline"}
                size="icon"
                aria-label="Wall of samples"
                aria-pressed={view === "wall"}
                onClick={() => setView("wall")}
              >
                <LayoutGrid aria-hidden />
              </Button>
              <Button
                variant={view === "list" ? "default" : "outline"}
                size="icon"
                aria-label="List of quotes"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {hasBoard || hunting ? (
        <StandingFilterBar
          value={query.standing}
          counts={loading ? null : counts}
          onChange={(standing) => ask({ standing })}
        />
      ) : null}

      {error ? (
        <ErrorState
          title="Your board could not load"
          body={error}
          action={<Button onClick={() => void load()}>Refresh</Button>}
        />
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Skeleton className="aspect-square rounded-card" />
          <Skeleton className="aspect-square rounded-card" />
          <Skeleton className="aspect-square rounded-card" />
          <Skeleton className="aspect-square rounded-card hidden xl:block" />
        </div>
      ) : empty ? (
        <EmptyState
          title={
            hunting
              ? "No matches"
              : cut
                ? "Nothing in this cut"
                : EMPTY_BOARD_TITLE
          }
          body={
            hunting
              ? EMPTY_HUNT_SENTENCE
              : cut
                ? EMPTY_CUT_SENTENCE
                : EMPTY_BOARD_BODY
          }
          action={
            hunting || cut ? (
              <Button onClick={() => setQuery(DEFAULT_BOARD_QUERY)}>
                Show everything
              </Button>
            ) : (
              <Button
                variant="primary"
                nativeButton={false}
                render={<Link href="/supplier/catalogue/new" />}
              >
                Add a listing
              </Button>
            )
          }
        />
      ) : view === "wall" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              taxonomy={taxonomy}
              services={services}
              shopApproved={shopApproved}
              readiness={readiness?.get(listing.id) ?? null}
            />
          ))}
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {shown.map((listing) => (
            <li key={listing.id}>
              <ListingCard
                listing={listing}
                taxonomy={taxonomy}
                services={services}
                shopApproved={shopApproved}
                readiness={readiness?.get(listing.id) ?? null}
                layout="row"
              />
            </li>
          ))}
        </ul>
      )}

      {!loading && listings.length > 0 ? (
        <p className="text-caption text-text-muted m-0">
          {query.standing === "all"
            ? `${boardCountLine(total)} on this shop.`
            : `${shown.length} of ${boardCountLine(listings.length)}.`}
          {partial ? ` Showing the first ${listings.length}; search to find the rest.` : ""}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Every page of the board for this hunt, kind and sort, in board order. The
 * API pages at 50; a shop past `MAX_BOARD_PAGES` pages is told it sees a part.
 */
async function readWholeBoard(
  query: CatalogListQuery,
): Promise<{ listings: Listing[]; total: number; partial: boolean }> {
  const listings: Listing[] = [];
  let cursor: string | null = null;
  let total = 0;
  for (let page = 0; page < MAX_BOARD_PAGES; page += 1) {
    const body = normalizeBoardPage(await listCatalogItems({ ...query, cursor }));
    listings.push(...body.listings);
    total = body.total;
    cursor = body.nextCursor;
    if (!cursor) return { listings, total, partial: false };
  }
  return { listings, total, partial: true };
}

/**
 * The six standings with how many listings each holds. Toggles from tablet up;
 * a phone gets one select so the filter never fills the first screen.
 */
function StandingFilterBar({
  value,
  counts,
  onChange,
}: {
  value: StandingFilter;
  counts: Record<StandingFilter, number> | null;
  onChange: (value: StandingFilter) => void;
}) {
  const label = (option: (typeof STANDING_OPTIONS)[number]) =>
    counts ? `${option.label} · ${counts[option.value]}` : option.label;
  return (
    <>
      <ToggleGroup
        value={[value]}
        onValueChange={(values) => {
          const next = values[0] as StandingFilter | undefined;
          if (next) onChange(next);
        }}
        variant="outline"
        spacing={0}
        aria-label="Show listings by status"
        className="hidden flex-wrap gap-1 md:flex"
      >
        {STANDING_OPTIONS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {label(option)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="md:hidden">
        <Select
          value={value}
          onValueChange={(next) => {
            if (typeof next === "string") onChange(next as StandingFilter);
          }}
        >
          <SelectTrigger className="w-full" aria-label="Show listings by status">
            <SelectValue>
              Status: {label(STANDING_OPTIONS.find((option) => option.value === value)!)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {STANDING_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {label(option)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
