"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";

import { groupJobsByCategory } from "@/app/admin/_lib/catalogue-chart";
import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { shopsAccreditedCopy, usageForCategory } from "@/app/admin/_lib/taxonomy-usage";
import { starterNamesForJobs } from "@/app/admin/catalogue/_lib/starter-names";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { getTaxonomy, listSupplierServices } from "@/lib/api/client";
import type { SupplierService, Taxonomy, TaxonomySubcategory } from "@/lib/api/types";

export default function AdminCataloguePage() {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [services, setServices] = useState<SupplierService[]>([]);
  const [starterNames, setStarterNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [tax, svc] = await Promise.all([getTaxonomy(), listSupplierServices()]);
        setTaxonomy(tax);
        setServices(svc);
      } catch (err) {
        setTaxonomy(null);
        setError(
          adminErrorMessage(
            err,
            "Could not load the print-job chart. Confirm the demo API is running.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload(["catalog", "services"], load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!taxonomy) return;
    const codes = (taxonomy.subcategories ?? []).map((job) => job.code);
    if (!codes.length) {
      setStarterNames({});
      return;
    }
    let gone = false;
    void starterNamesForJobs(codes).then((names) => {
      if (!gone) setStarterNames(names);
    });
    return () => {
      gone = true;
    };
  }, [taxonomy]);

  const chart = useMemo(
    () => (taxonomy ? groupJobsByCategory(taxonomy) : []),
    [taxonomy],
  );

  if (!loading && (error || !taxonomy)) {
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

  const empty = !loading && chart.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-body text-text-secondary m-0 max-w-2xl">
          GRIDGO names the print jobs. Shops get accredited on a category, then file
          listings — flyers, brochures, cards, lanyards — on their board. Editing a job
          changes what shops can file. It does not write their prices, paper, or photos.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            Refresh
          </Button>
          <Button
            variant={empty ? "primary" : "secondary"}
            nativeButton={false}
            render={<Link href="/admin/catalogue/categories/new" />}
          >
            Add category
          </Button>
          {empty ? null : (
            <Button
              variant="primary"
              nativeButton={false}
              render={<Link href="/admin/catalogue/jobs/new" />}
            >
              <Plus data-icon="inline-start" aria-hidden />
              Add print job
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
        </div>
      ) : empty ? (
        <EmptyState
          title="No categories yet"
          body="Add a category, then the print jobs shops can file under it — flyers, brochures, and the rest."
          action={
            <Button
              variant="primary"
              nativeButton={false}
              render={<Link href="/admin/catalogue/categories/new" />}
            >
              Add category
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {chart.map((panel) => {
            const usage = usageForCategory(
              services,
              panel.category.code,
              taxonomy?.categoryAliases,
            );
            return (
              <section
                key={panel.category.id}
                className="gg-card-flush flex flex-col"
                aria-labelledby={`cat-${panel.category.code}`}
              >
                <header className="flex flex-col gap-2 border-b border-outline-subtle px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2
                      id={`cat-${panel.category.code}`}
                      className="text-h3 text-text-primary m-0"
                    >
                      {panel.category.name}
                    </h2>
                    <div className="flex shrink-0 items-center gap-2">
                      {panel.category.active ? null : (
                        <StatusChip tone="neutral" label="Hidden" icon="circle-x" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        nativeButton={false}
                        render={
                          <Link
                            href={`/admin/catalogue/categories/${panel.category.code}`}
                          />
                        }
                        aria-label={`Edit ${panel.category.name}`}
                      >
                        <Pencil aria-hidden />
                      </Button>
                    </div>
                  </div>
                  {panel.category.bestFor ? (
                    <p className="text-caption text-text-secondary m-0">
                      Best for {panel.category.bestFor}
                    </p>
                  ) : null}
                  <p className="text-caption text-text-muted m-0">
                    {shopsAccreditedCopy(usage)}
                  </p>
                </header>

                {panel.jobs.length === 0 ? (
                  <div className="flex flex-1 flex-col gap-3 px-4 py-4">
                    <p className="text-body text-text-secondary m-0">
                      Add the print jobs this category covers so shops can file flyers,
                      brochures, and the rest.
                    </p>
                    <Button
                      variant="secondary"
                      nativeButton={false}
                      render={
                        <Link
                          href={`/admin/catalogue/jobs/new?category=${encodeURIComponent(panel.category.code)}`}
                        />
                      }
                    >
                      Add a print job
                    </Button>
                  </div>
                ) : (
                  <ul className="m-0 flex flex-col p-0">
                    {panel.jobs.map((job) => (
                      <JobRow
                        key={job.id}
                        job={job}
                        starterName={starterNames[job.code]}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function JobRow({
  job,
  starterName,
}: {
  job: TaxonomySubcategory;
  starterName?: string;
}) {
  const examples = job.examples?.filter(Boolean) ?? [];
  return (
    <li className="border-b border-outline-subtle last:border-b-0">
      <Link
        href={`/admin/catalogue/jobs/${job.code}`}
        className="hover:bg-muted flex min-h-11 items-start justify-between gap-3 px-4 py-3 no-underline"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body text-text-primary">{job.name}</span>
            {job.active ? null : (
              <StatusChip tone="neutral" label="Hidden" icon="circle-x" />
            )}
          </div>
          {examples.length ? (
            <p className="text-caption text-text-secondary m-0">{examples.join(" · ")}</p>
          ) : null}
          {starterName ? (
            <p className="text-caption text-text-muted m-0">
              GRIDGO starter · {starterName}
            </p>
          ) : null}
        </div>
        <Pencil
          className="text-text-muted mt-1 size-4 shrink-0"
          strokeWidth={2}
          aria-hidden
        />
      </Link>
    </li>
  );
}
