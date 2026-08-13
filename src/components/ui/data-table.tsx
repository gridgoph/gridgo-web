"use client";

import * as React from "react";
import Link from "next/link";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type Table as TanstackTable,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Columns3,
  ListFilter,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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

/**
 * GRIDGO column descriptor.
 *
 * This is the authoring surface; it is compiled to a TanStack `ColumnDef` by
 * `toColumnDefs` below. It exists because a GRIDGO queue has to render twice —
 * as a table on desktop and as a labelled card below 768px — and that pairing
 * (`header` + `primary` + `hideOnMobile`) is the contract a bare `ColumnDef`
 * cannot express. Pages that need raw TanStack columns can still import
 * `ColumnDef` and pass `columnDefs` instead.
 */
export type DataTableColumn<T> = {
  id: string;
  /** Header label for desktop table, and field label on the mobile card. */
  header: string;
  /** Cell content. */
  cell: (row: T) => React.ReactNode;
  /**
   * Sort key. When provided (or `sortable: true`), the column header is a sort
   * control. Numbers sort numerically; everything else sorts as text.
   */
  sortValue?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  /**
   * Text used for search matching. Defaults to the stringified `sortValue`.
   */
  filterValue?: (row: T) => string;
  /** When true, this column is the card title on mobile. Default: first column. */
  primary?: boolean;
  /** Hide this field on the mobile card (e.g. redundant with primary). */
  hideOnMobile?: boolean;
  /** Keep this column out of the Columns menu — it identifies the row. */
  alwaysVisible?: boolean;
  className?: string;
};

/** Opt-in multi-select filter over one column's values. */
export type DataTableFacet = {
  columnId: string;
  title: string;
  options: { value: string; label: string; icon?: LucideIcon }[];
};

type ColumnMeta<T> = {
  gridgo: DataTableColumn<T>;
};

// ---------------------------------------------------------------------------
// DataTableRowAction — icon + tooltip. Desktop is icon-only; mobile cards
// show the verb so a tap target is never a mystery glyph.
// ---------------------------------------------------------------------------

type RowActionsDensity = "icon" | "labeled";

const RowActionsDensityContext =
  React.createContext<RowActionsDensity>("icon");

export type DataTableRowActionProps = {
  /** Visible tooltip and accessible name — the old verb ("Suspend", "Open"). */
  label: string;
  icon: LucideIcon;
  variant?: "outline" | "secondary" | "danger" | "destructive" | "default" | "ghost";
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLElement>;
  /** When set, the control is a same-app link (still a 44×44 icon button). */
  href?: string;
  "aria-pressed"?: boolean;
};

