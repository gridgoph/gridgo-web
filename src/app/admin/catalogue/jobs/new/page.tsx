"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { parseSortOrder, slugTaxonomyCode } from "@/app/admin/_lib/catalogue-chart";
import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { printJobConsequenceCopy } from "@/app/admin/_lib/taxonomy-usage";
import {
  PrintJobFields,
  type PrintJobValues,
} from "@/app/admin/catalogue/_components/PrintJobFields";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { createTaxonomySubcategory, getTaxonomy } from "@/lib/api/client";
import type { TaxonomyCategory } from "@/lib/api/types";

const EMPTY: PrintJobValues = {
  categoryCode: "",
  name: "",
  code: "",
  examples: [],
  sortOrder: "",
  active: true,
};

export default function NewPrintJobPage() {
  const router = useRouter();
  const search = useSearchParams();
  const presetCategory = search.get("category") ?? "";
  const [categories, setCategories] = useState<TaxonomyCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<PrintJobValues>(EMPTY);
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const tax = await getTaxonomy();
        if (gone) return;
        setCategories(tax.categories);
        setValues((current) => ({
          ...current,
          categoryCode:
            current.categoryCode ||
            (tax.categories.some((c) => c.code === presetCategory)
              ? presetCategory
              : tax.categories[0]?.code ?? ""),
        }));
        setError(null);
      } catch (err) {
        if (!gone) {
          setError(adminErrorMessage(err, "Could not load categories."));
        }
      } finally {
        if (!gone) setLoading(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, [presetCategory]);

  const canSave = useMemo(() => {
    return Boolean(values.categoryCode && values.name.trim() && slugTaxonomyCode(values.code || values.name));
  }, [values]);

  function onChange(next: PrintJobValues) {
    if (next.code !== values.code) setCodeTouched(true);
    if (!codeTouched && next.name !== values.name) {
      setValues({ ...next, code: slugTaxonomyCode(next.name) });
      return;
    }
    setValues(next);
  }

  async function save() {
    const code = slugTaxonomyCode(values.code || values.name);
    const name = values.name.trim();
    if (!values.categoryCode || !name || !code) {
      setSaveError("Category, name, and code are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await createTaxonomySubcategory({
        code,
        name,
        categoryCode: values.categoryCode,
        examples: values.examples,
        sortOrder: parseSortOrder(values.sortOrder),
        active: values.active,
      });
      router.push("/admin/catalogue");
    } catch (err) {
      setSaveError(adminErrorMessage(err, "Could not add this print job."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex max-w-xl flex-col gap-3">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Could not start a print job" body={error} />;
  }

  if (!categories.length) {
    return (
      <EmptyState
        title="Add a category first"
        body="Print jobs sit under a category shops get accredited on."
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
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,28rem)_minmax(0,20rem)] lg:items-start lg:gap-10">
      <div className="flex flex-col gap-5">
        <div>
          <Button variant="link" nativeButton={false} render={<Link href="/admin/catalogue" />}>
            Back to chart
          </Button>
          <p className="text-body text-text-secondary m-0 mt-2 max-w-prose">
            Name a kind of work shops can file — flyers, brochures, lanyards. The shop
            still writes the listing.
          </p>
        </div>
        <PrintJobFields
          values={values}
          onChange={onChange}
          categories={categories}
          codeLocked={false}
          disabled={saving}
        />
        {saveError ? (
          <p className="text-body text-error m-0" role="alert">
            {saveError}
          </p>
        ) : null}
        <div>
          <Button variant="primary" disabled={saving || !canSave} onClick={() => void save()}>
            {saving ? "Saving…" : "Add print job"}
          </Button>
        </div>
      </div>
      <aside className="rounded-field border border-outline bg-surface-variant px-4 py-4">
        <p className="text-body text-text-primary m-0">{printJobConsequenceCopy()}</p>
      </aside>
    </div>
  );
}
