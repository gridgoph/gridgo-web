"use client";

import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type CategoryValues = {
  name: string;
  code: string;
  bestFor: string;
  sortOrder: string;
  active: boolean;
};

type Props = {
  values: CategoryValues;
  onChange: (next: CategoryValues) => void;
  codeLocked: boolean;
  disabled?: boolean;
};

export function CategoryFields({ values, onChange, codeLocked, disabled }: Props) {
  function patch(partial: Partial<CategoryValues>) {
    onChange({ ...values, ...partial });
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="cat-name">Name</FieldLabel>
        <Input
          id="cat-name"
          value={values.name}
          disabled={disabled}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="Marketing & Promotional Collateral"
          required
        />
      </Field>

      {codeLocked ? (
        <p className="text-caption text-text-muted m-0">
          Code {values.code.replace(/_/g, " ")} — shops are accredited against this.
        </p>
      ) : (
        <Field>
          <FieldLabel htmlFor="cat-code">Code</FieldLabel>
          <Input
            id="cat-code"
            value={values.code}
            disabled={disabled}
            autoComplete="off"
            onChange={(event) => patch({ code: event.target.value })}
            placeholder="marketing_collateral"
            required
          />
          <FieldDescription>Stable identity. Set it once.</FieldDescription>
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="cat-best-for">Best for</FieldLabel>
        <Textarea
          id="cat-best-for"
          value={values.bestFor}
          disabled={disabled}
          onChange={(event) => patch({ bestFor: event.target.value })}
          placeholder="Businesses, startups, and events looking to promote services."
        />
        <FieldDescription>
          Who this category is for. Shown on the chart as “Best for …”.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="cat-sort">Order on the chart</FieldLabel>
        <Input
          id="cat-sort"
          inputMode="numeric"
          value={values.sortOrder}
          disabled={disabled}
          onChange={(event) => patch({ sortOrder: event.target.value })}
          placeholder="1"
        />
      </Field>

      <Field orientation="horizontal" className="items-center">
        <Switch
          id="cat-active"
          checked={values.active}
          disabled={disabled}
          onCheckedChange={(checked) => patch({ active: Boolean(checked) })}
        />
        <FieldLabel htmlFor="cat-active">Show this category for accreditation</FieldLabel>
      </Field>
    </FieldGroup>
  );
}
