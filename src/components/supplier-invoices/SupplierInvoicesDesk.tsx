"use client";

/**
 * Supplier invoices (gridgo-web#62, contract SUPPLIER_INVOICES_API.md):
 * how many shop invoices GRIDGO is owed for a month, which scans are in, and
 * which paper originals Operations still has to pick up from each shop.
 *
 * Mounted at `/admin/supplier-invoices` (Finance, Money group) and
 * `/ops/supplier-invoices`; both roles may record a collected original. The
 * month, shop, view and open invoice live in the URL so a link (or an inbox
 * notice, `?order=`) opens the same screen.
 *
 * The API filters only by month and shop and pages by order ID, so the desk
 * reads every page of the month once and filters the rest here. Totals always
 * come from the API, which counts the whole month.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Eye, ListFilter, PackageCheck } from "lucide-react";

import { CollectionMeter, CollectionMeterKey } from "@/components/supplier-invoices/CollectionMeter";
import { CollectInvoiceDialog } from "@/components/supplier-invoices/CollectInvoiceDialog";
import { SupplierInvoiceSheet } from "@/components/supplier-invoices/SupplierInvoiceSheet";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getSupplierInvoice, listOrders, listSupplierInvoices } from "@/lib/api/client";
import type {
  SupplierInvoice,
  SupplierInvoiceCounts,
  SupplierInvoiceShop,
} from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { formatManilaDate } from "@/lib/legal";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  INVOICE_MAX_PAGES,
  INVOICE_PAGE_LIMIT,
  INVOICE_VIEWS,
  canCollect,
  invoiceDateLabel,
  invoiceErrorMessage,
  isInvoiceMonth,
  manilaMonth,
  matchesView,
  monthHeadline,
  monthLabel,
  parseInvoiceView,
  presentOriginal,
  presentScan,
  shiftMonth,
  shopName,
  sortShops,
  viewCount,
  type InvoiceView,
} from "@/lib/supplier-invoices";

/** Select value for "every shop"; Base UI needs a non-empty item value. */
const ALL_SHOPS = "all";

type Loaded = {
  month: string;
  totals: SupplierInvoiceCounts;
  shops: SupplierInvoiceShop[];
  invoices: SupplierInvoice[];
  /** True when the month ran past the page ceiling and is not fully listed. */
  truncated: boolean;
};

