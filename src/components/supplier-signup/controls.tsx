"use client";

import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

/**
 * Option cards: one answer from a short list, each with its Bisaya line
 * (the shop app's OptionList). The whole card is the target.
 */
export function ChoiceList<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  disabled,
  columns = false,
}: {
  label: string;
  options: readonly { value: T; label: string; detail?: string }[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
  disabled?: boolean;
  /** Side by side from 768px: for two short answers. */
  columns?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={`${id}-label`} className="text-body m-0 text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
        {label}
      </p>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        aria-invalid={Boolean(error) || undefined}
        value={value ?? ""}
        onValueChange={(next) => onChange(next as T)}
        disabled={disabled}
        className={cn("gap-2", columns && "md:grid md:grid-cols-2")}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-14 cursor-pointer items-start gap-3 rounded-field border border-outline bg-surface px-3 py-3 hover:bg-overlay-hover has-[[data-checked]]:border-foreground"
          >
            <RadioGroupItem value={option.value} className="mt-1" aria-label={option.label} />
            <span className="min-w-0 flex-1">
              <span className="text-body block text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                {option.label}
              </span>
              {option.detail ? (
                <span className="text-caption block text-text-muted">{option.detail}</span>
              ) : null}
            </span>
          </label>
        ))}
      </RadioGroup>
      {error ? (
        <p className="text-caption m-0 text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A tick with its words beside it; the whole row is the target. */
export function TickRow({
  checked,
  onChange,
  label,
  hint,
  error,
  disabled,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
        <Checkbox
          id={id}
          className="mt-1"
          checked={checked}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          onCheckedChange={(value) => onChange(value === true)}
        />
        <span className="min-w-0 flex-1">
          <span className="text-body block text-text-primary">{label}</span>
          {hint ? <span className="text-caption block text-text-muted">{hint}</span> : null}
        </span>
      </label>
      {error ? (
        <p className="text-caption m-0 text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Several ticks as chips (the shop app's ChipMultiSelect). */
export function ChipPicker<T extends string>({
  label,
  options,
  selected,
  onToggle,
  error,
}: {
  label: string;
  options: readonly { value: T; label: string; detail?: string | null }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  error?: string | null;
}) {
  const id = useId();
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="text-body mb-2 p-0 text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              title={option.detail ?? undefined}
              onClick={() => onToggle(option.value)}
              className={cn(
                "text-body inline-flex min-h-11 items-center gap-2 rounded-full border px-4",
                on
                  ? "border-foreground bg-primary text-primary-foreground"
                  : "border-outline bg-surface text-text-primary hover:bg-overlay-hover",
              )}
            >
              {on ? <Check aria-hidden className="size-4" strokeWidth={3} /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-caption m-0 text-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** A labelled text box whose problem replaces its hint (the shop app's FieldShell). */
export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  inputMode,
  autoComplete,
  prefix,
  disabled,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: ReactNode;
  placeholder?: string;
  inputMode?: "text" | "tel" | "decimal" | "numeric";
  autoComplete?: string;
  /** "₱" before a price. */
  prefix?: string;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        {prefix ? (
          <span className="text-body pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted" aria-hidden>
            {prefix}
          </span>
        ) : null}
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          className={prefix ? "pl-7" : undefined}
          data-testid={testId}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {error ? (
        <p id={`${id}-note`} className="text-caption m-0 text-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <FieldDescription id={`${id}-note`}>{hint}</FieldDescription>
      ) : null}
    </Field>
  );
}
