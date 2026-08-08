"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export type DataTableColumn<T> = {
  id: string;
  /** Header label for desktop table and mobile card. */
  header: string;
  /** Cell content. */
  cell: (row: T) => ReactNode;
  /**
   * Sort key. When provided (or `sortable: true` with `sortValue`), the column
   * header is a sort control.
   */
  sortValue?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  /**
   * Text used for client-side filter matching. Defaults to stringified
   * `sortValue` when present.
   */
  filterValue?: (row: T) => string;
  /** When true, this column is the card title on mobile. Default: first column. */
  primary?: boolean;
  /** Hide this field on the mobile card (e.g. redundant with primary). */
  hideOnMobile?: boolean;
  className?: string;
};

type Props<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  /** Optional trailing actions; must stay free of horizontal scroll on mobile. */
  rowActions?: (row: T) => ReactNode;
  empty?: ReactNode;
  className?: string;
  /** Accessible name for the table. */
  caption?: string;
  /**
   * Optional filter box above the table. Filters across columns that expose
   * `filterValue` or `sortValue`.
   */
  filterPlaceholder?: string;
  /** Extra toolbar content (e.g. queue toggles) rendered beside the filter. */
  toolbar?: ReactNode;
  /** Initial sort column id. */
  defaultSortId?: string;
  defaultSortDirection?: SortDirection;
};

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  dir: SortDirection,
): number {
  const av = a ?? "";
  const bv = b ?? "";
  let result = 0;
  if (typeof av === "number" && typeof bv === "number") {
    result = av - bv;
  } else {
    result = String(av).localeCompare(String(bv), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }
  return dir === "asc" ? result : -result;
}

/**
 * Dense data table for ops/admin queues.
 *
 * Desktop (≥768): standard table with optional column sort.
 * Mobile (<768): each row becomes a labelled card so essential actions never
 * require horizontal scrolling.
 *
 * Filtering and sorting are client-side helpers for remaining screens — pass
 * pre-sorted data and omit filter when the page owns those concerns.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  rowActions,
  empty,
  className,
  caption,
  filterPlaceholder,
  toolbar,
  defaultSortId,
  defaultSortDirection = "asc",
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [sortId, setSortId] = useState<string | null>(defaultSortId ?? null);
  const [sortDir, setSortDir] = useState<SortDirection>(defaultSortDirection);

  const filterable = columns.some((c) => c.filterValue || c.sortValue);

  const processed = useMemo(() => {
    let rows = data;

    if (query.trim() && filterable) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((row) =>
        columns.some((col) => {
          const raw =
            col.filterValue?.(row) ??
            (col.sortValue ? String(col.sortValue(row) ?? "") : "");
          return raw.toLowerCase().includes(q);
        }),
      );
    }

    if (sortId) {
      const col = columns.find((c) => c.id === sortId);
      if (col?.sortValue) {
        rows = [...rows].sort((a, b) =>
          compareValues(col.sortValue!(a), col.sortValue!(b), sortDir),
        );
      }
    }

    return rows;
  }, [columns, data, filterable, query, sortDir, sortId]);

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortValue && !col.sortable) return;
    if (sortId === col.id) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortId(col.id);
      setSortDir("asc");
    }
  }

  if (!data.length && empty) return <>{empty}</>;

  const primaryCol = columns.find((c) => c.primary) ?? columns[0] ?? null;
  const mobileCols = columns.filter(
    (c) => !c.hideOnMobile && c.id !== primaryCol?.id,
  );

  const showToolbar = Boolean(toolbar || (filterPlaceholder && filterable));

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {showToolbar ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {filterPlaceholder && filterable ? (
            <div className="w-full sm:max-w-xs">
              <label className="sr-only" htmlFor="data-table-filter">
                {filterPlaceholder}
              </label>
              <Input
                id="data-table-filter"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={filterPlaceholder}
                autoComplete="off"
              />
            </div>
          ) : (
            <span />
          )}
          {toolbar ? (
            <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          ) : null}
        </div>
      ) : null}

      {!processed.length ? (
        empty ?? (
          <p className="text-body text-text-muted m-0">No matching rows.</p>
        )
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
            {processed.map((row) => {
              const id = getRowId(row);
              return (
                <li
                  key={id}
                  className="rounded-card border border-outline bg-surface p-4"
                >
                  {primaryCol ? (
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-caption text-text-muted m-0">
                          {primaryCol.header}
                        </p>
                        <div className="text-body-lg text-text-primary mt-0.5">
                          {primaryCol.cell(row)}
                        </div>
                      </div>
                      {rowActions ? (
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          {rowActions(row)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <dl className="m-0 flex flex-col gap-2">
                    {mobileCols.map((col) => (
                      <div
                        key={col.id}
                        className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                      >
                        <dt className="text-caption text-text-muted shrink-0">
                          {col.header}
                        </dt>
                        <dd className="text-body text-text-primary m-0 min-w-0 sm:text-right">
                          {col.cell(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {!primaryCol && rowActions ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {rowActions(row)}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-card border border-outline md:block">
            <Table>
              {caption ? (
                <caption className="sr-only">{caption}</caption>
              ) : null}
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {columns.map((col) => {
                    const canSort = Boolean(col.sortValue || col.sortable);
                    const active = sortId === col.id;
                    return (
                      <TableHead
                        key={col.id}
                        className={cn(
                          "text-caption text-text-muted",
                          col.className,
                        )}
                        aria-sort={
                          canSort && active
                            ? sortDir === "asc"
                              ? "ascending"
                              : "descending"
                            : canSort
                              ? "none"
                              : undefined
                        }
                      >
                        {canSort ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-auto min-h-11 gap-1 px-1 text-caption text-text-muted hover:text-foreground"
                            onClick={() => toggleSort(col)}
                          >
                            {col.header}
                            {active ? (
                              sortDir === "asc" ? (
                                <ArrowUp data-icon="inline-end" aria-hidden />
                              ) : (
                                <ArrowDown data-icon="inline-end" aria-hidden />
                              )
                            ) : (
                              <ArrowUpDown
                                data-icon="inline-end"
                                aria-hidden
                                className="opacity-50"
                              />
                            )}
                            <span className="sr-only">
                              {active
                                ? `sorted ${sortDir === "asc" ? "ascending" : "descending"}`
                                : "sort"}
                            </span>
                          </Button>
                        ) : (
                          col.header
                        )}
                      </TableHead>
                    );
                  })}
                  {rowActions ? (
                    <TableHead className="text-caption text-text-muted text-right">
                      Actions
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {processed.map((row) => (
                  <TableRow key={getRowId(row)}>
                    {columns.map((col) => (
                      <TableCell key={col.id} className={col.className}>
                        {col.cell(row)}
                      </TableCell>
                    ))}
                    {rowActions ? (
                      <TableCell className="text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          {rowActions(row)}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
