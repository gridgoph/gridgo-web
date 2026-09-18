"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";

import type { BoardField, BoardRequirement } from "@/lib/listings";

/**
 * Scroll a field into view and hand it focus. Falls back to the first
 * focusable control inside a section, and lastly to the section itself.
 */
export function focusField(id: string): boolean {
  if (typeof document === "undefined") return false;
  const host = document.getElementById(id);
  if (!host) return false;
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  host.scrollIntoView?.({ block: "center", behavior: reduced ? "auto" : "smooth" });
  const focusable = host.matches(FOCUSABLE)
    ? host
    : host.querySelector<HTMLElement>(FOCUSABLE);
  if (focusable) {
    focusable.focus({ preventScroll: true });
    return true;
  }
  if (!host.hasAttribute("tabindex")) host.setAttribute("tabindex", "-1");
  host.focus({ preventScroll: true });
  return true;
}

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [role="radio"][tabindex="0"], [href], [tabindex]:not([tabindex="-1"])';

export function requirementRowId(key: BoardField): string {
  return `readiness-${key}`;
}

type Props = {
  requirements: BoardRequirement[];
  /** DOM id of the field or section that owns each requirement. */
  targets: Record<BoardField, string>;
};

/**
 * The one place that says what the board still needs. A missing row is a
 * button that takes the shop to the field; a met row is a quiet tick. Colour
 * never carries the state alone — every row has an icon and a sentence.
 */
export function ReadinessChecklist({ requirements, targets }: Props) {
  const missing = requirements.filter((requirement) => !requirement.done);
  if (!missing.length) {
    return (
      <p
        className="text-body text-text-primary m-0 flex items-center gap-2"
        role="status"
      >
        <CircleCheck
          aria-hidden
          size={16}
          strokeWidth={2}
          style={{ color: "var(--color-success)" }}
        />
        Ready for the board
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p
        className="text-body text-text-primary m-0"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {missing.length === 1
          ? "1 thing before it can go up"
          : `${missing.length} things before it can go up`}
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {requirements.map((requirement) =>
          requirement.done ? (
            <li
              key={requirement.key}
              className="text-caption text-text-secondary flex min-h-8 items-center gap-2 px-2"
            >
              <CircleCheck
                aria-hidden
                size={14}
                strokeWidth={2}
                className="shrink-0"
                style={{ color: "var(--color-success)" }}
              />
              <span>
                <span className="sr-only">Done: </span>
                {requirement.label}
              </span>
            </li>
          ) : (
            <li key={requirement.key}>
              <button
                type="button"
                id={requirementRowId(requirement.key)}
                onClick={() => focusField(targets[requirement.key])}
                className="text-body text-text-primary hover:bg-overlay-hover active:bg-overlay-pressed flex min-h-11 w-full items-start gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-left"
              >
                <TriangleAlert
                  aria-hidden
                  size={16}
                  strokeWidth={2}
                  className="mt-0.5 shrink-0"
                  style={{ color: "var(--color-warning)" }}
                />
                <span>
                  <span className="sr-only">Missing: </span>
                  {requirement.sentence}
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
