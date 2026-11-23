"use client";

import { Check } from "lucide-react";

import { machinesLine, type ProductTemplate } from "@/lib/product-templates";
import { cn } from "@/lib/utils";

/* eslint-disable @next/next/no-img-element -- stock photos are public redirects, not Next images */

export type TileState = "open" | "ticked" | "added" | "no_service";

/**
 * One GRIDGO product on the "What do you make?" grid.
 *
 * The photo is the tile: a print shop picks by looking. Ticked is an ink
 * border and an ink check, never yellow (the yellow is the step's action).
 * "Added" opens the product the shop already has instead of ticking it twice,
 * and a product outside the shop's services says what to do about it rather
 * than hiding, so the shop knows it exists.
 */
export function TemplateTile({
  template,
  state,
  onPress,
}: {
  template: ProductTemplate;
  state: TileState;
  onPress: () => void;
}) {
  const ticked = state === "ticked";
  const caption =
    state === "added"
      ? "Added: open it"
      : state === "no_service"
        ? "Add this service first"
        : machinesLine(template);
  const checkable = state === "open" || state === "ticked";

  return (
    <button
      type="button"
      onClick={onPress}
      role={checkable ? "checkbox" : undefined}
      aria-checked={checkable ? ticked : undefined}
      aria-label={`${template.name}${caption ? `. ${caption}` : ""}`}
      data-testid={`template-tile-${template.id}`}
      className={cn(
        "bg-surface hover:bg-overlay-hover relative flex h-full w-full flex-col overflow-hidden rounded-card border text-left",
        ticked ? "border-foreground border-2" : "border-outline",
      )}
    >
      <span
        className={cn(
          "bg-surface-variant flex aspect-[4/3] w-full items-center justify-center overflow-hidden",
          state === "no_service" && "opacity-60",
        )}
      >
        {template.photoUrl ? (
          <img src={template.photoUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-caption text-text-muted">Photo</span>
        )}
      </span>
      <span className="flex flex-col gap-0.5 p-2.5">
        <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
          {template.name}
        </span>
        {caption ? (
          <span className={cn("text-caption", state === "added" ? "text-success" : "text-text-muted")}>
            {caption}
          </span>
        ) : null}
      </span>
      {ticked || state === "added" ? (
        <span
          aria-hidden
          className={cn(
            "absolute top-2 right-2 flex size-7 items-center justify-center rounded-pill",
            ticked ? "bg-foreground text-background" : "border-success bg-surface text-success border",
          )}
        >
          <Check className="size-4" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}
