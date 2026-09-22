"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { parseSortOrder } from "@/app/admin/_lib/catalogue-chart";
import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { assembleFloorShops, type FloorShop } from "@/app/admin/_lib/shop-floor";
import { DangerZone } from "@/app/admin/catalogue/_components/DangerZone";
import {
  PrintJobFields,
  type PrintJobValues,
} from "@/app/admin/catalogue/_components/PrintJobFields";
import { ShopFloor } from "@/app/admin/catalogue/_components/ShopFloor";
import { loadPublicShopListings } from "@/app/admin/catalogue/_lib/load-floor";
import { starterNamesForJobs } from "@/app/admin/catalogue/_lib/starter-names";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  deleteTaxonomySubcategory,
  getTaxonomy,
  isApiError,
  listSupplierServices,
  listUsers,
  updateTaxonomySubcategory,
} from "@/lib/api/client";
import type { TaxonomyCategory, User } from "@/lib/api/types";

export default function EditPrintJobPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [categories, setCategories] = useState<TaxonomyCategory[]>([]);
  const [values, setValues] = useState<PrintJobValues | null>(null);
  const [starterName, setStarterName] = useState<string | null>(null);
  const [floor, setFloor] = useState<FloorShop[]>([]);
  const [floorLoading, setFloorLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(
      async (preserveDraft = false) => {
        setLoading(true);
        setFloorLoading(true);
        setError(null);
        try {
          const [tax, svc, people] = await Promise.all([
            getTaxonomy(),
            listSupplierServices(),
            listUsers("supplier").catch(() => [] as User[]),
          ]);
          const job = (tax.subcategories ?? []).find((entry) => entry.code === code);
          if (!job) {
            setValues(null);
            setError("That print job is not on the chart.");
            return;
          }
          setCategories(tax.categories);
          setValues((current) =>
            preserveDraft && current
              ? current
              : {
                  categoryCode: job.categoryCode,
                  name: job.name,
                  code: job.code,
                  examples: job.examples ?? [],
                  sortOrder: job.sortOrder != null ? String(job.sortOrder) : "",
                  active: job.active,
                },
          );
          const names = await starterNamesForJobs([job.code]);
          setStarterName(names[job.code] ?? null);

          const publicRows = await loadPublicShopListings(
            job.categoryCode,
            job.code,
          ).catch(() => []);
          setFloor(
            assembleFloorShops({
              services: svc,
              categoryCode: job.categoryCode,
              aliases: tax.categoryAliases,
              users: people,
              publicRows,
              subcategoryCode: job.code,
            }),
          );
        } catch (err) {
          if (
            preserveDraft &&
            !(
              isApiError(err) &&
              ["unauthorized", "forbidden", "not_found"].includes(err.kind)
            )
          )
            return;
          setValues(null);
          setError(adminErrorMessage(err, "Could not load this print job."));
        } finally {
          setLoading(false);
          setFloorLoading(false);
        }
      },
      [code],
    ),
  );

  useLiveReload(["catalog", "services"], () => load(true));

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!values) return;
    const name = values.name.trim();
    if (!values.categoryCode || !name) {
      setSaveError("Category and name are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      await updateTaxonomySubcategory(values.code, {
        name,
        categoryCode: values.categoryCode,
        examples: values.examples,
        sortOrder: parseSortOrder(values.sortOrder),
        active: values.active,
      });
      setSaved(`Saved ${name}.`);
    } catch (err) {
      setSaveError(adminErrorMessage(err, "Could not save this print job."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!values) return;
    const { name } = values;
    await deleteTaxonomySubcategory(values.code);
    toast.add({
      type: "success",
      title: `Deleted ${name}.`,
      description: "It is off the chart; the audit log keeps the record.",
    });
    router.replace("/admin/catalogue");
  }

  async function retire() {
    if (!values) return;
    const job = await updateTaxonomySubcategory(values.code, { active: false });
    setValues((current) => (current ? { ...current, active: job.active } : current));
  }

  if (loading && (!values || values.code !== code)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !values) {
    return (
      <ErrorState
        title="Could not open this print job"
        body={error ?? "Missing."}
        action={
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href="/admin/catalogue" />}
          >
            Back to chart
          </Button>
        }
      />
    );
  }

  const categoryName =
    categories.find((entry) => entry.code === values.categoryCode)?.name ??
    "this category";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/admin/catalogue" />}
          >
            Back to chart
          </Button>
          <h1 className="text-h2 text-text-primary m-0 mt-2">{values.name}</h1>
          <p className="text-body text-text-secondary m-0 mt-1">
            {values.examples.length
              ? values.examples.join(" · ")
              : `Print job under ${categoryName}. Shops file the listing; GRIDGO names the job.`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            variant="primary"
            disabled={saving || !values.name.trim()}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save print job"}
          </Button>
          {saved ? (
            <p className="text-caption text-success m-0" role="status">
              {saved}
            </p>
          ) : null}
          {saveError ? (
            <p className="text-caption text-error m-0" role="alert">
              {saveError}
            </p>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] xl:items-start xl:gap-10">
        <div className="flex flex-col gap-4">
          <div className="gg-card flex flex-col gap-5">
            <p className="text-overline text-text-muted m-0 uppercase">On the chart</p>
            <PrintJobFields
              key={values.code}
              values={values}
              onChange={setValues}
              categories={categories}
              codeLocked
              disabled={saving}
            />
          </div>
          {starterName ? (
            <p className="text-caption text-text-muted m-0 px-1">
              GRIDGO starter · {starterName}. Shops copy the steps into a listing; Super
              Admin does not edit the starter here.
            </p>
          ) : (
            <p className="text-caption text-text-muted m-0 px-1">
              No GRIDGO starter is seeded. Shops still file a blank listing.
            </p>
          )}
          <DangerZone
            kind="print job"
            name={values.name}
            code={values.code}
            onDelete={remove}
            onRetire={retire}
            disabled={saving}
          />
        </div>

        <ShopFloor shops={floor} jobName={values.name} loading={floorLoading} />
      </div>
    </div>
  );
}
