"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";

import { SampleFrame } from "@/components/featured-prints/SampleFrame";
import { productTypeName } from "@/components/supplier-products/SupplierProductFacts";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getStaffPublicCatalogItem,
  getTaxonomy,
  isApiError,
  listStaffCatalogItems,
} from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";
import {
  FEATURED_PRINTS_MAX,
  approvedSpecLine,
  clientPriceLine,
  clientUnitLine,
  featuredPrintsErrorMessage,
  readFeaturedCard,
  type FeaturedCard,
} from "@/lib/featured-prints";
import { normalizeStaffCatalogPage } from "@/lib/supplier-products";

const PAGE_SIZE = 10;

/**
 * One search result. The staff index only supplies the ID (and a name for a
 * product that is not public yet); everything drawn for a featurable product
 * comes from its approved catalogue item, which carries no shop and no shop
 * price.
 */
type Candidate =
  | { id: string; state: "loading"; draftName: string; subcategoryCode: string }
  | { id: string; state: "ready"; card: FeaturedCard; specs: string | null }
  | { id: string; state: "not_public"; draftName: string; subcategoryCode: string }
  | { id: string; state: "failed"; draftName: string; subcategoryCode: string };

async function approvedCandidate(
  id: string,
  draftName: string,
  subcategoryCode: string,
): Promise<Candidate> {
  try {
    const body = await getStaffPublicCatalogItem(id);
    const card = readFeaturedCard(body);
    return card
      ? { id, state: "ready", card, specs: approvedSpecLine(body) }
      : { id, state: "not_public", draftName, subcategoryCode };
  } catch (err) {
    // 404: no approved, publicly available version of this listing.
    if (isApiError(err) && err.kind === "not_found") {
      return { id, state: "not_public", draftName, subcategoryCode };
    }
    return { id, state: "failed", draftName, subcategoryCode };
  }
}

