"use client";

/**
 * Colour price checks (issue report 0BE07331; contract gridgo-api
 * docs/COLOUR_PRICING_API.md, "Operations, order evidence and corrections").
 *
 * A client's draft cart page whose strong colour lands in a tier its shop
 * left blank on that paper. The client sees "This page needs a price check"
 * instead of a price and cannot check out. GRIDGO never fills in a price: the
 * GRIDGO Team asks the shop to price the tier, and only the shop's approved
 * listing prices unlock checkout.
 *
 * The queue is grouped by listing, because the fix is one call to one shop
 * about one paper: each group shows the shop's tier table with the blank
 * tiers marked, then every waiting cart with the pages that need the price.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { CoverageGlyph } from "@/components/colour/CoverageGlyph";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { getStaffCatalogItem, listColourPriceChecks } from "@/lib/api/client";
import {
  TIERS_OF,
  bpsPercent,
  paperDimensions,
  priceCheckGap,
  quoteA3Limit,
  readColourPriceChecks,
  sheetsLine,
  tierBand,
  tierLabel,
  type ColourPriceCheck,
  type ColourPriceSize,
} from "@/lib/colour-pricing";
import { formatPhp } from "@/lib/format";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { shopLabel, normalizeStaffCatalogDetail, type StaffCatalogRow } from "@/lib/supplier-products";
import { cn } from "@/lib/utils";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Tree = "ops" | "admin";

type Group = {
  key: string;
  catalogItemId: string;
  paperKey: string;
  checks: ColourPriceCheck[];
};

function paperKeyOf(check: ColourPriceCheck): string {
  const paper = check.colourPricing.request?.paper;
  if (!paper) return check.colourPricing.paperSize ?? "unknown";
  return `${Math.min(paper.widthMilli, paper.heightMilli)}:${Math.max(paper.widthMilli, paper.heightMilli)}`;
}

export function groupPriceChecks(checks: ColourPriceCheck[]): Group[] {
  const out = new Map<string, Group>();
  for (const check of checks) {
    const paperKey = paperKeyOf(check);
    const key = `${check.catalogItemId}|${paperKey}`;
    const group = out.get(key) ?? { key, catalogItemId: check.catalogItemId, paperKey, checks: [] };
    group.checks.push(check);
    out.set(key, group);
  }
  return [...out.values()];
}

export function ColourPriceChecks({ tree }: { tree: Tree }) {
  const [checks, setChecks] = useState<ColourPriceCheck[] | null>(null);
  const [listings, setListings] = useState<Record<string, StaffCatalogRow | "missing">>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const asked = useRef(new Set<string>());

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setChecks(readColourPriceChecks(await listColourPriceChecks()));
      setError(null);
    } catch (err) {
      setError(opsErrorMessage(err, "Could not read the colour price checks."));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload(["catalog"], load);
  useLegalInboxReload("colour_price_check", load);

  // Each listing is read once, for the shop's name and its tier table.
  useEffect(() => {
    for (const id of new Set((checks ?? []).map((check) => check.catalogItemId))) {
      if (asked.current.has(id)) continue;
      asked.current.add(id);
      getStaffCatalogItem(id)
        .then((body) => {
          const row = normalizeStaffCatalogDetail(body);
          setListings((current) => ({ ...current, [id]: row ?? "missing" }));
        })
        .catch(() => setListings((current) => ({ ...current, [id]: "missing" })));
    }
  }, [checks]);

  const groups = useMemo(() => groupPriceChecks(checks ?? []), [checks]);

  if (error && !checks) {
    return (
      <ErrorState
        body={error}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }
  if (!checks) return <LoadingBlock label="Reading colour price checks…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Pages in a client&rsquo;s cart whose strong colour lands in a tier the shop has not
          priced on that paper. The client sees &ldquo;This page needs a price check&rdquo;
          and cannot pay. Ask the shop to price the tier: only its approved listing prices
          unlock checkout. GRIDGO never fills in a price.
        </p>
        <Button variant="secondary" disabled={refreshing} onClick={() => void load()}>
          <RefreshCw aria-hidden className={cn(refreshing && "motion-safe:animate-spin")} />
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState
          title="No pages are waiting on a shop price"
          body="When GRIDGO measures a page that lands in a tier its shop left blank, the cart shows up here and you get an inbox notice."
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Listings waiting on a shop price">
          {groups.map((group) => (
            <GroupCard
              key={group.key}
              group={group}
              listing={listings[group.catalogItemId]}
              tree={tree}
            />
          ))}
        </ul>
      )}
      {checks.length >= 100 ? (
        <p className="text-caption text-text-muted m-0">
          GRIDGO lists the first 100 waiting carts. Others appear as these are priced.
        </p>
      ) : null}
    </div>
  );
}

function GroupCard({
  group,
  listing,
  tree,
}: {
  group: Group;
  listing: StaffCatalogRow | "missing" | undefined;
  tree: Tree;
}) {
  const first = group.checks[0].colourPricing;
  const row = listing && listing !== "missing" ? listing : null;
  const size = findSize(row, first);
  const limit = quoteA3Limit(first);
  const paper = first.request?.paper;
  const paperName = size?.paperSize ?? first.paperSize ?? (paper ? paperDimensions(paper) : "this paper");
  const name = row?.listing.name || "Listing";
  const shop = row ? shopLabel(row.shop) : null;
  const carts = group.checks.length;
  return (
    <li className="gg-card flex flex-col gap-3 p-3" data-testid="colour-price-check">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-body-lg text-text-primary m-0" style={medium}>
            {name}
            <span className="text-text-secondary"> on {paperName}</span>
          </h2>
          <span className="text-body text-text-secondary">
            {shop ?? (listing === "missing" ? "Shop not readable" : "Reading the shop…")}
          </span>
        </div>
        <StatusChip
          tone="warning"
          icon="triangle-alert"
          label={`${carts} ${carts === 1 ? "cart" : "carts"} waiting`}
        />
      </div>

      <p className="text-body text-text-primary m-0">{priceCheckGap(first)}</p>

      {size ? (
        <div
          role="group"
          aria-label={`The shop's prices on ${paperName}`}
          className={cn(
            "grid gap-2",
            size.tierSet === "a3" ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4",
          )}
        >
          {TIERS_OF[size.tierSet].map((tier) => {
            const price = size.prices[tier];
            const blank = price == null;
            return (
              <div
                key={tier}
                className={cn(
                  "flex items-center gap-2 rounded-field border p-2",
                  blank ? "border-warning border-dashed" : "border-outline-subtle",
                )}
              >
                <CoverageGlyph bps={tierBand(tier, limit).to} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <span className="text-caption text-text-secondary">{tierLabel(tier, limit)}</span>
                  <span className="text-body text-text-primary tabular-nums" style={medium}>
                    {blank ? "Not priced" : `${formatPhp(price)} a sheet`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : row ? (
        <p className="text-caption text-text-secondary m-0">
          The shop&rsquo;s approved listing has no colour prices on this paper.
        </p>
      ) : null}

      <ul className="border-outline-subtle m-0 flex list-none flex-col border-t p-0" aria-label="Waiting carts">
        {group.checks.map((check) => (
          <CartLine key={`${check.cartId}:${check.lineId}`} check={check} />
        ))}
      </ul>

      {tree === "admin" ? (
        <Link
          href={`/admin/supplier-products/${encodeURIComponent(group.catalogItemId)}`}
          className="text-body text-text-primary self-start underline underline-offset-4"
        >
          Open the listing in Supplier products
        </Link>
      ) : null}
    </li>
  );
}

function CartLine({ check }: { check: ColourPriceCheck }) {
  const quote = check.colourPricing;
  const limit = quoteA3Limit(quote);
  const missing = quote.pages.filter((page) => page.sheetPriceMinor == null);
  return (
    <li className="border-outline-subtle flex flex-col gap-1.5 border-b py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-body text-text-primary" style={medium}>
          Client {shortId(check.clientId)}
        </span>
        <span className="text-caption text-text-muted tabular-nums">
          {sheetsLine(quote.quantityMode, quote.quantity, quote.pages.length)}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Pages that need a price">
        {missing.map((page) => (
          <li
            key={`${page.fileId}:${page.page}`}
            className="bg-surface-variant flex items-center gap-2 rounded-field py-1 pr-2.5 pl-1.5"
          >
            <CoverageGlyph bps={page.strongColourBps} size="sm" />
            <span className="text-body text-text-primary tabular-nums">
              Page {page.page}: {bpsPercent(page.strongColourBps)}
              {page.tier ? (
                <span className="text-text-secondary">, {tierLabel(page.tier, limit)}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {quote.pages.length > missing.length ? (
        <span className="text-caption text-text-muted inline-flex items-center gap-1">
          <TriangleAlert size={12} aria-hidden className="text-warning" />
          {quote.pages.length - missing.length} other{" "}
          {quote.pages.length - missing.length === 1 ? "page has" : "pages have"} a shop price;
          the client sees no total until every page does.
        </span>
      ) : null}
    </li>
  );
}

function findSize(row: StaffCatalogRow | null, quote: ColourPriceCheck["colourPricing"]): ColourPriceSize | null {
  const sizes = row?.listing.colourPricing?.sizes ?? [];
  const paper = quote.request?.paper;
  if (paper) {
    const short = Math.min(paper.widthMilli, paper.heightMilli);
    const long = Math.max(paper.widthMilli, paper.heightMilli);
    const match = sizes.find(
      (size) =>
        size.widthMilli != null &&
        size.heightMilli != null &&
        Math.min(size.widthMilli, size.heightMilli) === short &&
        Math.max(size.widthMilli, size.heightMilli) === long,
    );
    if (match) return match;
  }
  return sizes.find((size) => size.paperSize === quote.paperSize) ?? null;
}

/** The last characters of an id, enough to tell carts apart on a call. */
function shortId(id: string): string {
  return id.length > 8 ? `…${id.slice(-6)}` : id;
}
