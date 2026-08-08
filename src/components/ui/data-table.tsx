"use client";

import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  id: string;
  /** Header label for desktop table and mobile card. */
  header: string;
  /** Cell content. */
  cell: (row: T) => ReactNode;
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
};

/**
 * Dense data table for ops/admin queues.
 *
 * Desktop (≥768): standard table.
 * Mobile (<768): each row becomes a labelled card so essential actions never
 * require horizontal scrolling.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  rowActions,
  empty,
  className,
  caption,
}: Props<T>) {
  if (!data.length && empty) return <>{empty}</>;

  const primaryCol =
    columns.find((c) => c.primary) ?? columns[0] ?? null;
  const mobileCols = columns.filter(
    (c) => !c.hideOnMobile && c.id !== primaryCol?.id,
  );

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile cards */}
      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
        {data.map((row) => {
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
                <div className="mt-3 flex flex-wrap gap-2">{rowActions(row)}</div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-card border border-outline">
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  className={cn("text-caption text-text-muted", col.className)}
                >
                  {col.header}
                </TableHead>
              ))}
              {rowActions ? (
                <TableHead className="text-caption text-text-muted text-right">
                  Actions
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
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
    </div>
  );
}
