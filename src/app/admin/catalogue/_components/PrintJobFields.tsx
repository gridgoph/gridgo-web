"use client";

import { ExamplesChips } from "@/app/admin/catalogue/_components/ExamplesChips";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { TaxonomyCategory } from "@/lib/api/types";

export type PrintJobValues = {
  categoryCode: string;
  name: string;
  code: string;
  examples: string[];
  sortOrder: string;
  active: boolean;
};

type Props = {
  values: PrintJobValues;
  onChange: (next: PrintJobValues) => void;
  categories: TaxonomyCategory[];
  codeLocked: boolean;
  disabled?: boolean;
};

export function PrintJobFields({
  values,
  onChange,
  categories,
  codeLocked,
  disabled,
}: Props) {
  const selected = categories.find((c) => c.code === values.categoryCode);

  function patch(partial: Partial<PrintJobValues>) {
    onChange({ ...values, ...partial });
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Category</FieldLabel>
        <Select
          value={values.categoryCode}
          disabled={disabled}
          onValueChange={(value) =>
            patch({ categoryCode: typeof value === "string" ? value : "" })
          }
        >
          <SelectTrigger className="h-11 min-h-11 w-full">
            <SelectValue>
              {selected?.name ?? "Choose the category"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {categories.map((category) => (
                <SelectItem key={category.code} value={category.code}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          Shops accredited on this category can file listings of this job.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="job-name">Name</FieldLabel>
        <Input
          id="job-name"
          value={values.name}
          disabled={disabled}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="Flyers"
          required
        />
      </Field>

      {codeLocked ? (
        <p className="text-caption text-text-muted m-0">
          Code {values.code.replace(/_/g, " ")} — shops already file against this.
        </p>
      ) : (
        <Field>
          <FieldLabel htmlFor="job-code">Code</FieldLabel>
          <Input
            id="job-code"
            value={values.code}
            disabled={disabled}
            autoComplete="off"
            onChange={(event) => patch({ code: event.target.value })}
            placeholder="flyers"
            required
          />
          <FieldDescription>Stable identity. Set it once.</FieldDescription>
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="job-examples">Examples</FieldLabel>
        <ExamplesChips
          id="job-examples"
          examples={values.examples}
          disabled={disabled}
          onChange={(examples) => patch({ examples })}
        />
        <FieldDescription>
          What a client would ask for at the counter.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="job-sort">Order in this category</FieldLabel>
        <Input
          id="job-sort"
          inputMode="numeric"
          value={values.sortOrder}
          disabled={disabled}
          onChange={(event) => patch({ sortOrder: event.target.value })}
          placeholder="1"
        />
      </Field>

      <Field orientation="horizontal" className="items-center">
        <Switch
          id="job-active"
          checked={values.active}
          disabled={disabled}
          onCheckedChange={(checked) => patch({ active: Boolean(checked) })}
        />
        <FieldLabel htmlFor="job-active">Show this job for new listings</FieldLabel>
      </Field>
    </FieldGroup>
  );
}
