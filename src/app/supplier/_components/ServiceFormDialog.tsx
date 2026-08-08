"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  CreateSupplierServiceInput,
  SupplierService,
  Taxonomy,
  Zone,
} from "@/lib/api/types";
import { PRICING_BASIS_OPTIONS } from "@/app/supplier/_lib/service-state";
import {
  activeCategories,
  finishesForCategory,
  materialsForCategory,
} from "@/app/supplier/_lib/taxonomy-labels";

export type ServiceFormValues = {
  categoryCode: string;
  materialCodes: string[];
  finishCodes: string[];
  sizeMin: string;
  sizeMax: string;
  qtyMin: string;
  qtyMax: string;
  pricingBasis: string;
  referenceRatePesos: string;
  turnaroundHours: string;
  capacityDaily: string;
  capacityWeekly: string;
  zones: string[];
  equipmentNotes: string;
};

function emptyValues(defaultCategory?: string): ServiceFormValues {
  return {
    categoryCode: defaultCategory ?? "",
    materialCodes: [],
    finishCodes: [],
    sizeMin: "",
    sizeMax: "",
    qtyMin: "",
    qtyMax: "",
    pricingBasis: "per_unit",
    referenceRatePesos: "",
    turnaroundHours: "24",
    capacityDaily: "",
    capacityWeekly: "",
    zones: [],
    equipmentNotes: "",
  };
}

