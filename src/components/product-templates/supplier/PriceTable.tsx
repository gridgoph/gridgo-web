"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  labelParts,
  minorToInput,
  outsideUsualRange,
  rowsMatching,
  unitLabel,
  usualRangeLine,
  type DraftRow,
  type ProductTemplate,
} from "@/lib/product-templates";
import { pesosToMinor } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Above this many options the table offers filters and a fill-in price. */
export const BIG_TABLE = 12;

/** Pesos typed into a field with the peso sign in front. */
export function MoneyInput({
  value,
  onChange,
  label,
  invalid = false,
  placeholder = "Full price",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <span
        aria-hidden
        className="text-body text-text-secondary pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      >
        ₱
      </span>
      <Input
        value={value}
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        className="pl-7"
        onChange={(event) =>
          onChange(event.target.value.replace(/[^\d.,]/g, "").slice(0, 12))
        }
      />
    </div>
  );
}

/**
 * The full price of each option the shop makes.
 *
 * Every row is a whole price ("A4 / Colour: ₱12 per page"), never an amount
 * added to a base, which is what had shops typing ₱0 and getting it listed.
 * Untick what the shop does not make. Once the shop has tried to go on, a
 * ticked row with no price or ₱0 is outlined and says the fix on the row.
 *
 * A big table (apparel has 180 combinations) gets chips from the option lists
 * to narrow the rows shown, and one price to fill into every ticked row shown.
 */
export function PriceTable({
  template,
  rows,
  onChange,
  errors,
  showErrors,
  flagged = [],
}: {
  template: ProductTemplate;
  rows: DraftRow[];
  onChange: (rows: DraftRow[]) => void;
  errors: Record<string, string>;
  showErrors: boolean;
  /** Options the price check flagged on a saved product. */
  flagged?: string[];
}) {
  const labels = useMemo(
    () => new Map(template.options.map((o) => [o.key, o.label])),
    [template],
  );
  const unit = unitLabel(template.unit);
  const big = template.options.length > BIG_TABLE;
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [fill, setFill] = useState("");
  const shown = useMemo(
    () => rowsMatching(template, Object.values(chosen)),
    [template, chosen],
  );
  const visible = rows.filter((r) => shown.has(r.optionKey));
  const tickedShown = visible.filter((r) => r.on);
  const fillMinor = pesosToMinor(fill);
  const ticked = rows.filter((r) => r.on).length;
  const range = usualRangeLine(template.priceRange, template.unit);

  function patch(key: string, next: Partial<DraftRow>) {
    onChange(rows.map((r) => (r.optionKey === key ? { ...r, ...next } : r)));
  }

  function patchShown(next: (row: DraftRow) => DraftRow) {
    onChange(rows.map((r) => (shown.has(r.optionKey) ? next(r) : r)));
  }

  // Only lists whose values appear in the option labels can filter them.
  const filterLists = big
    ? template.optionLists.filter((list) =>
        list.options.some((value) =>
          template.options.some((o) => labelParts(o.label).includes(value)),
        ),
      )
    : [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-muted m-0">
        {ticked} of {rows.length} ticked{range ? `. ${range}` : ""}
      </p>

      {big ? (
        <div className="rounded-card border border-outline bg-surface flex flex-col gap-3 p-3">
          {filterLists.map((list) => (
            <div key={list.name} className="flex flex-col gap-1.5">
              <span className="text-caption text-text-secondary">{list.name}</span>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={`Show only ${list.name}`}
              >
                {list.options.map((value) => {
                  const on = chosen[list.name] === value;
                  return (
                    <Button
                      key={value}
                      variant={on ? "default" : "outline"}
                      aria-pressed={on}
                      onClick={() =>
                        setChosen((current) => {
                          const next = { ...current };
                          if (on) delete next[list.name];
                          else next[list.name] = value;
                          return next;
                        })
                      }
                    >
                      {value}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <Button size="sm" onClick={() => patchShown((r) => ({ ...r, on: true }))}>
              Tick all {visible.length} shown
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => patchShown((r) => ({ ...r, on: false }))}
            >
              Untick shown
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <MoneyInput
                value={fill}
                onChange={setFill}
                label="One price for the ticked rows shown"
                placeholder="Same price"
                className="w-36"
              />
              <Button
                size="sm"
                disabled={!fillMinor || !tickedShown.length}
                onClick={() =>
                  fillMinor &&
                  patchShown((r) => (r.on ? { ...r, price: minorToInput(fillMinor) } : r))
                }
              >
                Set for {tickedShown.length} ticked
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {visible.map((row) => {
          const label = labels.get(row.optionKey) ?? row.optionKey;
          const error = showErrors ? errors[row.optionKey] : undefined;
          const unusual =
            !error &&
            (outsideUsualRange(template, row) || flagged.includes(row.optionKey));
          return (
            <li
              key={row.optionKey}
              data-testid={`price-row-${row.optionKey}`}
              data-invalid={error ? true : undefined}
              className={cn(
                "rounded-card bg-surface flex flex-col gap-2 border p-3 md:flex-row md:flex-wrap md:items-center md:gap-3",
                error ? "border-error border-2" : "border-outline",
              )}
            >
              <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
                <Checkbox
                  checked={row.on}
                  onCheckedChange={(on) => patch(row.optionKey, { on: Boolean(on) })}
                  aria-label={`I make ${label}`}
                  className="size-5"
                />
                {/* The checkbox already says "I make …"; the text is for the eye. */}
                <span
                  aria-hidden
                  className={cn(
                    "text-body min-w-0",
                    row.on ? "text-text-primary" : "text-text-muted",
                  )}
                >
                  {label}
                </span>
              </label>
              {row.on ? (
                <div className="flex items-center gap-2 md:w-64 md:shrink-0">
                  <MoneyInput
                    value={row.price}
                    onChange={(price) => patch(row.optionKey, { price })}
                    label={`Full price for ${label}, ${unit}`}
                    invalid={Boolean(error)}
                    className="flex-1"
                  />
                  <span className="text-caption text-text-muted w-20 shrink-0">
                    {unit}
                  </span>
                </div>
              ) : null}
              {error ? (
                <p className="text-caption text-error m-0 md:basis-full" role="alert">
                  {error}
                </p>
              ) : unusual ? (
                <p className="text-caption text-text-secondary m-0 md:basis-full">
                  Unusual for this product. The GRIDGO team checks it before it goes live.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {showErrors && Object.keys(errors).some((key) => !shown.has(key)) ? (
        <p className="text-caption text-text-primary m-0">
          Some rows that need a price are hidden by your choices above.{" "}
          <button type="button" className="underline" onClick={() => setChosen({})}>
            Show every row
          </button>
        </p>
      ) : null}
      {big && !visible.length ? (
        <p className="text-body text-text-secondary m-0">
          No option matches those choices. Clear one.
        </p>
      ) : null}
    </div>
  );
}