export function DataTableRowAction({
  label,
  icon: Icon,
  variant = "outline",
  disabled,
  onClick,
  href,
  "aria-pressed": ariaPressed,
}: DataTableRowActionProps) {
  const density = React.useContext(RowActionsDensityContext);
  const labeled = density === "labeled";

  const icon = labeled ? (
    <Icon aria-hidden data-icon="inline-start" />
  ) : (
    <Icon aria-hidden />
  );

  const contents = (
    <>
      {icon}
      {labeled ? label : null}
    </>
  );

  const button = (
    <Button
      variant={variant}
      size={labeled ? "sm" : "icon"}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={ariaPressed}
      nativeButton={href ? false : undefined}
      render={href ? <Link href={href} /> : undefined}
    >
      {contents}
    </Button>
  );

  return (
    <Tooltip>
      {disabled ? (
        <TooltipTrigger render={<span className="inline-flex" />}>
          {button}
        </TooltipTrigger>
      ) : (
        <TooltipTrigger
          render={
            <Button
              variant={variant}
              size={labeled ? "sm" : "icon"}
              onClick={onClick}
              aria-label={label}
              aria-pressed={ariaPressed}
              nativeButton={href ? false : undefined}
              render={href ? <Link href={href} /> : undefined}
            />
          }
        >
          {contents}
        </TooltipTrigger>
      )}
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Descriptor → ColumnDef
// ---------------------------------------------------------------------------

function searchTextFor<T>(columns: DataTableColumn<T>[], row: T): string {
  return columns
    .map((col) =>
      col.filterValue
        ? col.filterValue(row)
        : col.sortValue
          ? String(col.sortValue(row) ?? "")
          : "",
    )
    .join(" ")
    .toLowerCase();
}

function toColumnDefs<T>(columns: DataTableColumn<T>[]): ColumnDef<T, unknown>[] {
  return columns.map((col) => ({
    id: col.id,
    accessorFn: (row: T) =>
      col.sortValue
        ? (col.sortValue(row) ?? "")
        : col.filterValue
          ? col.filterValue(row)
          : "",
    header: col.header,
    cell: ({ row }) => col.cell(row.original),
    enableSorting: Boolean(col.sortValue || col.sortable),
    enableHiding: !col.alwaysVisible,
    filterFn: (row, columnId, value) => {
      if (!Array.isArray(value) || !value.length) return true;
      return (value as string[]).includes(String(row.getValue(columnId) ?? ""));
    },
    meta: { gridgo: col } satisfies ColumnMeta<T>,
  }));
}

// ---------------------------------------------------------------------------
// DataTableColumnHeader — sort control, or a plain label when not sortable
// ---------------------------------------------------------------------------

function DataTableColumnHeader<T>({
  column,
  title,
}: {
  column: Column<T, unknown>;
  title: string;
}) {
  if (!column.getCanSort()) {
    return <span className="text-caption text-text-muted">{title}</span>;
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "-ml-3 gap-1 px-2 text-caption text-text-muted hover:text-foreground",
        sorted && "text-text-primary",
      )}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {title}
      {sorted === "asc" ? (
        <ArrowUp data-icon="inline-end" aria-hidden />
      ) : sorted === "desc" ? (
        <ArrowDown data-icon="inline-end" aria-hidden />
      ) : (
        <ChevronsUpDown data-icon="inline-end" aria-hidden className="opacity-50" />
      )}
      <span className="sr-only">
        {sorted === "asc"
          ? "sorted ascending"
          : sorted === "desc"
            ? "sorted descending"
            : "sort by this column"}
      </span>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// DataTableFacetedFilter — multi-select over one column, with live counts
// ---------------------------------------------------------------------------

function DataTableFacetedFilter<T>({
  column,
  title,
  options,
}: {
  column?: Column<T, unknown>;
  title: string;
  options: DataTableFacet["options"];
}) {
  const facets = column?.getFacetedUniqueValues();
  const selected = new Set((column?.getFilterValue() as string[]) ?? []);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2 border-dashed">
            <ListFilter data-icon="inline-start" aria-hidden />
            {title}
            {selected.size ? (
              <span className="text-caption text-text-muted tabular-nums">
                {selected.size}
              </span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 p-2">
        <p className="text-overline text-text-muted m-0 mb-2 px-1 uppercase">
          {title}
        </p>
        <div className="flex flex-col gap-0.5">
          {options.map((option) => {
            const isSelected = selected.has(option.value);
            const count = facets?.get(option.value) ?? 0;
            const OptionIcon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  const next = new Set(selected);
                  if (isSelected) next.delete(option.value);
                  else next.add(option.value);
                  const values = Array.from(next);
                  column?.setFilterValue(values.length ? values : undefined);
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-field px-2 text-left",
                  "hover:bg-overlay-hover",
                  isSelected && "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-outline",
                  )}
                  aria-hidden
                >
                  {isSelected ? <Check className="size-3" /> : null}
                </span>
                {OptionIcon ? (
                  <OptionIcon className="size-4 shrink-0 text-text-muted" aria-hidden />
                ) : null}
                <span className="text-body text-text-primary min-w-0 flex-1 truncate">
                  {option.label}
                </span>
                <span className="text-caption text-text-muted tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// DataTableViewOptions — column visibility
// ---------------------------------------------------------------------------

function DataTableViewOptions<T>({ table }: { table: TanstackTable<T> }) {
  const hideable = table.getAllColumns().filter((c) => c.getCanHide());
  if (hideable.length < 4) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2">
            <Columns3 data-icon="inline-start" aria-hidden />
            <span className="hidden sm:inline">Columns</span>
            <span className="sr-only sm:hidden">Choose columns</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {hideable.map((column) => {
            const meta = column.columnDef.meta as ColumnMeta<T> | undefined;
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
              >
                {meta?.gridgo.header ?? column.id}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// DataTablePagination — only mounted when there is more than one page
// ---------------------------------------------------------------------------

function DataTablePagination<T>({
  table,
  itemLabel,
}: {
  table: TanstackTable<T>;
  itemLabel: string;
}) {
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-outline px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-caption text-text-muted m-0" aria-live="polite">
        <span className="tabular-nums">
          {from}&ndash;{to}
        </span>{" "}
        of <span className="tabular-nums">{total}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 sm:flex">
          <label className="text-caption text-text-muted" htmlFor="data-table-rows">
            Rows
          </label>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger id="data-table-rows" className="min-h-11 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-caption text-text-muted m-0 tabular-nums whitespace-nowrap">
          Page {pageIndex + 1} of {Math.max(1, pageCount)}
        </p>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden sm:inline-flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="First page"
          >
            <ChevronsLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden sm:inline-flex"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Last page"
          >
            <ChevronsRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

type Props<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  /** Trailing actions. Pinned on desktop so scrolling wide rows never hides them. */
  rowActions?: (row: T) => React.ReactNode;
  /** Shown instead of the table when there is genuinely no data. */
  empty?: React.ReactNode;
  className?: string;
  /** Accessible name for the table. */
  caption?: string;
  /** Search box above the table; matches across every column's filter text. */
  filterPlaceholder?: string;
  /** Extra toolbar content (e.g. queue toggles) rendered beside the search box. */
  toolbar?: React.ReactNode;
  /** Initial sort column id. */
  defaultSortId?: string;
  defaultSortDirection?: SortDirection;
  /** Multi-select filters over specific columns, with live counts. */
  facets?: DataTableFacet[];
  /** Rows per page. */
  pageSize?: number;
  /** Renders skeleton rows that hold the table's layout. */
  loading?: boolean;
  /** Plural noun used in the pagination range, e.g. "orders". */
  itemLabel?: string;
};

/**
 * Dense data table for ops/admin queues, powered by `@tanstack/react-table`.
 *
 * Desktop (≥768): table with column sort, column visibility, and row actions
 * pinned to the trailing edge so they never sit behind horizontal scroll.
 * Mobile (<768): each row becomes a labelled card, so the same actions stay
 * reachable without scrolling sideways.
 *
 * Sorting, searching, faceting and pagination are client-side over the rows you
 * pass in. Pass pre-sorted data and omit `filterPlaceholder` when the page owns
 * those concerns.
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
  facets,
  pageSize = 10,
  loading = false,
  itemLabel = "rows",
}: Props<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(
    defaultSortId
      ? [{ id: defaultSortId, desc: defaultSortDirection === "desc" }]
      : [],
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const columnDefs = React.useMemo(() => toColumnDefs(columns), [columns]);

  const table = useReactTable<T>({
    data,
    columns: columnDefs,
    getRowId: (row) => getRowId(row),
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, value) =>
      searchTextFor(columns, row.original).includes(
        String(value).trim().toLowerCase(),
      ),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;
  const isFiltered = columnFilters.length > 0 || globalFilter.trim().length > 0;
  const visibleColumns = table.getVisibleLeafColumns();
  const columnCount = visibleColumns.length + (rowActions ? 1 : 0);

  // No data at all is the page's story to tell, not the table's.
  if (!loading && !data.length && empty) return <>{empty}</>;

  const showToolbar = Boolean(
    toolbar || filterPlaceholder || facets?.length || table.getAllColumns().length >= 4,
  );

  function clearFilters() {
    setGlobalFilter("");
    table.resetColumnFilters();
  }

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {showToolbar ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {filterPlaceholder ? (
            <div className="relative w-full sm:max-w-xs">
              <label className="sr-only" htmlFor="data-table-filter">
                {filterPlaceholder}
              </label>
              <Search
                aria-hidden
                className="text-text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                id="data-table-filter"
                type="search"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={filterPlaceholder}
                autoComplete="off"
                className="pl-9"
              />
            </div>
          ) : null}

          {facets?.map((facet) => (
            <DataTableFacetedFilter
              key={facet.columnId}
              column={table.getColumn(facet.columnId)}
              title={facet.title}
              options={facet.options}
            />
          ))}

          {isFiltered ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
              <X data-icon="inline-end" aria-hidden />
            </Button>
          ) : null}

          {toolbar ? (
            <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          ) : null}

          {/* Below 768 the rows are cards, not columns — a column chooser there
              is a control with nothing to do. */}
          <div className="hidden md:block sm:ml-auto">
            <DataTableViewOptions table={table} />
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-outline">
        {/* Mobile cards */}
        <ul className="m-0 flex list-none flex-col p-0 md:hidden">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <li
                key={`skeleton-card-${i}`}
                className="border-outline-subtle flex flex-col gap-3 border-b p-4 last:border-b-0"
              >
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </li>
            ))
          ) : !rows.length ? (
            <li className="text-body text-text-muted p-6 text-center">
              <NoMatches isFiltered={isFiltered} onClear={clearFilters} />
            </li>
          ) : (
            rows.map((row) => {
              const cells = row.getVisibleCells();
              const primaryCell =
                cells.find(
                  (c) => (c.column.columnDef.meta as ColumnMeta<T>)?.gridgo.primary,
                ) ?? cells[0];
              const restCells = cells.filter(
                (c) =>
                  c.id !== primaryCell?.id &&
                  !(c.column.columnDef.meta as ColumnMeta<T>)?.gridgo.hideOnMobile,
              );
              return (
                <li
                  key={row.id}
                  className="border-outline-subtle border-b p-4 last:border-b-0"
                >
                  {primaryCell ? (
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-caption text-text-muted m-0">
                          {
                            (primaryCell.column.columnDef.meta as ColumnMeta<T>)
                              .gridgo.header
                          }
                        </p>
                        <div className="text-body-lg text-text-primary mt-0.5">
                          {flexRender(
                            primaryCell.column.columnDef.cell,
                            primaryCell.getContext(),
                          )}
                        </div>
                      </div>
                      {rowActions ? (
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <RowActionsDensityContext.Provider value="labeled">
                            {rowActions(row.original)}
                          </RowActionsDensityContext.Provider>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <dl className="m-0 flex flex-col gap-2">
                    {restCells.map((cell) => (
                      <div
                        key={cell.id}
                        className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                      >
                        <dt className="text-caption text-text-muted shrink-0">
                          {(cell.column.columnDef.meta as ColumnMeta<T>).gridgo.header}
                        </dt>
                        <dd className="text-body text-text-primary m-0 min-w-0 sm:text-right">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })
          )}
        </ul>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <Table>
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <TableHeader className="bg-surface sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta as ColumnMeta<T>;
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className={cn("text-caption text-text-muted", meta.gridgo.className)}
                        aria-sort={
                          !header.column.getCanSort()
                            ? undefined
                            : sorted === "asc"
                              ? "ascending"
                              : sorted === "desc"
                                ? "descending"
                                : "none"
                        }
                      >
                        <DataTableColumnHeader
                          column={header.column}
                          title={meta.gridgo.header}
                        />
                      </TableHead>
                    );
                  })}
                  {rowActions ? (
                    <TableHead className="text-caption text-text-muted bg-surface border-outline-subtle sticky right-0 border-l text-center">
                      Actions
                    </TableHead>
                  ) : null}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <TableRow key={`skeleton-${rowIndex}`}>
                    {Array.from({ length: columnCount }).map((__, cellIndex) => (
                      <TableCell key={`skeleton-${rowIndex}-${cellIndex}`}>
                        <Skeleton
                          className="h-4"
                          style={{
                            width: `${52 + ((rowIndex * 13 + cellIndex * 17) % 29)}%`,
                          }}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !rows.length ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columnCount} className="h-32 text-center">
                    <NoMatches isFiltered={isFiltered} onClear={clearFilters} />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={
                          (cell.column.columnDef.meta as ColumnMeta<T>).gridgo.className
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                    {rowActions ? (
                      <TableCell className="bg-surface border-outline-subtle sticky right-0 border-l text-center">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <RowActionsDensityContext.Provider value="icon">
                            {rowActions(row.original)}
                          </RowActionsDensityContext.Provider>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!loading && table.getFilteredRowModel().rows.length > pageSize ? (
          <DataTablePagination table={table} itemLabel={itemLabel} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * A filtered-to-nothing table is a different situation from an empty queue, and
 * saying so is the difference between "you filtered these out" and "there is no
 * work here".
 */
function NoMatches({
  isFiltered,
  onClear,
}: {
  isFiltered: boolean;
  onClear: () => void;
}) {
  if (!isFiltered) {
    return <span className="text-body text-text-muted">Nothing to show here.</span>;
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-body text-text-primary">
        No rows match what you searched for.
      </span>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear filters
        <X data-icon="inline-end" aria-hidden />
      </Button>
    </div>
  );
}

export { DataTableColumnHeader, DataTableFacetedFilter, DataTableViewOptions };
export type { ColumnDef } from "@tanstack/react-table";
