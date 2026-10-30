"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bike, Eye, MapPin, PackageCheck, RefreshCw } from "lucide-react";

import { filterDispatchOrders, presentRouteAction } from "@/app/ops/_lib/dispatch";
import { presentZone } from "@/app/ops/_lib/present";
import { StaleRiders } from "@/components/riders/StaleRiders";
import { VehicleGlyph } from "@/components/riders/VehicleGlyph";
import { useRiderLocations } from "@/components/riders/useRiderLocations";
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
import { TestOrderChip } from "@/components/orders/TestOrders";
import { ExpressChip } from "@/components/ui/ExpressChip";
import { StatusChip } from "@/components/ui/StatusChip";
import { isExpressOrder } from "@/lib/express";
import {
  ApiError,
  listDispatchOffers,
  listOrders,
  listUsers,
  recordCollection,
  transitionOrder,
} from "@/lib/api/client";
import type { Order, RiderLocation, User } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime } from "@/lib/format";
import {
  presentOrderState,
  presentTimelineActor,
  type StatusIconName,
  type StatusTone,
} from "@/lib/order-state";
import {
  ACTIVE_TRACKING_STATES,
  freshnessIcon,
  freshnessLabel,
  freshnessTone,
  ridersToContact,
  type RiderLocationView,
} from "@/lib/rider-tracking";
import { vehicleSummary } from "@/lib/vehicle";
import {
  pinDispatchBlocker,
  pinNotesLine,
  pinReceiverLine,
  presentPinForDispatch,
} from "@/lib/delivery-pin";

/** Demo rider when order has none — same honesty as QA workspace. */
const DEMO_RIDER_ID = "user_rider";

/** The Location cell for one order: the rider's freshness, or why there is none. */
type LocationCell = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  view: RiderLocationView | null;
};

function locationCell(
  order: Order,
  row: RiderLocation | undefined,
  view: ((row: RiderLocation) => RiderLocationView) | null,
): LocationCell {
  if (order.state === "ready_for_dispatch") {
    return { label: "No rider yet", tone: "neutral", icon: "clock", view: null };
  }
  if (!order.riderId || !ACTIVE_TRACKING_STATES.has(order.state)) {
    return { label: "Not tracked", tone: "neutral", icon: "circle-dot", view: null };
  }
  if (!row || !view) {
    return { label: "Location not read yet", tone: "neutral", icon: "clock", view: null };
  }
  const v = view(row);
  return {
    label: freshnessLabel(v),
    tone: freshnessTone(v.freshness),
    icon: freshnessIcon(v.freshness),
    view: v,
  };
}

function LocationColumn({ order, cell }: { order: Order; cell: LocationCell }) {
  const reasonId = useId();
  const route = presentRouteAction(order.riderId, cell.view, cell.label);
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusChip tone={cell.tone} label={cell.label} icon={cell.icon} />
      {cell.view?.lastUpdatedAt ? (
        <span className="text-caption text-text-muted">
          Last ping {formatDateTime(cell.view.lastUpdatedAt)}
        </span>
      ) : null}
      {route.href ? (
        <Button variant="secondary" nativeButton={false} render={<Link href={route.href} />}>
          {route.label}
        </Button>
      ) : (
        <>
          <Button variant="secondary" disabled aria-describedby={reasonId}>
            {route.label}
          </Button>
          {/* The chip above already says why; this names it for the disabled button. */}
          <span id={reasonId} className="sr-only">
            {route.reason}
          </span>
        </>
      )}
    </div>
  );
}

