"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import {
  usageBlastCopy,
  usageForCategory,
  usageForFinish,
  usageForMaterial,
  type TaxonomyUsage,
} from "@/app/admin/_lib/taxonomy-usage";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createTaxonomyCategory,
  createTaxonomyFinish,
  createTaxonomyMaterial,
  getTaxonomy,
  listSupplierServices,
  updateTaxonomyCategory,
  updateTaxonomyFinish,
  updateTaxonomyMaterial,
} from "@/lib/api/client";
import type {
  SupplierService,
  Taxonomy,
  TaxonomyCategory,
  TaxonomyFinish,
  TaxonomyMaterial,
} from "@/lib/api/types";

type EditTarget =
  | { kind: "category"; item: TaxonomyCategory | null }
  | { kind: "material"; item: TaxonomyMaterial | null }
  | { kind: "finish"; item: TaxonomyFinish | null };

export default function AdminCataloguePage() {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [services, setServices] = useState<SupplierService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  /** Controlled tab so the single page-level yellow CTA matches the open panel. */
  const [tab, setTab] = useState<"categories" | "materials" | "finishes">(
    "categories",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tax, svc] = await Promise.all([
        getTaxonomy(),
        listSupplierServices(),
      ]);
      setTaxonomy(tax);
      setServices(svc);
    } catch (err) {
      setTaxonomy(null);
      setError(
        adminErrorMessage(
          err,
          "Could not load taxonomy. Confirm the demo API is running.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = (kind: EditTarget["kind"]) => {
    setEdit({ kind, item: null });
    setCode("");
    setName("");
    setActive(true);
    setActionError(null);
  };

  const openEdit = (target: EditTarget) => {
    setEdit(target);
    if (target.item) {
      setCode(target.item.code);
      setName(target.item.name);
      setActive(target.item.active);
    }
    setActionError(null);
  };

  const usageForEdit = useMemo((): TaxonomyUsage | null => {
    if (!edit?.item) return null;
    if (edit.kind === "category") {
      return usageForCategory(services, edit.item.code);
    }
    if (edit.kind === "material") {
      return usageForMaterial(services, edit.item.code);
    }
    return usageForFinish(services, edit.item.code);
  }, [edit, services]);

  async function save() {
    if (!edit) return;
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toLowerCase().replace(/\s+/g, "_");
    if (!trimmedName) {
      setActionError("Name is required.");
      return;
    }
    if (!edit.item && !trimmedCode) {
      setActionError("Code is required for new entries.");
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      if (edit.kind === "category") {
        if (edit.item) {
          await updateTaxonomyCategory(edit.item.id, {
            name: trimmedName,
            active,
          });
        } else {
          await createTaxonomyCategory({
            code: trimmedCode,
            name: trimmedName,
            active,
          });
        }
      } else if (edit.kind === "material") {
        if (edit.item) {
          await updateTaxonomyMaterial(edit.item.id, {
            name: trimmedName,
            active,
          });
        } else {
          await createTaxonomyMaterial({
            code: trimmedCode,
            name: trimmedName,
            active,
          });
        }
      } else if (edit.item) {
        await updateTaxonomyFinish(edit.item.id, {
          name: trimmedName,
          active,
        });
      } else {
        await createTaxonomyFinish({
          code: trimmedCode,
          name: trimmedName,
          active,
        });
      }
      setActionOk(
        edit.item
          ? `Updated ${trimmedName}. Suppliers declare against this taxonomy.`
          : `Created ${trimmedName}.`,
      );
      setEdit(null);
      await load();
    } catch (err) {
      setActionError(adminErrorMessage(err, "Could not save taxonomy entry."));
    } finally {
      setBusy(false);
    }
  }

  const categoryColumns = useMemo<DataTableColumn<TaxonomyCategory>[]>(
    () => [
      {
        id: "name",
        header: "Category",
        primary: true,
        sortValue: (c) => c.name,
        filterValue: (c) => `${c.name} ${c.code}`,
        cell: (c) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {c.name}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {c.code.replace(/_/g, " ")}
            </p>
          </div>
        ),
      },
      {
        id: "active",
        header: "Availability",
        sortValue: (c) => (c.active ? 1 : 0),
        cell: (c) =>
          c.active ? (
            <StatusChip tone="success" label="Active" icon="circle-check" />
          ) : (
            <StatusChip tone="neutral" label="Inactive" icon="circle-x" />
          ),
      },
      {
        id: "usage",
        header: "In use by services",
        sortValue: (c) => usageForCategory(services, c.code).total,
        cell: (c) => {
          const u = usageForCategory(services, c.code);
          return (
            <span className="text-body text-text-secondary">
              {u.total === 0
                ? "None"
                : `${u.total} total · ${u.live} live`}
            </span>
          );
        },
      },
    ],
    [services],
  );

  const materialColumns = useMemo<DataTableColumn<TaxonomyMaterial>[]>(
    () => [
      {
        id: "name",
        header: "Material",
        primary: true,
        sortValue: (m) => m.name,
        filterValue: (m) => `${m.name} ${m.code}`,
        cell: (m) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {m.name}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {m.code.replace(/_/g, " ")}
            </p>
          </div>
        ),
      },
      {
        id: "active",
        header: "Availability",
        sortValue: (m) => (m.active ? 1 : 0),
        cell: (m) =>
          m.active ? (
            <StatusChip tone="success" label="Active" icon="circle-check" />
          ) : (
            <StatusChip tone="neutral" label="Inactive" icon="circle-x" />
          ),
      },
      {
        id: "usage",
        header: "In use by services",
        sortValue: (m) => usageForMaterial(services, m.code).total,
        cell: (m) => {
          const u = usageForMaterial(services, m.code);
          return (
            <span className="text-body text-text-secondary">
              {u.total === 0
                ? "None"
                : `${u.total} total · ${u.live} live`}
            </span>
          );
        },
      },
    ],
    [services],
  );

  const finishColumns = useMemo<DataTableColumn<TaxonomyFinish>[]>(
    () => [
      {
        id: "name",
        header: "Finish",
        primary: true,
        sortValue: (f) => f.name,
        filterValue: (f) => `${f.name} ${f.code}`,
        cell: (f) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {f.name}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {f.code.replace(/_/g, " ")}
            </p>
          </div>
        ),
      },
      {
        id: "active",
        header: "Availability",
        sortValue: (f) => (f.active ? 1 : 0),
        cell: (f) =>
          f.active ? (
            <StatusChip tone="success" label="Active" icon="circle-check" />
          ) : (
            <StatusChip tone="neutral" label="Inactive" icon="circle-x" />
          ),
      },
      {
        id: "usage",
        header: "In use by services",
        sortValue: (f) => usageForFinish(services, f.code).total,
        cell: (f) => {
          const u = usageForFinish(services, f.code);
          return (
            <span className="text-body text-text-secondary">
              {u.total === 0
                ? "None"
                : `${u.total} total · ${u.live} live`}
            </span>
          );
        },
      },
    ],
    [services],
  );

  const pending = loading && !taxonomy;

  if (!pending && (error || !taxonomy)) {
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
          Platform-governed service taxonomy. Suppliers declare categories,
          materials, and finishes against these codes — editing them changes
          what the marketplace can express. Live service usage is shown before
          you save.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              openCreate(
                tab === "categories"
                  ? "category"
                  : tab === "materials"
                    ? "material"
                    : "finish",
              )
            }
          >
            {tab === "categories"
              ? "Add category"
              : tab === "materials"
                ? "Add material"
                : "Add finish"}
          </Button>
        </div>
      </div>

      {actionOk ? (
        <p className="text-body text-success m-0" role="status">
          {actionOk}
        </p>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (
            value === "categories" ||
            value === "materials" ||
            value === "finishes"
          ) {
            setTab(value);
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="categories">
            Categories
            {taxonomy ? ` (${taxonomy.categories.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="materials">
            Materials
            {taxonomy ? ` (${taxonomy.materials.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="finishes">
            Finishes
            {taxonomy ? ` (${taxonomy.finishes.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="mt-4 flex flex-col gap-3">
          {!pending && !taxonomy?.categories.length ? (
            <EmptyState
              title="No categories"
              body="Use Add category above so suppliers can declare service lines against a platform code."
            />
          ) : (
            <DataTable
              columns={categoryColumns}
              data={taxonomy?.categories ?? []}
              loading={pending}
              getRowId={(c) => c.id}
              caption="Taxonomy categories"
              filterPlaceholder="Filter categories…"
              rowActions={(c) => (
                <DataTableRowAction
                  label="Edit"
                  icon={Pencil}
                  onClick={() => openEdit({ kind: "category", item: c })}
                />
              )}
            />
          )}
        </TabsContent>

        <TabsContent value="materials" className="mt-4 flex flex-col gap-3">
          {!pending && !taxonomy?.materials.length ? (
            <EmptyState
              title="No materials"
              body="Use Add material above so suppliers can attach materials to service declarations."
            />
          ) : (
            <DataTable
              columns={materialColumns}
              data={taxonomy?.materials ?? []}
              loading={pending}
              getRowId={(m) => m.id}
              caption="Taxonomy materials"
              filterPlaceholder="Filter materials…"
              rowActions={(m) => (
                <DataTableRowAction
                  label="Edit"
                  icon={Pencil}
                  onClick={() => openEdit({ kind: "material", item: m })}
                />
              )}
            />
          )}
        </TabsContent>

        <TabsContent value="finishes" className="mt-4 flex flex-col gap-3">
          {!pending && !taxonomy?.finishes.length ? (
            <EmptyState
              title="No finishes"
              body="Use Add finish above so suppliers can attach finishes to service declarations."
            />
          ) : (
            <DataTable
              columns={finishColumns}
              data={taxonomy?.finishes ?? []}
              loading={pending}
              getRowId={(f) => f.id}
              caption="Taxonomy finishes"
              filterPlaceholder="Filter finishes…"
              rowActions={(f) => (
                <DataTableRowAction
                  label="Edit"
                  icon={Pencil}
                  onClick={() => openEdit({ kind: "finish", item: f })}
                />
              )}
            />
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!edit}
        onOpenChange={(open) => {
          if (!open) {
            setEdit(null);
            setActionError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {edit?.item ? "Edit" : "Add"} {edit?.kind}
            </DialogTitle>
            <DialogDescription>
              Suppliers declare against this taxonomy. Changes reshape what the
              whole marketplace can express.
            </DialogDescription>
          </DialogHeader>

          {usageForEdit ? (
            <div
              className="rounded-field border border-outline bg-surface-variant px-3 py-3"
              role="note"
            >
              <p className="text-body text-text-primary m-0">
                {usageBlastCopy(usageForEdit, edit?.kind ?? "entry")}
              </p>
            </div>
          ) : null}

          <FieldGroup>
            {!edit?.item ? (
              <Field>
                <FieldLabel htmlFor="tax-code">Code</FieldLabel>
                <Input
                  id="tax-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. large format"
                  autoComplete="off"
                />
              </Field>
            ) : (
              <p className="text-caption text-text-muted m-0">
                Code {edit.item.code.replace(/_/g, " ")} (immutable here)
              </p>
            )}
            <Field>
              <FieldLabel htmlFor="tax-name">Name</FieldLabel>
              <Input
                id="tax-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
            <Field orientation="horizontal" className="items-center">
              <Switch
                id="tax-active"
                checked={active}
                onCheckedChange={setActive}
              />
              <FieldLabel htmlFor="tax-active">Active for new declarations</FieldLabel>
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
              onClick={() => setEdit(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
