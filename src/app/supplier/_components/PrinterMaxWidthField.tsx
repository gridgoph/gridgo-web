"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  PRINTER_MAX_WIDTH_FEET,
  parsePrinterMaxWidthFeet,
} from "@/lib/listings";

type Props = {
  value: number | null;
  onChange: (next: number | null) => void;
};

export function PrinterMaxWidthField({ value, onChange }: Props) {
  const invalid = value != null && parsePrinterMaxWidthFeet(value) == null;
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor="printer-max-width">Max printer width</FieldLabel>
      <div className="flex max-w-48 items-center gap-2">
        <Input
          id="printer-max-width"
          type="number"
          inputMode="numeric"
          min={PRINTER_MAX_WIDTH_FEET.min}
          max={PRINTER_MAX_WIDTH_FEET.max}
          step={1}
          value={value ?? ""}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === "") {
              onChange(null);
              return;
            }
            const next = Number(raw);
            onChange(Number.isFinite(next) ? next : null);
          }}
        />
        <span className="text-body text-text-secondary">feet</span>
      </div>
    </Field>
  );
}
