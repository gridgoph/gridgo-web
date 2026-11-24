"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReadyTimeChip } from "@/lib/product-templates";

/**
 * When it is ready: GRIDGO's chips and one dated example under them.
 *
 * The chips come from the API (`readyTimes`), so a change of wording or a
 * fifth choice needs no release. The chosen chip is ink, not yellow: it is a
 * choice, and the yellow is the step's action. The example is GRIDGO's own
 * date on the shop's hours and queue, so it is honest on a Saturday too.
 */
export function ReadyTimeChips({
  chips,
  value,
  onChange,
  example,
  loadingExample,
  exampleNote,
}: {
  chips: ReadyTimeChip[];
  value: string | null;
  onChange: (code: string) => void;
  example: string | null;
  loadingExample: boolean;
  /** Said in place of the example when GRIDGO could not give one. */
  exampleNote?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label="When is it ready?"
        className="flex flex-wrap gap-2"
      >
        {chips.map((chip) => {
          const on = chip.code === value;
          return (
            <Button
              key={chip.code}
              role="radio"
              aria-checked={on}
              variant={on ? "default" : "outline"}
              className="rounded-pill"
              onClick={() => onChange(chip.code)}
            >
              {chip.label}
            </Button>
          );
        })}
      </div>
      {value ? (
        <div
          className="rounded-card border border-outline bg-surface-variant flex items-center gap-2 p-3"
          aria-live="polite"
        >
          {loadingExample ? (
            <Loader2 className="text-text-muted size-4 animate-spin" aria-hidden />
          ) : null}
          <p className="text-body text-text-primary m-0" data-testid="ready-by-example">
            {loadingExample
              ? "Working out the date…"
              : (example ??
                exampleNote ??
                "Clients see the date worked out on your hours.")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
