"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bike, Eye, MapPin, PackageCheck, RefreshCw } from "lucide-react";

import {
  filterDispatchOrders,
  formatCoords,
  locationTone,
  presentLocation,
  type LocationView,
} from "@/app/ops/_lib/dispatch";
import { presentZone } from "@/app/ops/_lib/present";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  ApiError,
  getDispatchLocation,
  listDispatchOffers,
  listOrders,
  recordCollection,
  transitionOrder,
} from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime } from "@/lib/format";
import { presentOrderState, presentTimelineActor } from "@/lib/order-state";

/** Demo rider when order has none — same honesty as QA workspace. */
const DEMO_RIDER_ID = "user_rider";

type LocationMap = Record<string, LocationView>;

export default function OpsDispatchPage() {
  const searchParams = useSearchParams();
  const focusOrder = searchParams.get("order");

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [offers, setOffers] = useState<Order[]>([]);
  const [locations, setLocations] = useState<LocationMap>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locLoading, setLocLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<Order | null>(null);
  const [collector, setCollector] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [all, offerList] = await Promise.all([
          listOrders(),
          listDispatchOffers().catch(() => [] as Order[]),
        ]);
        setOrders(all);
        setOffers(offerList);
        // Locations are session-memory only — never localStorage / never treated as durable.
        setLocations({});
      } catch (err) {
        setOrders(null);
        if (err instanceof ApiError) {
          setError(`Could not load dispatch board (${err.code}).`);
        } else {
          setError("Network error loading dispatch.");
        }
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload(["dispatch", "orders"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const board = useMemo(() => (orders ? filterDispatchOrders(orders) : []), [orders]);

  const refreshLocations = useSerializedLoad(
    useCallback(async (list: Order[]) => {
      const trackable = list.filter(
        (o) =>
          o.riderId &&
          (o.state === "picked_up" ||
            o.state === "out_for_delivery" ||
            o.state === "rider_assigned"),
      );
      if (!trackable.length) {
        setLocations({});
        return;
      }
      setLocLoading(true);
      const next: LocationMap = {};
      await Promise.all(
        trackable.map(async (o) => {
          try {
            const ping = await getDispatchLocation(o.id);
            next[o.id] = presentLocation(ping, o.state);
          } catch {
            next[o.id] = presentLocation(null, o.state);
          }
        }),
      );
      // In-memory only for this view refresh.
      setLocations(next);
      setLocLoading(false);
    }, []),
  );

  useEffect(() => {
    if (board.length) void refreshLocations(board);
  }, [board, refreshLocations]);

  useLiveReload("location", () => refreshLocations(board));

  /*
    Releasing a collected order at the counter.

    It asks for a name rather than being a bare confirm, because that name is
    the only record of who walked away with somebody else's paid print job. The
    balance is checked by the platform, not here — if it is not settled the
    release is refused and says so.
  */
  async function releaseAtCounter() {
    const order = releasing;
    if (!order || !collector.trim()) return;
    setActing(order.id);
    setActionError(null);
    try {
      await recordCollection(order.id, collector.trim());
      setReleasing(null);
      setCollector("");
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(
          err.code === "final_payment_not_confirmed"
            ? "This order still owes its remaining balance. Confirm the client's payment before releasing it."
            : `Could not release this order (${err.code}).`,
        );
      } else {
        setActionError("Network error while releasing the order.");
      }
    } finally {
      setActing(null);
    }
  }

  async function assignRider(order: Order) {
    setActing(order.id);
    setActionError(null);
    try {
      await transitionOrder(order.id, "rider_assigned", {
        riderId: order.riderId || DEMO_RIDER_ID,
        note: "Rider assigned for pickup",
      });
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(`Could not assign rider (${err.code}).`);
      } else {
        setActionError("Network error while assigning rider.");
      }
    } finally {
      setActing(null);
    }
  }

  const columns = useMemo<DataTableColumn<Order>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        sortValue: (o) => o.title,
        filterValue: (o) => `${o.title} ${o.id} ${o.riderId ?? ""} ${o.zone}`,
        cell: (o) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {o.title}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">Order {o.id}</p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {presentZone(o.zone)}
              {focusOrder === o.id ? " · focused" : ""}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (o) => presentOrderState(o.state).label,
        cell: (o) => {
          const s = presentOrderState(o.state);
          return <StatusChip tone={s.tone} label={s.label} icon={s.icon} />;
        },
      },
      {
        id: "rider",
        header: "Rider",
        sortValue: (o) => o.riderId ?? "",
        cell: (o) => (
          <span className="text-body text-text-secondary">
            {o.riderId ? presentTimelineActor(o.riderId) : "Unassigned"}
          </span>
        ),
      },
      {
        id: "location",
        header: "Location",
        sortValue: (o) => locations[o.id]?.label ?? "",
        cell: (o) => {
          const loc = locations[o.id] ?? presentLocation(null, o.state);
          return (
            <div className="flex flex-col gap-1">
              <StatusChip
                tone={locationTone(loc.freshness)}
                label={loc.label}
                icon={
                  loc.freshness === "live"
                    ? "circle-check"
                    : loc.freshness === "stale"
                      ? "triangle-alert"
                      : "clock"
                }
              />
              {loc.lat != null && loc.lng != null ? (
                <span className="text-caption text-text-muted">
                  {formatCoords(loc.lat, loc.lng)}
                  {loc.freshness === "stale" && loc.at
                    ? ` · last ${formatDateTime(loc.at)}`
                    : loc.at
                      ? ` · ${formatDateTime(loc.at)}`
                      : ""}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "promised",
        header: "Promised",
        sortValue: (o) => o.promisedDate || "",
        cell: (o) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(o.promisedDate)}
          </span>
        ),
      },
    ],
    [locations, focusOrder],
  );

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

  const pending = loading && !orders;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Riders and orders in delivery states. Location is re-fetched only — stale pings
          are never shown as live, and nothing is stored on this device.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={locLoading}
            onClick={() => void refreshLocations(board)}
          >
            <RefreshCw size={16} aria-hidden />
            {locLoading ? "Refreshing location…" : "Refresh location"}
          </Button>
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            Refresh board
          </Button>
        </div>
      </div>

      {actionError ? (
        <p className="text-body text-error m-0" role="alert">
          {actionError}
        </p>
      ) : null}

      {offers.length > 0 ? (
        <section className="gg-card" aria-labelledby="offers-heading">
          <h2 id="offers-heading" className="text-h3 text-text-primary m-0 mb-2">
            Open dispatch offers ({offers.length})
          </h2>
          <p className="text-caption text-text-muted m-0 mb-3">
            Offers visible to riders. Accept and proof stay on the rider app.
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {offers.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-subtle pt-2 first:border-0 first:pt-0"
              >
                <span className="min-w-0">
                  <span className="text-body text-text-primary block">{o.title}</span>
                  <span className="text-caption text-text-muted">Order {o.id}</span>
                </span>
                <StatusChip
                  tone={presentOrderState(o.state).tone}
                  label={presentOrderState(o.state).label}
                  icon={presentOrderState(o.state).icon}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!pending && !board.length ? (
        <EmptyState
          title="No orders in dispatch"
          body="Orders appear when production clears self-QC and is ready for pickup. Nothing is out with a rider right now."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={board}
          loading={pending}
          getRowId={(o) => o.id}
          caption="Dispatch board"
          filterPlaceholder="Filter dispatch…"
          defaultSortId="status"
          rowActions={(o) => (
            <>
              {o.state === "ready_for_dispatch" ? (
                <DataTableRowAction
                  label="Assign rider"
                  icon={Bike}
                  disabled={acting !== null}
                  onClick={() => void assignRider(o)}
                />
              ) : null}
              {o.state === "awaiting_collection" ? (
                <DataTableRowAction
                  label="Release at counter"
                  icon={PackageCheck}
                  disabled={acting !== null}
                  onClick={() => {
                    setCollector("");
                    setActionError(null);
                    setReleasing(o);
                  }}
                />
              ) : null}
              <DataTableRowAction label="Open" icon={Eye} href={`/ops/orders/${o.id}`} />
            </>
          )}
        />
      )}

      <Dialog
        open={releasing !== null}
        onOpenChange={(open) => {
          if (!open) setReleasing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release at the counter</DialogTitle>
            <DialogDescription>
              {releasing?.title} is on the GRIDGO Office counter. Recording this hands it
              to the client, releases the shop&apos;s final payout and starts the issue
              window.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="collector">Collected by</FieldLabel>
            <Input
              id="collector"
              value={collector}
              autoComplete="off"
              onChange={(event) => setCollector(event.target.value)}
              placeholder="Name of the person at the counter"
            />
            <FieldDescription>
              Written into the order&apos;s record. It is the only proof of who took this
              package.
            </FieldDescription>
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReleasing(null)}>
              Cancel
            </Button>
            <Button
              disabled={!collector.trim() || acting !== null}
              onClick={() => void releaseAtCounter()}
            >
              Release order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-caption text-text-muted m-0 flex items-start gap-2">
        <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Assign rider uses the demo rider when no directory endpoint exists. Tracking
          becomes active after pickup; before that the board shows “Tracking starts at
          pickup”, not a fake live pin.
        </span>
      </p>
    </div>
  );
}
