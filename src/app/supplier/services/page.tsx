"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  createSupplierService,
  getTaxonomy,
  listMySupplierServices,
  submitSupplierService,
  updateSupplierService,
  withdrawSupplierService,
} from "@/lib/api/client";
import type { SupplierService, Taxonomy } from "@/lib/api/types";

const STANDING: Record<string, string> = {
  draft: "Not sent yet",
  pending_verification: "With Operations",
  live: "GRIDGO may assign this",
  suspended: "Paused",
  withdrawn: "Withdrawn",
};

function readServices(body: unknown): SupplierService[] | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as { services?: unknown }).services)) {
    return null;
  }
  return (body as { services: SupplierService[] }).services;
}

function categoryName(taxonomy: Taxonomy | null, code: string): string {
  return taxonomy?.categories.find((entry) => entry.code === code)?.name ?? code;
}

export default function SupplierServicesPage() {
  const [services, setServices] = useState<SupplierService[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [categoryCode, setCategoryCode] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [body, tree] = await Promise.all([listMySupplierServices(), getTaxonomy()]);
      const lines = readServices(body);
      if (!lines) throw new Error("unreadable");
      setServices(lines);
      setTaxonomy(tree);
    } catch (err) {
      setError(err instanceof ApiError ? "Could not load the services you offer." : "Could not load the services you offer.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(id: string, work: () => Promise<SupplierService>) {
    setBusy(id);
    setError(null);
    try {
      const next = await work();
      setServices((current) => current.map((line) => (line.id === next.id ? next : line)));
    } catch (err) {
      if (err instanceof ApiError && err.code === "service_withdrawn") {
        setError("A withdrawn line cannot be edited.");
      } else {
        setError("GRIDGO did not accept that change.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function declare() {
    if (!categoryCode) return;
    setBusy("new");
    setError(null);
    try {
      const created = await createSupplierService({ categoryCode });
      setServices((current) => [...current, created]);
      setCategoryCode("");
    } catch {
      setError("GRIDGO did not open that service line.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error && services.length === 0) {
    return <ErrorState body={error} action={<Button onClick={() => void load()}>Retry</Button>} />;
  }

  const openCategories = (taxonomy?.categories ?? []).filter((category) => category.active !== false);
  const taken = new Set(services.filter((line) => line.state !== "withdrawn").map((line) => line.categoryCode));

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-h2 text-text-primary m-0">Services you offer</h2>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          What GRIDGO may assign. Your board, what clients see, is Catalogues. Adding a product
          type or a listing does not grant a service line.
        </p>
      </header>
      {error ? <p className="text-body text-error m-0" role="alert">{error}</p> : null}

      <section className="gg-card flex flex-col gap-3 p-3">
        <h3 className="text-h3 text-text-primary m-0">Declare a service</h3>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-text-muted">Category</span>
          <select
            className="border-input bg-card h-12 rounded-[var(--radius-field)] border px-3"
            value={categoryCode}
            onChange={(event) => setCategoryCode(event.target.value)}
          >
            <option value="">Choose a category</option>
            {openCategories
              .filter((category) => !taken.has(category.code))
              .map((category) => (
                <option key={category.code} value={category.code}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>
        <Button disabled={!categoryCode || busy === "new"} onClick={() => void declare()}>
          Declare
        </Button>
        <p className="text-caption text-text-muted m-0">
          Capacity does not finish this. Send the line to Operations from here.
        </p>
      </section>

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {services.map((line) => {
          const withdrawn = line.state === "withdrawn";
          const materials = taxonomy?.materials.filter((material) => material.active !== false) ?? [];
          return (
            <li key={line.id} className="gg-card flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-h3 text-text-primary m-0">{categoryName(taxonomy, line.categoryCode)}</h3>
                <span className="text-caption text-text-muted">{STANDING[line.state] ?? line.state}</span>
              </div>
              {withdrawn ? (
                <p className="text-body text-text-secondary m-0">A withdrawn line cannot be edited.</p>
              ) : (
                <>
                  <fieldset className="m-0 flex flex-col gap-1 border-0 p-0" disabled={busy === line.id}>
                    <legend className="text-caption text-text-muted">Materials</legend>
                    {materials.map((material) => {
                      const selected = (line.materialCodes ?? []).includes(material.code);
                      return (
                        <label key={material.code} className="text-body text-text-primary flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {
                              const next = selected
                                ? (line.materialCodes ?? []).filter((code) => code !== material.code)
                                : [...(line.materialCodes ?? []), material.code];
                              void run(line.id, () =>
                                updateSupplierService(line.id, { materialCodes: next }),
                              );
                            }}
                          />
                          {material.name}
                        </label>
                      );
                    })}
                  </fieldset>
                  {line.state === "live" ? (
                    <p className="text-caption text-text-muted m-0">
                      Adding a material returns this line to review.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {line.state === "draft" || line.state === "suspended" ? (
                      <Button disabled={busy === line.id} onClick={() => void run(line.id, () => submitSupplierService(line.id))}>
                        Send to Operations
                      </Button>
                    ) : null}
                    <Button
                      variant="danger"
                      disabled={busy === line.id}
                      onClick={() => void run(line.id, () => withdrawSupplierService(line.id))}
                    >
                      Withdraw
                    </Button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <Link href="/supplier/product-types" className="text-body text-text-primary underline">
        Request a product type
      </Link>
      <Link href="/supplier/catalogue" className="text-body text-text-primary underline">
        Your board
      </Link>
    </div>
  );
}
