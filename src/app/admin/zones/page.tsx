"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { createZone, listZones, updateZone } from "@/lib/api/client";
import type { Zone } from "@/lib/api/types";

export default function AdminZonesPage() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [editing, setEditing] = useState<Zone | null | "new">(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);

  const load = useSerializedLoad(useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setZones(await listZones());
    } catch (err) {
      setZones(null);
      setError(
        adminErrorMessage(
          err,
          "Could not load delivery zones. Confirm the demo API is running.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []));

  useLiveReload(["settings"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing("new");
    setCode("");
    setName("");
    setActive(true);
    setActionError(null);
  };

  const openEdit = (z: Zone) => {
    setEditing(z);
    setCode(z.code);
    setName(z.name);
    setActive(z.active);
    setActionError(null);
  };

  const columns = useMemo<DataTableColumn<Zone>[]>(
    () => [
      {
        id: "name",
        header: "Zone",
        primary: true,
        sortValue: (z) => z.name,
        filterValue: (z) => `${z.name} ${z.code}`,
        cell: (z) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {z.name}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {z.code.replace(/_/g, " ")}
            </p>
          </div>
        ),
      },
      {
        id: "active",
        header: "Status",
        sortValue: (z) => (z.active ? 1 : 0),
        cell: (z) =>
          z.active ? (
            <StatusChip tone="success" label="Active" icon="circle-check" />
          ) : (
            <StatusChip tone="neutral" label="Inactive" icon="circle-x" />
          ),
      },
    ],
    [],
  );

  async function save() {
    if (!name.trim()) {
      setActionError("Give the zone a name clients will recognise.");
      return;
    }
    if (editing === "new" && !code.trim()) {
      setActionError("Give the zone a code. It is how orders refer to it.");
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      if (editing === "new") {
        await createZone({
          code: code.trim().toLowerCase().replace(/\s+/g, "_"),
          name: name.trim(),
          active,
        });
        setActionOk("Zone created. Clients can choose it on a new order.");
      } else if (editing) {
        await updateZone(editing.id, { name: name.trim(), active });
        setActionOk("Zone updated.");
      }
      setEditing(null);
      await load();
    } catch (err) {
      setActionError(adminErrorMessage(err, "Could not save the zone."));
    } finally {
      setBusy(false);
    }
  }

  const pending = loading && !zones;

  if (!pending && (error || !zones)) {
    return (
      <ErrorState
        body={error ?? "No data."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          The delivery areas a client picks from when placing an order. Zones
          name a place and nothing more — what delivery costs comes from the
          distance between the supplier and the address.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
          <Button variant="primary" disabled={pending} onClick={openNew}>
            Add zone
          </Button>
        </div>
      </div>

      <p className="text-body text-text-secondary m-0 max-w-prose">
        Delivery pricing lives in{" "}
        <Button variant="link" nativeButton={false} render={<Link href="/admin/settings" />}>
          Operational settings
        </Button>
        , as bands of distance.
      </p>

      {actionOk ? (
        <p className="text-body text-success m-0" role="status">
          {actionOk}
        </p>
      ) : null}

      {!pending && !zones?.length ? (
        <EmptyState
          title="No delivery zones"
          body="Add a zone so clients have somewhere to send an order to."
          action={
            <Button variant="secondary" onClick={openNew}>
              Add the first zone
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={zones ?? []}
          loading={pending}
          getRowId={(z) => z.id}
          caption="Delivery zones"
          filterPlaceholder="Filter zones…"
          defaultSortId="name"
          rowActions={(z) => (
            <DataTableRowAction
              label="Edit"
              icon={Pencil}
              onClick={() => openEdit(z)}
            />
          )}
        />
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setActionError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Add delivery zone" : "Edit delivery zone"}
            </DialogTitle>
            <DialogDescription>
              A zone is the area a client chooses on an order. It carries no
              price of its own.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            {editing === "new" ? (
              <Field>
                <FieldLabel htmlFor="zone-code">Code</FieldLabel>
                <Input
                  id="zone-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. davao central"
                  autoComplete="off"
                />
                <FieldDescription>
                  Set once and never changed — orders refer to it.
                </FieldDescription>
              </Field>
            ) : editing ? (
              <p className="text-caption text-text-muted m-0">
                Code {editing.code.replace(/_/g, " ")}
              </p>
            ) : null}
            <Field>
              <FieldLabel htmlFor="zone-name">Display name</FieldLabel>
              <Input
                id="zone-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
            <Field orientation="horizontal" className="items-center">
              <Switch
                id="zone-active"
                checked={active}
                onCheckedChange={setActive}
              />
              <FieldLabel htmlFor="zone-active">Active for new orders</FieldLabel>
            </Field>
          </FieldGroup>

          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save zone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
