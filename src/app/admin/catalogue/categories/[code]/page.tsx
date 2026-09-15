"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { groupJobsByCategory, parseSortOrder } from "@/app/admin/_lib/catalogue-chart";
import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { assembleFloorShops, type FloorShop } from "@/app/admin/_lib/shop-floor";
import {
  CategoryFields,
  type CategoryValues,
} from "@/app/admin/catalogue/_components/CategoryFields";
import { ShopFloor } from "@/app/admin/catalogue/_components/ShopFloor";
import { loadPublicShopListings } from "@/app/admin/catalogue/_lib/load-floor";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  getTaxonomy,
  isApiError,
  listSupplierServices,
  listUsers,
  updateTaxonomyCategory,
} from "@/lib/api/client";
import type {
  SupplierService,
  Taxonomy,
  TaxonomySubcategory,
  User,
} from "@/lib/api/types";

export default function EditCategoryPage() {
  const { code } = useParams<{ code: string }>();
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [services, setServices] = useState<SupplierService[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [values, setValues] = useState<CategoryValues | null>(null);
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
        setError(null);
        try {
          const [tax, svc, people] = await Promise.all([
            getTaxonomy(),
            listSupplierServices(),
            listUsers("supplier").catch(() => [] as User[]),
          ]);
          const category = tax.categories.find((entry) => entry.code === code);
          if (!category) {
            setValues(null);
            setError("That category is not on the chart.");
            return;
          }
          setTaxonomy(tax);
          setServices(svc);
          setUsers(people);
          setValues((current) =>
            preserveDraft && current
              ? current
              : {
                  name: category.name,
                  code: category.code,
                  bestFor: category.bestFor ?? "",
                  sortOrder: category.sortOrder != null ? String(category.sortOrder) : "",
                  active: category.active,
                },
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
          setError(adminErrorMessage(err, "Could not load this category."));
        } finally {
          setLoading(false);
        }
      },
      [code],
    ),
  );

  useLiveReload(["catalog", "services"], () => load(true));

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!taxonomy || !code) return;
    let gone = false;
    setFloorLoading(true);
    void (async () => {
      try {
        const publicRows = await loadPublicShopListings(code).catch(() => []);
        if (gone) return;
        setFloor(
          assembleFloorShops({
            services,
            categoryCode: code,
            aliases: taxonomy.categoryAliases,
            users,
            publicRows,
          }),
        );
      } finally {
        if (!gone) setFloorLoading(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, [taxonomy, code, services, users]);

  const jobs: TaxonomySubcategory[] = useMemo(() => {
    if (!taxonomy) return [];
    return (
      groupJobsByCategory(taxonomy).find((panel) => panel.category.code === code)?.jobs ??
      []
    );
  }, [taxonomy, code]);

  const jobNames = useMemo(
    () => Object.fromEntries(jobs.map((job) => [job.code, job.name])),
    [jobs],
  );

  async function save() {
    if (!values) return;
    const name = values.name.trim();
    if (!name) {
      setSaveError("Name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      await updateTaxonomyCategory(values.code, {
        name,
        bestFor: values.bestFor.trim(),
        sortOrder: parseSortOrder(values.sortOrder),
        active: values.active,
      });
      setSaved(`Saved ${name}.`);
    } catch (err) {
      setSaveError(adminErrorMessage(err, "Could not save this category."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
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
        title="Could not open this category"
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
          {values.bestFor ? (
            <p className="text-body text-text-secondary m-0 mt-1">
              Best for {values.bestFor}
            </p>
          ) : (
            <p className="text-body text-text-secondary m-0 mt-1">
              Shops accredited here file listings under the print jobs on the right.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            variant="primary"
            disabled={saving || !values.name.trim()}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save category"}
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
        <div className="gg-card flex flex-col gap-5">
          <p className="text-overline text-text-muted m-0 uppercase">On the chart</p>
          <CategoryFields
            values={values}
            onChange={setValues}
            codeLocked
            disabled={saving}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="cat-jobs-heading">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="cat-jobs-heading" className="text-h3 text-text-primary m-0">
                Print jobs
              </h2>
              <Button
                variant="secondary"
                nativeButton={false}
                render={
                  <Link
                    href={`/admin/catalogue/jobs/new?category=${encodeURIComponent(values.code)}`}
                  />
                }
              >
                Add print job
              </Button>
            </div>
            {jobs.length === 0 ? (
              <p className="text-body text-text-secondary m-0">
                Add the print jobs this category covers so shops can file flyers,
                brochures, and the rest.
              </p>
            ) : (
              <ul className="m-0 flex flex-wrap gap-2 p-0">
                {jobs.map((job) => (
                  <li key={job.id} className="m-0 list-none p-0">
                    <Button
                      variant="secondary"
                      nativeButton={false}
                      render={<Link href={`/admin/catalogue/jobs/${job.code}`} />}
                    >
                      {job.name}
                      {job.active ? null : (
                        <StatusChip tone="neutral" label="Hidden" icon="circle-x" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ShopFloor shops={floor} jobNames={jobNames} loading={floorLoading} />
        </div>
      </div>
    </div>
  );
}
