"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Star } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonLines } from "@/components/ui/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getShopRankings } from "@/lib/api/client";
import type { ShopRankingRow, ShopRankings } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatPhp } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The columns a row can be ordered by. Stars sort high first; price low first. */
type SortKey = "overall" | "quality" | "speed" | "value" | "onTime" | "price";

const SORT_LABELS: Record<SortKey, string> = {
  overall: "Overall",
  quality: "Quality",
  speed: "Speed",
  value: "Value",
  onTime: "On time",
  price: "From price",
};

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

/**
 * Who clients say is good, and at what.
 *
 * A league table rather than a dashboard: one row per shop, its place, and
 * the three things a client scored it on. The category picker is the point —
 * "who is good" is not a question Operations asks; "who is good at tarpaulins
 * and what do they charge" is, and a shop that is excellent at stickers can
 * be a mediocre printer of books. With a category chosen, the shop's cheapest
 * listing there sits beside its stars so price and quality read together.
 *
 * Matching itself only reads the quality star, and only after five reviews.
 * This table is for people, who can hold three numbers at once.
 */
export default function OpsRankingsPage() {
  const [category, setCategory] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [data, setData] = useState<ShopRankings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const categoryCode = category === "all" ? null : category;

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        setData(await getShopRankings(categoryCode));
      } catch (err) {
        setData(null);
        setError(
          opsErrorMessage(
            err,
            "Could not load shop rankings. Confirm the API is running, then retry.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, [categoryCode]),
  );

  useLiveReload(["orders"], load);

  useEffect(() => {
    void load();
  }, [load]);

  // Price only means something inside one category; across all work it
  // would compare a business card with a tarpaulin.
  useEffect(() => {
    if (!categoryCode && sortKey === "price") setSortKey("overall");
  }, [categoryCode, sortKey]);

  const rows = useMemo(() => (data ? orderRows(data.rows, sortKey) : []), [data, sortKey]);
  const categoryName = data?.categories.find((row) => row.code === categoryCode)?.name ?? null;

  if (error) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const columns: SortKey[] = categoryCode
    ? ["overall", "quality", "speed", "value", "onTime", "price"]
    : ["overall", "quality", "speed", "value", "onTime"];

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-body text-text-secondary">
        Ranked by the average of the quality, speed and value stars clients gave after each
        finished job. Pick a category to see who is best at that work and what they charge for it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ranking-category" className="text-caption text-text-muted">
          Category
        </label>
        <Select value={category} onValueChange={(v) => setCategory(v ?? "all")}>
          <SelectTrigger id="ranking-category" className="min-h-11 min-w-56">
            <SelectValue>
              {(v) =>
                String(v ?? "all") === "all"
                  ? "All work"
                  : (data?.categories.find((row) => row.code === v)?.name ?? String(v))
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All work</SelectItem>
            {data?.categories.map((row) => (
              <SelectItem key={row.code} value={row.code}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data ? (
          <span className="text-caption text-text-muted">
            {data.rankedCount === 0
              ? "No shop has been rated yet"
              : `${data.rankedCount} of ${data.rows.length} shops rated${categoryName ? ` for ${categoryName.toLowerCase()}` : ""}`}
          </span>
        ) : null}
      </div>

      {loading && !data ? (
        <SkeletonLines lines={6} />
      ) : !rows.length ? (
        <EmptyState
          title="No shops to rank"
          body="Shops appear here once they are on the platform. Their stars arrive as clients rate finished jobs."
        />
      ) : (
        <div className="gg-card p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 pl-4">Rank</TableHead>
                <TableHead>Shop</TableHead>
                <TableHead className="text-right">Reviews</TableHead>
                {columns.map((key) => (
                  <TableHead key={key} className="text-right">
                    <button
                      type="button"
                      onClick={() => setSortKey(key)}
                      aria-pressed={sortKey === key}
                      aria-label={`Sort by ${SORT_LABELS[key].toLowerCase()}`}
                      className={cn(
                        "inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-caption",
                        sortKey === key ? "font-semibold text-text-primary" : "text-text-muted hover:text-text-primary",
                      )}
                    >
                      {SORT_LABELS[key]}
                      {sortKey === key ? (
                        key === "price" ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden />
                        )
                      ) : null}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.supplierId} className={row.count === 0 ? "text-text-muted" : undefined}>
                  <TableCell className="pl-4 text-h3 tabular-nums">
                    {row.position != null ? `#${row.position}` : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-body font-medium text-text-primary">{row.shopName}</span>
                      {row.count === 0 ? (
                        <span className="text-caption text-text-muted">Not yet rated</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  {columns.map((key) => (
                    <TableCell key={key} className="text-right tabular-nums">
                      {key === "onTime" ? (
                        row.onTime && row.onTime.count > 0 ? (
                          <span title={`${Math.round(row.onTime.rate * row.onTime.count)} of ${row.onTime.count} jobs by the shop's own date`}>
                            {Math.round(row.onTime.rate * 100)}%
                          </span>
                        ) : (
                          "—"
                        )
                      ) : key === "price" ? (
                        row.fromPriceMinor != null ? formatPhp(row.fromPriceMinor) : "—"
                      ) : (
                        <StarCell value={row[key]} emphasis={key === "overall"} />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** A star average with the meter under it, so a column scans as shape as well as digits. */
function StarCell({ value, emphasis }: { value: number | null; emphasis?: boolean }) {
  if (value == null) return <span>—</span>;
  const share = Math.max(0, Math.min(1, value / 5));
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className={cn("inline-flex items-center gap-1", emphasis && "font-semibold text-text-primary")}>
        {emphasis ? <Star className="size-3.5 fill-action-yellow text-action-yellow" aria-hidden /> : null}
        {formatStars(value)}
      </span>
      <span className="block h-1 w-16 overflow-hidden rounded-full bg-surface-variant" aria-hidden>
        <span className="block h-full rounded-full bg-action-yellow" style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
    </span>
  );
}
