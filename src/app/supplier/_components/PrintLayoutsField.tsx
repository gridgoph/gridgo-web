"use client";

import { Check } from "lucide-react";

import { LayoutGlyph } from "@/components/orders/PrintLayoutRecord";
import {
  LAYOUT_CODES,
  PRINT_LAYOUTS_REVIEW,
  layoutHint,
  layoutLabel,
  printLayoutsEffect,
  toggleLayout,
  type KnownLayout,
} from "@/lib/print-layout";
import { cn } from "@/lib/utils";

/**
 * The layouts a shop prints for this listing (gridgo-client#245; contract
 * gridgo-api docs/PRINT_LAYOUT_API.md, "Shop: marking layouts on a listing").
 *
 * Any number may be marked, none included. Marking one makes every client
 * choose a layout before ordering, so that consequence is said under the
 * choices and changes as the shop ticks. Each row draws its placement the way
 * the client sees it in the app.
 */
export function PrintLayoutsField({
  value,
  onChange,
  inReview,
  disabled,
}: {
  value: KnownLayout[];
  onChange: (next: KnownLayout[]) => void;
  /** The listing goes through review, so say a change waits for it. */
  inReview: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Print layouts you can print"
        className="border-outline flex flex-col overflow-hidden rounded-card border"
      >
        {LAYOUT_CODES.map((code, index) => {
          const on = value.includes(code);
          return (
            <button
              key={code}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(toggleLayout(value, code))}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-200 ease-out",
                "hover:bg-overlay-hover active:bg-overlay-pressed disabled:cursor-not-allowed disabled:opacity-[0.38]",
                index > 0 && "border-outline-subtle border-t",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-[6px] border",
                  on
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "border-outline bg-card",
                )}
              >
                {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
              <LayoutGlyph layout={code} selected={on} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body text-text-primary">{layoutLabel(code)}</span>
                <span className="text-caption text-text-muted">{layoutHint(code)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-body text-text-primary m-0 max-w-prose" role="status">
        {printLayoutsEffect(value)}
      </p>
      {inReview ? (
        <p className="text-caption text-text-secondary m-0 max-w-prose">
          {PRINT_LAYOUTS_REVIEW}
        </p>
      ) : null}
    </div>
  );
}