export function FeaturedPrintsPicker({
  chosenIds,
  onAdd,
}: {
  chosenIds: ReadonlySet<string>;
  onAdd: (card: FeaturedCard) => void;
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const full = chosenIds.size >= FEATURED_PRINTS_MAX;

  useEffect(() => {
    getTaxonomy()
      .then(setTaxonomy)
      .catch(() => setTaxonomy(null));
  }, []);

  const readPage = useCallback(
    async (q: string, cursor: string | null, run: number) => {
      const page = normalizeStaffCatalogPage(
        await listStaffCatalogItems({ q, limit: PAGE_SIZE, cursor }),
      );
      if (run !== generation.current) return;
      const pending: Candidate[] = page.rows.map(({ listing }) => ({
        id: listing.id,
        state: "loading",
        draftName: listing.name,
        subcategoryCode: listing.subcategoryCode,
      }));
      setCandidates((current) => (cursor ? [...current, ...pending] : pending));
      setTotal(page.total);
      setNextCursor(page.nextCursor);
      await Promise.all(
        page.rows.map(async ({ listing }) => {
          const resolved = await approvedCandidate(
            listing.id,
            listing.name,
            listing.subcategoryCode,
          );
          if (run !== generation.current) return;
          setCandidates((current) =>
            current.map((row) => (row.id === resolved.id ? resolved : row)),
          );
        }),
      );
    },
    [],
  );

  const search = useCallback(
    async (q: string) => {
      const run = ++generation.current;
      setLoading(true);
      setError(null);
      try {
        await readPage(q, null, run);
      } catch (err) {
        if (run !== generation.current) return;
        setCandidates([]);
        setNextCursor(null);
        setError(featuredPrintsErrorMessage(err, "Could not search print products."));
      } finally {
        if (run === generation.current) setLoading(false);
      }
    },
    [readPage],
  );

  useEffect(() => {
    void search(query);
  }, [query, search]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim();
    if (next === query) void search(next);
    else setQuery(next);
  }

  async function showMore() {
    if (!nextCursor) return;
    const run = generation.current;
    setLoadingMore(true);
    try {
      await readPage(query, nextCursor, run);
    } catch (err) {
      setError(featuredPrintsErrorMessage(err, "Could not load more products."));
    } finally {
      setLoadingMore(false);
    }
  }

  const typeName = (code: string) => productTypeName(taxonomy, code);

  return (
    <section aria-labelledby="featured-prints-add" className="gg-card flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <h2 id="featured-prints-add" className="text-h3 text-text-primary m-0">
          Add products
        </h2>
        <p className="text-caption text-text-secondary m-0 max-w-prose">
          Only products approved for clients can be added. Check that the sample photo
          and name do not show a shop&rsquo;s logo or name.
        </p>
      </div>

      <form role="search" onSubmit={submit} aria-label="Search print products">
        <Field>
          <FieldLabel htmlFor="featured-prints-q">Search products</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="featured-prints-q"
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Product or spec, e.g. flyers"
              maxLength={80}
            />
            <Button type="submit">
              <Search aria-hidden />
              Search
            </Button>
          </div>
        </Field>
      </form>

      {full ? (
        <p className="text-caption text-text-secondary m-0" role="status">
          Home already shows {FEATURED_PRINTS_MAX} products. Remove one to add another.
        </p>
      ) : null}

      {error ? (
        <ErrorState
          title="Search did not finish"
          body={error}
          action={
            <Button type="button" onClick={() => void search(query)}>
              Search again
            </Button>
          }
        />
      ) : loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Searching">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-20 w-full rounded-card" />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <p className="text-body text-text-secondary m-0">
          {query
            ? `No print products match “${query}”.`
            : "No print products are listed yet."}
        </p>
      ) : (
        <>
          <p className="text-caption text-text-muted m-0" aria-live="polite">
            {total === 1 ? "1 listing" : `${total.toLocaleString("en-PH")} listings`}
            {query ? ` match “${query}”` : ""}
          </p>
          <ul className="flex list-none flex-col gap-2 p-0 m-0" aria-label="Search results">
            {candidates.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                typeName={typeName}
                chosen={chosenIds.has(candidate.id)}
                full={full}
                onAdd={onAdd}
              />
            ))}
          </ul>
          {nextCursor ? (
            <Button
              type="button"
              className="self-start"
              onClick={() => void showMore()}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading more…" : "Show more products"}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}

function CandidateRow({
  candidate,
  typeName,
  chosen,
  full,
  onAdd,
}: {
  candidate: Candidate;
  typeName: (code: string) => string;
  chosen: boolean;
  full: boolean;
  onAdd: (card: FeaturedCard) => void;
}) {
  if (candidate.state === "loading") {
    return (
      <li className="flex items-center gap-3 rounded-card border border-outline p-2" aria-busy="true">
        <Skeleton className="h-[60px] w-20 shrink-0 rounded-sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-body text-text-primary truncate">{candidate.draftName}</span>
          <span className="text-caption text-text-muted">Checking what clients see&hellip;</span>
        </div>
      </li>
    );
  }

  if (candidate.state !== "ready") {
    return (
      <li className="flex items-center gap-3 rounded-card border border-dashed border-outline p-2">
        <div className="w-20 shrink-0">
          <SampleFrame photo={null} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body text-text-secondary line-clamp-2">{candidate.draftName}</span>
          <span className="text-caption text-text-muted">
            {typeName(candidate.subcategoryCode)}
          </span>
          <span className="text-caption text-text-secondary">
            {candidate.state === "not_public"
              ? "Not on the client catalogue, so it cannot be featured."
              : "Could not check this product. Search again to retry."}
          </span>
        </div>
      </li>
    );
  }

  const { card, specs } = candidate;
  return (
    <li className="flex items-center gap-3 rounded-card border border-outline p-2">
      <div className="w-20 shrink-0">
        <SampleFrame photo={card.photo} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="text-body text-text-primary line-clamp-2"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {card.name}
        </span>
        <span className="text-caption text-text-secondary">
          {card.subcategoryCode ? typeName(card.subcategoryCode) : null}
        </span>
        {specs ? <span className="text-caption text-text-muted truncate">{specs}</span> : null}
        <span className="text-caption text-text-primary tabular-nums">
          {clientPriceLine(card)} {clientUnitLine(card)}
        </span>
      </div>
      <Button
        type="button"
        className="shrink-0"
        disabled={chosen || full}
        onClick={() => onAdd(card)}
        aria-label={chosen ? `${card.name} is already featured` : `Add ${card.name}`}
      >
        {chosen ? (
          "Added"
        ) : (
          <>
            <Plus aria-hidden />
            Add
          </>
        )}
      </Button>
    </li>
  );
}
