"use client";

/**
 * Assign a rider to an order that is ready at the shop, choosing from the
 * riders the API would accept.
 *
 * One request, the one the dispatch board has always sent:
 * `POST /orders/:id/transition {state:"rider_assigned", riderId, note}`. The
 * rider list is the portal's existing `GET /users?role=rider`, narrowed to the
 * approved, active riders the API checks for (`assignableRiders`). A pin
 * payment still waiting on Operations holds the assignment here, as it does
 * on the board and in the API.
 */

import { useEffect, useState } from "react";

import { assignableRiders, assignRiderErrorMessage } from "@/app/ops/_lib/dispatch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkeletonLines } from "@/components/ui/loading";
import { toast } from "@/components/ui/toast";
import { VehicleGlyph } from "@/components/riders/VehicleGlyph";
import { listUsers, transitionOrder } from "@/lib/api/client";
import type { Order, User } from "@/lib/api/types";
import { pinDispatchBlocker } from "@/lib/delivery-pin";
import { vehicleSummary } from "@/lib/vehicle";

type Props = {
  order: Order | null;
  /** The rider directory, when the page already holds it. Read on open otherwise. */
  riders?: readonly User[];
  onClose: () => void;
  /** The rider was assigned: re-read the page. */
  onAssigned: () => void;
};

export function AssignRiderDialog({ order, riders, onClose, onAssigned }: Props) {
  const [loaded, setLoaded] = useState<readonly User[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = order !== null;
  useEffect(() => {
    setError(null);
    if (!open || riders) return;
    let cancelled = false;
    setLoaded(null);
    setLoadError(null);
    listUsers("rider").then(
      (list) => {
        if (!cancelled) setLoaded(list);
      },
      () => {
        if (!cancelled)
          setLoadError("The rider list could not be loaded. Close and try again.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, riders]);

  const directory = riders ?? loaded;
  const eligible = directory ? assignableRiders(directory) : null;
  const blocker = pinDispatchBlocker(order);

  async function assign(rider: User) {
    if (!order) return;
    setAssigning(rider.id);
    setError(null);
    try {
      await transitionOrder(order.id, "rider_assigned", {
        riderId: rider.id,
        note: "Rider assigned for pickup",
      });
      toast.add({
        type: "success",
        title: "Rider assigned",
        description: `${rider.name || "The rider"} picks up ${order.title || `order ${order.id}`}.`,
      });
      onAssigned();
      onClose();
    } catch (err) {
      setError(assignRiderErrorMessage(err));
    } finally {
      setAssigning(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && assigning === null) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign a rider</DialogTitle>
          <DialogDescription>
            {order?.title || "Untitled order"} is ready at the shop. Choose who picks it
            up; they check it with the shop at pickup.
          </DialogDescription>
        </DialogHeader>

        {blocker ? (
          <p className="text-body text-text-primary m-0" role="note">
            {blocker}
          </p>
        ) : loadError ? (
          <p className="text-body text-text-primary m-0" role="alert">
            {loadError}
          </p>
        ) : !eligible ? (
          <SkeletonLines lines={3} />
        ) : eligible.length === 0 ? (
          <p className="text-body text-text-secondary m-0">
            No approved rider can take this job. Approve a rider under Sign-ups first.
          </p>
        ) : (
          <ul
            aria-label="Approved riders"
            className="m-0 flex list-none flex-col gap-2 p-0"
          >
            {eligible.map((rider) => {
              const vehicleType = rider.riderProfile?.vehicleType ?? null;
              const name = rider.name || "Unnamed rider";
              return (
                <li
                  key={rider.id}
                  className="flex items-center justify-between gap-3 rounded-card border border-outline-subtle px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="bg-surface-variant text-text-secondary flex size-9 shrink-0 items-center justify-center rounded-field"
                      aria-hidden
                    >
                      <VehicleGlyph vehicleType={vehicleType} size={18} />
                    </span>
                    <span className="min-w-0">
                      <span
                        className="text-body text-text-primary block truncate"
                        style={{ fontFamily: "var(--font-medium)" }}
                      >
                        {name}
                      </span>
                      <span className="text-caption text-text-muted block truncate">
                        {vehicleSummary(vehicleType, rider.riderProfile?.plateNumber)}
                      </span>
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    aria-label={`Assign ${name}`}
                    disabled={assigning !== null}
                    onClick={() => void assign(rider)}
                  >
                    {assigning === rider.id ? "Assigning…" : "Assign"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {error ? (
          <p className="text-body text-text-primary m-0" role="alert">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
