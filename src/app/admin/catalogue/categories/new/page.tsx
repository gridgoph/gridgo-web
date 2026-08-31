"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { parseSortOrder, slugTaxonomyCode } from "@/app/admin/_lib/catalogue-chart";
import { adminErrorMessage } from "@/app/admin/_lib/errors";
import {
  CategoryFields,
  type CategoryValues,
} from "@/app/admin/catalogue/_components/CategoryFields";
import { Button } from "@/components/ui/button";
import { createTaxonomyCategory } from "@/lib/api/client";

const EMPTY: CategoryValues = {
  name: "",
  code: "",
  bestFor: "",
  sortOrder: "",
  active: true,
};

export default function NewCategoryPage() {
  const router = useRouter();
  const [values, setValues] = useState<CategoryValues>(EMPTY);
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function onChange(next: CategoryValues) {
    if (next.code !== values.code) setCodeTouched(true);
    if (!codeTouched && next.name !== values.name) {
      setValues({ ...next, code: slugTaxonomyCode(next.name) });
      return;
    }
    setValues(next);
  }

  async function save() {
    const name = values.name.trim();
    const code = slugTaxonomyCode(values.code || values.name);
    if (!name || !code) {
      setSaveError("Name and code are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await createTaxonomyCategory({
        code,
        name,
        bestFor: values.bestFor.trim() || undefined,
        sortOrder: parseSortOrder(values.sortOrder),
        active: values.active,
      });
      router.push(`/admin/catalogue/categories/${code}`);
    } catch (err) {
      setSaveError(adminErrorMessage(err, "Could not add this category."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <div>
        <Button variant="link" nativeButton={false} render={<Link href="/admin/catalogue" />}>
          Back to chart
        </Button>
        <p className="text-body text-text-secondary m-0 mt-2 max-w-prose">
          A category is what a shop is accredited on. Print jobs — flyers, lanyards,
          signage — sit under it. Paper and finish stay on the shop listing.
        </p>
      </div>
      <CategoryFields
        values={values}
        onChange={onChange}
        codeLocked={false}
        disabled={saving}
      />
      {saveError ? (
        <p className="text-body text-error m-0" role="alert">
          {saveError}
        </p>
      ) : null}
      <div>
        <Button
          variant="primary"
          disabled={saving || !values.name.trim()}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Add category"}
        </Button>
      </div>
    </div>
  );
}