export function SupplierInvoicesDesk({ tree }: { tree: "ops" | "admin" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const thisMonth = manilaMonth();
  const requestedMonth = searchParams.get("month");
  const month = isInvoiceMonth(requestedMonth) ? requestedMonth : thisMonth;
  const shopFilter = searchParams.get("shop") || null;
  const view = parseInvoiceView(searchParams.get("view"));
  const openOrderId = searchParams.get("order") || null;

  const [data, setData] = useState<Loaded | null>(null);
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState<SupplierInvoice | null>(null);
  const [confirming, setConfirming] = useState<SupplierInvoice | null>(null);
  const loadedMonth = useRef<string | null>(null);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, search],
  );

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      // A new month starts blank; a refresh of the same month keeps its rows up.
      if (loadedMonth.current !== month) setData(null);
      try {
        const first = await listSupplierInvoices(month, { limit: INVOICE_PAGE_LIMIT });
        const invoices = [...first.invoices];
        let cursor = first.nextCursor;
        let pages = 1;
        while (cursor && pages < INVOICE_MAX_PAGES) {
          const page = await listSupplierInvoices(month, {
            limit: INVOICE_PAGE_LIMIT,
            after: cursor,
          });
          invoices.push(...page.invoices);
          cursor = page.nextCursor;
          pages += 1;
        }
        loadedMonth.current = month;
        setData({
          month,
          totals: first.totals,
          shops: first.shops,
          invoices,
          truncated: Boolean(cursor),
        });
      } catch (err) {
        setData(null);
        setError(invoiceErrorMessage(err, "Could not load supplier invoices. Try again."));
      } finally {
        setLoading(false);
      }
    }, [month]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The API sends staff a `supplier_invoice_*` notice for every scan, entry,
  // correction and collection; that notice is the refresh signal.
  useLegalInboxReload("supplier_invoice_", load);

  // Order titles make rows recognisable; without them the order ID stands in.
  useEffect(() => {
    let cancelled = false;
    listOrders()
      .then((orders) => {
        if (!cancelled) setTitles(new Map(orders.map((order) => [order.id, order.title])));
      })
      .catch(() => {
        /* Titles are a courtesy; IDs still identify every row. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // An inbox link names an order but not its month: ask for the invoice and
  // move to the month it counts in.
  useEffect(() => {
    if (!openOrderId) {
      setLinked(null);
      return;
    }
    // Wait for the month: the invoice is usually in it already.
    if (!data || data.invoices.some((row) => row.orderId === openOrderId)) return;
    let cancelled = false;
    getSupplierInvoice(openOrderId)
      .then(({ invoice }) => {
        if (cancelled) return;
        setLinked(invoice);
        if (invoice.month !== month) setParams({ month: invoice.month });
      })
      .catch(() => {
        if (!cancelled) setLinked(null);
      });
    return () => {
      cancelled = true;
    };
    // Re-run when the month's rows arrive, not on every row change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOrderId, data?.month]);

  const shopsById = useMemo(
    () => new Map((data?.shops ?? []).map((shop) => [shop.supplierId, shop])),
    [data],
  );
  const sortedShops = useMemo(() => sortShops(data?.shops ?? []), [data]);
  const selectedShop = shopFilter ? shopsById.get(shopFilter) : undefined;
  const scopeCounts: SupplierInvoiceCounts | null = data
    ? (selectedShop ?? (shopFilter ? null : data.totals))
    : null;

  const visible = useMemo(() => {
    if (!data) return [];
    return data.invoices
      .filter((row) => !shopFilter || row.supplierId === shopFilter)
      .filter((row) => matchesView(row, view))
      .sort(
        (a, b) =>
          shopName(shopsById.get(a.supplierId)).localeCompare(
            shopName(shopsById.get(b.supplierId)),
          ) || a.expectedAt.localeCompare(b.expectedAt),
      );
  }, [data, shopFilter, view, shopsById]);

  const openInvoice =
    (openOrderId && data?.invoices.find((row) => row.orderId === openOrderId)) ||
    (linked && linked.orderId === openOrderId ? linked : null);

  const orderName = useCallback(
    (orderId: string) => titles.get(orderId) || `Order ${orderId}`,
    [titles],
  );

  function replaceInvoice(next: SupplierInvoice) {
    setConfirming(null);
    if (linked?.orderId === next.orderId) setLinked(next);
    // Counts move too, so re-read the month; the row updates at once meanwhile.
    setData((current) =>
      current
        ? {
            ...current,
            invoices: current.invoices.map((row) =>
              row.orderId === next.orderId ? next : row,
            ),
          }
        : current,
    );
    void load();
  }

  const shopColumns = useMemo<DataTableColumn<SupplierInvoiceShop>[]>(
    () => [
      {
        id: "shop",
        header: "Shop",
        primary: true,
        sortValue: (shop) => shopName(shop),
        filterValue: (shop) => shopName(shop),
        cell: (shop) => (
          <div className="flex min-w-48 flex-col gap-1.5">
            <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
              {shopName(shop)}
            </span>
            <CollectionMeter counts={shop} size="sm" className="max-w-56" />
          </div>
        ),
      },
      countColumn("expected", "Expected", (shop) => shop.expected),
      countColumn("received", "Scanned in", (shop) => shop.received),
      countColumn("missing", "Missing scan", (shop) => shop.missing, true),
      countColumn("collected", "Collected", (shop) => shop.collected),
      countColumn("toCollect", "To collect", (shop) => shop.toCollect, true),
    ],
    [],
  );

  const invoiceColumns = useMemo<DataTableColumn<SupplierInvoice>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        sortValue: (row) => orderName(row.orderId),
        filterValue: (row) =>
          `${orderName(row.orderId)} ${row.orderId} ${row.number ?? ""} ${shopName(shopsById.get(row.supplierId))}`,
        cell: (row) => (
          <div className="flex min-w-40 flex-col">
            <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
              {orderName(row.orderId)}
            </span>
            <span className="text-caption text-text-muted">
              Ready for pick-up {formatManilaDate(row.expectedAt)}
            </span>
          </div>
        ),
      },
      {
        id: "shop",
        header: "Shop",
        sortValue: (row) => shopName(shopsById.get(row.supplierId)),
        cell: (row) => (
          <span className="text-body text-text-secondary">
            {shopName(shopsById.get(row.supplierId))}
          </span>
        ),
      },
      {
        id: "invoice",
        header: "Shop's invoice",
        sortValue: (row) => row.number ?? "",
        cell: (row) =>
          row.submittedAt ? (
            <div className="flex flex-col">
              <span className="text-body text-text-primary tabular-nums">{row.number}</span>
              <span className="text-caption text-text-muted tabular-nums">
                {invoiceDateLabel(row.date)}
                {row.amountMinor !== null ? `, ${formatPhp(row.amountMinor)}` : ""}
              </span>
            </div>
          ) : (
            <span className="text-body text-text-muted">Not entered</span>
          ),
      },
      {
        id: "scan",
        header: "Scan",
        sortValue: (row) => presentScan(row).label,
        cell: (row) => {
          const scan = presentScan(row);
          return <StatusChip tone={scan.tone} label={scan.label} icon={scan.icon} />;
        },
      },
      {
        id: "original",
        header: "Paper original",
        sortValue: (row) => (row.collected ? 1 : 0),
        cell: (row) => {
          const original = presentOriginal(row);
          return (
            <StatusChip tone={original.tone} label={original.label} icon={original.icon} />
          );
        },
      },
    ],
    [orderName, shopsById],
  );

  if (error && !data) {
    return (
      <div className="flex flex-col gap-3">
        <MonthBar
          month={month}
          thisMonth={thisMonth}
          loading={loading}
          onMonth={(next) => setParams({ month: next, shop: null, order: null })}
          onRefresh={() => void load()}
        />
        <ErrorState
          body={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const pending = !data;
  const label = monthLabel(month);
  const shopCount = data?.shops.length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <MonthBar
        month={month}
        thisMonth={thisMonth}
        loading={loading}
        onMonth={(next) => setParams({ month: next, shop: null, order: null })}
        onRefresh={() => void load()}
      />

      <section className="gg-card flex flex-col gap-4" aria-labelledby="invoice-month-heading">
        <div className="flex flex-col gap-1">
          <h2 id="invoice-month-heading" className="sr-only">
            {label} at a glance
          </h2>
          {pending ? (
            <Skeleton className="h-9 w-72" aria-hidden />
          ) : (
            <p className="text-h2 text-text-primary m-0 text-balance">
              {monthHeadline(data.totals, shopCount)}
            </p>
          )}
          <p className="text-body text-text-secondary m-0 max-w-prose">
            One invoice is owed for every order that became ready for pick-up in {label}, Manila
            time. A missing scan or original never holds up dispatch or a payout.
          </p>
        </div>
        {pending ? (
          <Skeleton className="h-3.5 w-full rounded-pill" aria-hidden />
        ) : data.totals.expected ? (
          <div className="flex flex-col gap-2">
            <CollectionMeter counts={data.totals} />
            <CollectionMeterKey counts={data.totals} />
          </div>
        ) : null}
      </section>

      <section className="gg-card" aria-labelledby="invoice-shops-heading">
        <h2 id="invoice-shops-heading" className="text-h3 text-text-primary m-0 mb-1">
          By shop
        </h2>
        <p className="text-body text-text-secondary m-0 mb-3 max-w-prose">
          Shops with paper to pick up come first. A shop stays on this list for the month even if
          it no longer works with GRIDGO.
        </p>
        {!pending && !data.shops.length ? (
          <EmptyState
            title={`No invoices expected for ${label}`}
            body="An invoice is expected once an order becomes ready for pick-up. Try an earlier month."
            action={
              <Button variant="secondary" onClick={() => setParams({ month: shiftMonth(month, -1), shop: null, order: null })}>
                <ChevronLeft data-icon="inline-start" aria-hidden />
                {monthLabel(shiftMonth(month, -1))}
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={shopColumns}
            data={sortedShops}
            loading={pending}
            getRowId={(shop) => shop.supplierId}
            caption={`Supplier invoices by shop, ${label}`}
            itemLabel="shops"
            rowActions={(shop) => (
              <DataTableRowAction
                label={`Show ${shopName(shop)}'s invoices`}
                icon={ListFilter}
                aria-pressed={shopFilter === shop.supplierId}
                onClick={() => {
                  setParams({ shop: shop.supplierId });
                  document
                    .getElementById("invoice-list-heading")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            )}
          />
        )}
      </section>

      {pending || data.shops.length ? (
        <section className="gg-card" aria-labelledby="invoice-list-heading">
          <h2 id="invoice-list-heading" className="text-h3 text-text-primary m-0 mb-1 scroll-mt-20">
            {selectedShop ? `${shopName(selectedShop)}'s invoices` : "Every invoice"}
          </h2>
          <p className="text-body text-text-secondary m-0 mb-3 max-w-prose">
            Open an invoice to see the scan and what the shop entered. Record the paper original
            once it is in GRIDGO&rsquo;s hands.
          </p>
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            <ToggleGroup
              value={[view]}
              onValueChange={(values) => {
                const next = values[0] as InvoiceView | undefined;
                if (next) setParams({ view: next === "all" ? null : next });
              }}
              variant="outline"
              spacing={0}
              aria-label="Show invoices"
              className="flex flex-wrap gap-1"
            >
              {INVOICE_VIEWS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                  {scopeCounts ? ` · ${viewCount(scopeCounts, option.value)}` : ""}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Select
              value={shopFilter ?? ALL_SHOPS}
              onValueChange={(value) =>
                setParams({ shop: !value || value === ALL_SHOPS ? null : String(value) })
              }
            >
              <SelectTrigger className="min-h-11 w-full md:ml-auto md:w-64" aria-label="Shop">
                <SelectValue>
                  {(value) =>
                    !value || value === ALL_SHOPS
                      ? "Every shop"
                      : shopName(shopsById.get(String(value)))
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SHOPS}>Every shop</SelectItem>
                {sortedShops.map((shop) => (
                  <SelectItem key={shop.supplierId} value={shop.supplierId}>
                    {shopName(shop)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {data?.truncated ? (
            <p className="text-body text-text-primary m-0 mb-3">
              This month has more orders than the desk lists at once. The counts above are
              complete; pick a shop to see all of its invoices.
            </p>
          ) : null}
          {!pending && !visible.length ? (
            <EmptyState
              title={emptyTitle(view)}
              body={
                view === "all"
                  ? "This shop has no invoices expected this month."
                  : "Nothing in this view. Show every invoice to see the rest."
              }
              action={
                view === "all" ? undefined : (
                  <Button variant="secondary" onClick={() => setParams({ view: null })}>
                    Show every invoice
                  </Button>
                )
              }
            />
          ) : (
            <DataTable
              columns={invoiceColumns}
              data={visible}
              loading={pending}
              getRowId={(row) => row.orderId}
              caption={`Supplier invoices, ${label}`}
              filterPlaceholder="Find an order, invoice number or shop…"
              itemLabel="invoices"
              pageSize={25}
              rowActions={(row) => (
                <>
                  <DataTableRowAction
                    label="Open invoice"
                    icon={Eye}
                    onClick={() => setParams({ order: row.orderId })}
                  />
                  {canCollect(row) ? (
                    <DataTableRowAction
                      label="Mark original collected"
                      icon={PackageCheck}
                      onClick={() => setConfirming(row)}
                    />
                  ) : null}
                </>
              )}
            />
          )}
        </section>
      ) : null}

      <SupplierInvoiceSheet
        tree={tree}
        invoice={openInvoice || null}
        shopName={openInvoice ? shopName(shopsById.get(openInvoice.supplierId)) : ""}
        orderTitle={openInvoice ? (titles.get(openInvoice.orderId) ?? null) : null}
        onClose={() => setParams({ order: null })}
        onCollect={setConfirming}
      />
      <CollectInvoiceDialog
        invoice={confirming}
        shopName={confirming ? shopName(shopsById.get(confirming.supplierId)) : ""}
        orderName={confirming ? orderName(confirming.orderId) : ""}
        onCancel={() => setConfirming(null)}
        onCollected={replaceInvoice}
        onStale={() => void load()}
      />
    </div>
  );
}

function countColumn(
  id: string,
  header: string,
  value: (shop: SupplierInvoiceShop) => number,
  emphasise = false,
): DataTableColumn<SupplierInvoiceShop> {
  return {
    id,
    header,
    sortValue: value,
    cell: (shop) => {
      const count = value(shop);
      return (
        <span
          className={
            emphasise && count > 0
              ? "text-body text-text-primary tabular-nums"
              : "text-body text-text-secondary tabular-nums"
          }
          style={emphasise && count > 0 ? { fontFamily: "var(--font-bold)" } : undefined}
        >
          {count}
        </span>
      );
    },
  };
}

function emptyTitle(view: InvoiceView): string {
  switch (view) {
    case "missing":
      return "Every scan is in";
    case "to_collect":
      return "Every original is collected";
    case "collected":
      return "No originals collected yet";
    default:
      return "No invoices";
  }
}

function MonthBar({
  month,
  thisMonth,
  loading,
  onMonth,
  onRefresh,
}: {
  month: string;
  thisMonth: string;
  loading: boolean;
  onMonth: (month: string) => void;
  onRefresh: () => void;
}) {
  const atLatest = month >= thisMonth;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1" role="group" aria-label="Month">
        <Button
          variant="outline"
          size="icon"
          aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`}
          onClick={() => onMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <p
          className="text-h3 text-text-primary m-0 min-w-44 px-2 text-center tabular-nums"
          aria-live="polite"
        >
          {monthLabel(month)}
        </p>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`}
          disabled={atLatest}
          onClick={() => onMonth(shiftMonth(month, 1))}
        >
          <ChevronRight aria-hidden />
        </Button>
        {month !== thisMonth ? (
          <Button variant="ghost" onClick={() => onMonth(thisMonth)}>
            This month
          </Button>
        ) : null}
      </div>
      <Button variant="secondary" disabled={loading} onClick={onRefresh}>
        {loading ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );
}