export default function OpsDispatchPage() {
  const searchParams = useSearchParams();
  const focusOrder = searchParams.get("order");

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [offers, setOffers] = useState<Order[]>([]);
  /** Rider directory, so a row shows who is driving and what they drive. */
  const [ridersById, setRidersById] = useState<Record<string, User>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<Order | null>(null);
  const [collector, setCollector] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [all, offerList, riderList] = await Promise.all([
          listOrders(),
          listDispatchOffers().catch(() => [] as Order[]),
          listUsers("rider").catch(() => [] as User[]),
        ]);
        setOrders(all);
        setOffers(offerList);
        setRidersById(Object.fromEntries(riderList.map((rider) => [rider.id, rider])));
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

  // Every rider on a trip in one read, re-read at the configured interval.
  // Session memory only: nothing about a rider's position is stored here.
  const locations = useRiderLocations();
  const riderRows = useMemo(
    () => new Map((locations.riders ?? []).map((row) => [row.riderId, row])),
    [locations.riders],
  );
  const toContact = useMemo(
    () => ridersToContact(locations.riders ?? [], locations.view),
    [locations.riders, locations.view],
  );

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
        setActionError(
          err.code === "delivery_pin_payment_pending"
            ? "The client's delivery-pin payment is waiting on Operations. Verify or reject it on the order, then assign a rider."
            : `Could not assign rider (${err.code}).`,
        );
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p
                className="text-body text-text-primary m-0"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {o.title}
              </p>
              {isExpressOrder(o) ? <ExpressChip /> : null}
              <TestOrderChip order={o} />
            </div>
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
        sortValue: (o) => presentOrderState(o.state, o).label,
        cell: (o) => {
          const s = presentOrderState(o.state, o);
          return <StatusChip tone={s.tone} label={s.label} icon={s.icon} />;
        },
      },
      {
        id: "rider",
        header: "Rider",
        sortValue: (o) => o.riderId ?? "",
        cell: (o) => {
          if (!o.riderId) {
            return <span className="text-body text-text-secondary">Unassigned</span>;
          }
          const rider = ridersById[o.riderId];
          const vehicleType = rider?.riderProfile?.vehicleType ?? null;
          return (
            <span className="flex items-center gap-2">
              <span
                className="bg-text-primary text-surface flex size-8 shrink-0 items-center justify-center rounded-full"
                aria-hidden
              >
                <VehicleGlyph vehicleType={vehicleType} size={18} />
              </span>
              <span className="min-w-0">
                <span className="text-body text-text-secondary block">
                  {rider?.name ?? presentTimelineActor(o.riderId)}
                </span>
                <span className="text-caption text-text-muted block">
                  {vehicleSummary(vehicleType, rider?.riderProfile?.plateNumber)}
                </span>
              </span>
            </span>
          );
        },
      },
      {
        id: "location",
        header: "Location",
        sortValue: (o) =>
          locationCell(o, riderRows.get(o.riderId ?? ""), locations.view).label,
        cell: (o) => (
          <LocationColumn
            order={o}
            cell={locationCell(o, riderRows.get(o.riderId ?? ""), locations.view)}
          />
        ),
      },
      {
        /*
          Whether the client will be at the pin, who receives it and the notes
          for the rider. A pin payment waiting on Operations holds dispatch
          until someone decides it on the order.
        */
        id: "pin",
        header: "Delivery pin",
        sortValue: (o) => presentPinForDispatch(o)?.label ?? "",
        filterValue: (o) =>
          o.deliveryPin ? `${pinReceiverLine(o.deliveryPin)} ${o.deliveryPin.notes}` : "",
        cell: (o) => {
          const pin = o.deliveryPin;
          const chip = presentPinForDispatch(o);
          if (!pin || !chip) {
            return <span className="text-body text-text-muted">No pin check</span>;
          }
          const blocker = pinDispatchBlocker(o);
          return (
            <div className="flex max-w-64 flex-col items-start gap-1 whitespace-normal">
              <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />
              {blocker ? (
                <Link
                  href={`/ops/orders/${o.id}`}
                  className="text-caption text-text-primary underline-offset-4 hover:underline"
                >
                  Dispatch held. Verify the pin payment on the order
                </Link>
              ) : pin.status === "confirmed" && pin.confirmedAt ? (
                <span className="text-caption text-text-muted">
                  {formatDateTime(pin.confirmedAt)}
                </span>
              ) : null}
              <span className="text-caption text-text-secondary block max-w-64 break-words">
                Receiver: {pinReceiverLine(pin)}
              </span>
              {pin.notes.trim() ? (
                <span className="text-caption text-text-muted block max-w-64 line-clamp-2 break-words">
                  Notes: {pinNotesLine(pin)}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "promised",
        header: "Client promise / shop deadline",
        sortValue: (o) => o.promiseBy || o.readyBy || o.promisedDate || "",
        cell: (o) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {/* Legacy dates remain visible with an honest label when promiseBy is absent. */}
            {o.promiseBy
              ? "Client was promised"
              : o.readyBy
                ? "Shop ready by"
                : "Scheduled date (legacy)"}
            {" · "}
            {formatDateTime(o.promiseBy || o.readyBy || o.promisedDate)}
          </span>
        ),
      },
    ],
    [riderRows, locations.view, focusOrder, ridersById],
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
          Riders and orders in delivery states. Rider locations update every{" "}
          {locations.tracking.refreshIntervalSeconds} seconds; a stale one is never shown
          as live, and nothing is stored on this device.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={locations.loading}
            onClick={() => void locations.reload()}
          >
            <RefreshCw size={16} aria-hidden />
            {locations.loading ? "Refreshing location…" : "Refresh location"}
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

      {locations.error ? (
        <p className="text-body text-error m-0" role="alert">
          {locations.error}
        </p>
      ) : null}

      <StaleRiders
        entries={toContact}
        activeCount={locations.riders?.length ?? 0}
        staleAfterSeconds={locations.tracking.staleAfterSeconds}
        phoneOf={(id) => ridersById[id]?.phone}
        tree="ops"
        orderHref={(id) => `/ops/orders/${id}`}
      />

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
                {isExpressOrder(o) ? (
                  <span className="ml-auto">
                    <ExpressChip />
                  </span>
                ) : null}
                <StatusChip
                  tone={presentOrderState(o.state, o).tone}
                  label={presentOrderState(o.state, o).label}
                  icon={presentOrderState(o.state, o).icon}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!pending && !board.length ? (
        <EmptyState
          title="No orders in dispatch"
          body="Orders appear when the shop marks a job packed and ready for a rider. Nothing is out with a rider right now."
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
                  label={
                    pinDispatchBlocker(o)
                      ? "Assign rider (verify the pin payment first)"
                      : "Assign rider"
                  }
                  icon={Bike}
                  disabled={acting !== null || pinDispatchBlocker(o) !== null}
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
          Assign rider uses the demo rider when no directory endpoint exists. The vehicle
          shown is the one on the rider&apos;s profile. Tracking runs from the moment a
          rider accepts the job until delivery.
        </span>
      </p>
    </div>
  );
}
