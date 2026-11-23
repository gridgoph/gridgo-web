"use client";

import { useId, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  outsideUsualRange,
  priceErrors,
  rowsMatching,
  unitLabel,
  usualRangeLine,
  type DraftRow,
  type ProductTemplate,
} from "@/lib/product-templates";

/**
 * A template's full price table as the team fills it from a shop's price
 * list: tick what the shop makes, one full price each. Long tables (apparel
 * has 180 rows) filter by option-list value and fill the shown rows at once.
 */
export function TeamPriceTable({
  template,
  rows,
  onChange,
  showErrors,
}: {
  template: ProductTemplate;
  rows: DraftRow[];
  onChange: (rows: DraftRow[]) => void;
  showErrors: boolean;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<string[]>([]);
  const [fill, setFill] = useState("");
  const visible = useMemo(() => rowsMatching(template, chosen), [template, chosen]);
  const errors = showErrors ? priceErrors(rows) : {};
  const labels = new Map(template.options.map((o) => [o.key, o.label]));
  const shown = rows.filter((r) => visible.has(r.optionKey));
  const range = usualRangeLine(template.priceRange, template.unit);

  function patch(key: string, next: Partial<DraftRow>) {
    onChange(rows.map((r) => (r.optionKey === key ? { ...r, ...next } : r)));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-muted m-0">
        Full price {unitLabel(template.unit)} for each option, never an add-on amount.
        {range ? ` ${range}.` : ""}
      </p>
      {template.optionLists.length && template.options.length > 8 ? (
        <div
          className="flex flex-col gap-2"
          role="group"
          aria-label="Show only options with"
        >
          {template.optionLists.map((list) => (
            <div key={list.name} className="flex flex-wrap items-center gap-1.5">
              <span className="text-caption text-text-muted mr-1">{list.name}</span>
              {list.options.map((value) => {
                const on = chosen.includes(value);
                return (
                  <Button
                    key={value}
                    type="button"
                    variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    onClick={() =>
                      setChosen((c) =>
                        on ? c.filter((v) => v !== value) : [...c, value],
                      )
                    }
                  >
                    {value}
                  </Button>
                );
              })}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`Price for the ${shown.length} options shown`}
              inputMode="decimal"
              placeholder="₱"
              className="w-28"
              value={fill}
              onChange={(e) => setFill(e.target.value)}
            />
            <Button
              type="button"
              disabled={!fill.trim()}
              onClick={() =>
                onChange(
                  rows.map((r) =>
                    visible.has(r.optionKey) ? { ...r, on: true, price: fill.trim() } : r,
                  ),
                )
              }
            >
              Tick and price the {shown.length} shown
            </Button>
          </div>
        </div>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {shown.map((row) => {
          const label = labels.get(row.optionKey) ?? row.optionKey;
          const error = errors[row.optionKey];
          const unusual = outsideUsualRange(template, row);
          return (
            <li
              key={row.optionKey}
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)_7rem] items-center gap-3 rounded-[var(--radius-field)] px-2 py-1",
                error ? "border border-destructive" : "",
              )}
            >
              <Checkbox
                id={`${id}-${row.optionKey}`}
                checked={row.on}
                onCheckedChange={(v) => patch(row.optionKey, { on: v === true })}
              />
              <label
                htmlFor={`${id}-${row.optionKey}`}
                className="text-body text-text-primary min-w-0 break-words"
              >
                {label}
                {unusual ? (
                  <span className="text-caption text-text-muted flex items-center gap-1">
                    <TriangleAlert
                      aria-hidden
                      className="size-3.5"
                      style={{ color: "var(--color-warning)" }}
                    />
                    Outside the usual price
                  </span>
                ) : null}
                {error ? (
                  <span className="text-caption text-destructive block">{error}</span>
                ) : null}
              </label>
              <Input
                aria-label={`Full price for ${label}`}
                inputMode="decimal"
                placeholder="₱"
                value={row.price}
                aria-invalid={error ? true : undefined}
                onChange={(e) =>
                  patch(row.optionKey, { price: e.target.value, on: true })
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
