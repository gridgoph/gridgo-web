"use client";

import { useId, useRef, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Accessible name of the group; the visible label usually sits beside it. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Focus lands on the checked segment; give the group an id so the checklist can find it. */
  id?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * One choice out of a few — pricing unit, ready-in mode, artwork mode.
 *
 * Radio-group semantics: the checked segment is the one tab stop, arrow keys
 * move and select, Home/End jump. The checked segment takes the monochrome
 * structural fill (never yellow); the rest stay quiet on the card surface so
 * the selected one is unmistakable next to multi-choice chips.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  id,
  disabled,
  className,
  ...aria
}: Props<T>) {
  const generatedId = useId();
  const groupId = id ?? generatedId;
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function move(from: number, delta: number) {
    if (!options.length) return;
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(index, -1);
        break;
      case "Home":
        event.preventDefault();
        move(index, -index);
        break;
      case "End":
        event.preventDefault();
        move(index, options.length - 1 - index);
        break;
      default:
        break;
    }
  }

  return (
    <div
      id={groupId}
      role="radiogroup"
      aria-disabled={disabled || undefined}
      className={cn(
        "border-border bg-card inline-flex max-w-full flex-wrap gap-0.5 self-start rounded-[var(--radius-field)] border p-0.5",
        disabled && "opacity-[0.38]",
        className,
      )}
      {...aria}
    >
      {options.map((option, index) => {
        const checked = index === checkedIndex;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "text-button min-h-11 min-w-11 rounded-[var(--radius-sm)] px-3 whitespace-nowrap transition-[background-color,color] duration-200 ease-out",
              checked
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-overlay-hover active:bg-overlay-pressed",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