function fromService(service: SupplierService): ServiceFormValues {
  return {
    categoryCode: service.categoryCode,
    materialCodes: [...service.materialCodes],
    finishCodes: [...service.finishCodes],
    sizeMin: service.sizeMin ?? "",
    sizeMax: service.sizeMax ?? "",
    qtyMin: service.qtyMin != null ? String(service.qtyMin) : "",
    qtyMax: service.qtyMax != null ? String(service.qtyMax) : "",
    pricingBasis: service.pricingBasis || "per_unit",
    referenceRatePesos:
      service.referenceRateMinor != null
        ? String(service.referenceRateMinor / 100)
        : "",
    turnaroundHours: String(service.turnaroundHours || 24),
    capacityDaily:
      service.capacityDaily != null ? String(service.capacityDaily) : "",
    capacityWeekly:
      service.capacityWeekly != null ? String(service.capacityWeekly) : "",
    zones: [...service.zones],
    equipmentNotes: service.equipmentNotes ?? "",
  };
}

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function parsePesosToMinor(raw: string): number {
  const t = raw.trim();
  if (!t) return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function valuesToInput(values: ServiceFormValues): CreateSupplierServiceInput {
  return {
    categoryCode: values.categoryCode,
    materialCodes: values.materialCodes,
    finishCodes: values.finishCodes,
    sizeMin: values.sizeMin.trim() || null,
    sizeMax: values.sizeMax.trim() || null,
    qtyMin: parseOptionalInt(values.qtyMin),
    qtyMax: parseOptionalInt(values.qtyMax),
    pricingBasis: values.pricingBasis,
    referenceRateMinor: parsePesosToMinor(values.referenceRatePesos),
    turnaroundHours: parseOptionalInt(values.turnaroundHours) ?? 24,
    capacityDaily: parseOptionalInt(values.capacityDaily),
    capacityWeekly: parseOptionalInt(values.capacityWeekly),
    zones: values.zones,
    equipmentNotes: values.equipmentNotes.trim(),
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  service?: SupplierService | null;
  taxonomy: Taxonomy;
  zones: Zone[];
  busy?: boolean;
  error?: string | null;
  /** Live edit warning when materials/category expand. */
  onSubmit: (input: CreateSupplierServiceInput) => void | Promise<void>;
};

export function ServiceFormDialog({
  open,
  onOpenChange,
  mode,
  service,
  taxonomy,
  zones,
  busy,
  error,
  onSubmit,
}: Props) {
  const categories = useMemo(() => activeCategories(taxonomy), [taxonomy]);
  const [values, setValues] = useState<ServiceFormValues>(() =>
    emptyValues(categories[0]?.code),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    if (mode === "edit" && service) {
      setValues(fromService(service));
    } else {
      setValues(emptyValues(categories[0]?.code));
    }
  }, [open, mode, service, categories]);

  const materials = useMemo(
    () =>
      values.categoryCode
        ? materialsForCategory(taxonomy, values.categoryCode)
        : [],
    [taxonomy, values.categoryCode],
  );
  const finishes = useMemo(
    () =>
      values.categoryCode
        ? finishesForCategory(taxonomy, values.categoryCode)
        : [],
    [taxonomy, values.categoryCode],
  );

  const categoryItems = useMemo(
    () =>
      categories.map((c) => ({
        label: c.name,
        value: c.code,
      })),
    [categories],
  );

  const pricingItems = useMemo(
    () =>
      PRICING_BASIS_OPTIONS.map((o) => ({
        label: o.label,
        value: o.value,
      })),
    [],
  );

  const capabilityWarning =
    mode === "edit" &&
    service?.state === "live" &&
    (values.categoryCode !== service.categoryCode ||
      values.materialCodes.some((c) => !service.materialCodes.includes(c)));

  function toggleCode(
    field: "materialCodes" | "finishCodes" | "zones",
    code: string,
    checked: boolean,
  ) {
    setValues((prev) => {
      const set = new Set(prev[field]);
      if (checked) set.add(code);
      else set.delete(code);
      return { ...prev, [field]: [...set] };
    });
  }

  function handleCategoryChange(code: string | null) {
    if (!code) return;
    setValues((prev) => {
      // Drop materials/finishes that no longer belong to the new category.
      const mats = materialsForCategory(taxonomy, code).map((m) => m.code);
      const fins = finishesForCategory(taxonomy, code).map((f) => f.code);
      return {
        ...prev,
        categoryCode: code,
        materialCodes: prev.materialCodes.filter((c) => mats.includes(c)),
        finishCodes: prev.finishCodes.filter((c) => fins.includes(c)),
      };
    });
  }

  async function handleSave() {
    setLocalError(null);
    if (!values.categoryCode) {
      setLocalError("Choose a capability category from the platform list.");
      return;
    }
    if (values.materialCodes.length === 0) {
      setLocalError("Pick at least one material the platform already defines.");
      return;
    }
    if (values.zones.length === 0) {
      setLocalError("Select at least one delivery zone you serve.");
      return;
    }
    await onSubmit(valuesToInput(values));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add service line" : "Edit service line"}
          </DialogTitle>
          <DialogDescription>
            Capabilities come from the platform taxonomy — free text is not
            accepted so matching can filter on exact codes.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="svc-category">Capability category</FieldLabel>
            <Select
              items={categoryItems}
              value={values.categoryCode || null}
              onValueChange={(v) => handleCategoryChange(v as string | null)}
            >
              <SelectTrigger id="svc-category" className="w-full min-h-11 h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {categoryItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Expanding category or materials on a live line re-enters
              verification.
            </FieldDescription>
          </Field>

          <FieldSet>
            <FieldLegend variant="label">Materials</FieldLegend>
            <FieldDescription>
              Only materials valid for this category are listed.
            </FieldDescription>
            <div className="flex flex-col gap-2 mt-2">
              {materials.length === 0 ? (
                <p className="text-caption text-text-muted m-0">
                  Choose a category to load materials.
                </p>
              ) : (
                materials.map((m) => (
                  <label
                    key={m.code}
                    className="flex min-h-11 items-center gap-3 text-body text-text-primary"
                  >
                    <Checkbox
                      checked={values.materialCodes.includes(m.code)}
                      onCheckedChange={(c) =>
                        toggleCode("materialCodes", m.code, c === true)
                      }
                    />
                    {m.name}
                  </label>
                ))
              )}
            </div>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">Finishes</FieldLegend>
            <div className="flex flex-col gap-2 mt-2">
              {finishes.map((f) => (
                <label
                  key={f.code}
                  className="flex min-h-11 items-center gap-3 text-body text-text-primary"
                >
                  <Checkbox
                    checked={values.finishCodes.includes(f.code)}
                    onCheckedChange={(c) =>
                      toggleCode("finishCodes", f.code, c === true)
                    }
                  />
                  {f.name}
                </label>
              ))}
            </div>
          </FieldSet>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="svc-size-min">Size range min</FieldLabel>
              <Input
                id="svc-size-min"
                value={values.sizeMin}
                onChange={(e) =>
                  setValues((v) => ({ ...v, sizeMin: e.target.value }))
                }
                placeholder="e.g. 1x1 ft or A6"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="svc-size-max">Size range max</FieldLabel>
              <Input
                id="svc-size-max"
                value={values.sizeMax}
                onChange={(e) =>
                  setValues((v) => ({ ...v, sizeMax: e.target.value }))
                }
                placeholder="e.g. 10x30 ft or A3"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="svc-qty-min">Quantity min</FieldLabel>
              <Input
                id="svc-qty-min"
                inputMode="numeric"
                value={values.qtyMin}
                onChange={(e) =>
                  setValues((v) => ({ ...v, qtyMin: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="svc-qty-max">Quantity max</FieldLabel>
              <Input
                id="svc-qty-max"
                inputMode="numeric"
                value={values.qtyMax}
                onChange={(e) =>
                  setValues((v) => ({ ...v, qtyMax: e.target.value }))
                }
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="svc-pricing">Pricing basis</FieldLabel>
              <Select
                items={[...pricingItems]}
                value={values.pricingBasis}
                onValueChange={(v) => {
                  if (typeof v === "string") {
                    setValues((prev) => ({ ...prev, pricingBasis: v }));
                  }
                }}
              >
                <SelectTrigger id="svc-pricing" className="w-full min-h-11 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {pricingItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="svc-rate">Reference rate (₱)</FieldLabel>
              <Input
                id="svc-rate"
                inputMode="decimal"
                value={values.referenceRatePesos}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    referenceRatePesos: e.target.value,
                  }))
                }
                placeholder="0.00"
              />
              <FieldDescription>
                Stored as centavos on the server; enter pesos.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="svc-turnaround">Turnaround (hours)</FieldLabel>
              <Input
                id="svc-turnaround"
                inputMode="numeric"
                value={values.turnaroundHours}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    turnaroundHours: e.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="svc-cap-daily">Daily capacity</FieldLabel>
              <Input
                id="svc-cap-daily"
                inputMode="numeric"
                value={values.capacityDaily}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    capacityDaily: e.target.value,
                  }))
                }
                placeholder="Units per day"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="svc-cap-weekly">Weekly capacity</FieldLabel>
              <Input
                id="svc-cap-weekly"
                inputMode="numeric"
                value={values.capacityWeekly}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    capacityWeekly: e.target.value,
                  }))
                }
                placeholder="Units per week"
              />
            </Field>
          </div>

          <FieldSet>
            <FieldLegend variant="label">Zones you serve</FieldLegend>
            <FieldDescription>
              Zones are platform-defined. Matching only offers you work in these
              areas.
            </FieldDescription>
            <div className="flex flex-col gap-2 mt-2">
              {zones
                .filter((z) => z.active)
                .map((z) => (
                  <label
                    key={z.code}
                    className="flex min-h-11 items-center gap-3 text-body text-text-primary"
                  >
                    <Checkbox
                      checked={values.zones.includes(z.code)}
                      onCheckedChange={(c) =>
                        toggleCode("zones", z.code, c === true)
                      }
                    />
                    {z.name}
                  </label>
                ))}
            </div>
          </FieldSet>

          <Field>
            <FieldLabel htmlFor="svc-notes">Equipment notes</FieldLabel>
            <Textarea
              id="svc-notes"
              value={values.equipmentNotes}
              onChange={(e) =>
                setValues((v) => ({ ...v, equipmentNotes: e.target.value }))
              }
              placeholder="Press type, finishing kit, special constraints…"
            />
          </Field>

          {capabilityWarning ? (
            <p className="text-body text-warning m-0" role="status">
              Expanding category or materials on a live line sends it back to
              verification. Capacity and turnaround edits alone stay live.
            </p>
          ) : null}

          {localError || error ? (
            <FieldError>{localError || error}</FieldError>
          ) : null}
        </FieldGroup>

        <DialogFooter>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void handleSave()}
          >
            {busy
              ? "Saving…"
              : mode === "create"
                ? "Save draft"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
