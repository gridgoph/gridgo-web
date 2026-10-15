/**
 * The client's print layout on each order line, as part of the agreed spec
 * (gridgo-client#245; contract gridgo-api docs/PRINT_LAYOUT_API.md, "Orders:
 * the agreed spec").
 *
 * The choice and its fit check are frozen when the client checks out, so a
 * later change to the listing or the file never rewrites what was agreed. The
 * shop reads it on its job; the GRIDGO Team reads the same record on the order
 * workspace and at the quality check.
 *
 * Renders nothing when no line carries a layout (products without the choice,
 * older orders), so a caller keeps its own layout.
 */

import { CircleCheck, Info, TriangleAlert } from "lucide-react";

import type { Order } from "@/lib/api/types";
import {
  isKnownLayout,
  layoutItems,
  type LayoutNote,
  type LayoutSpec,
} from "@/lib/print-layout";
import { cn } from "@/lib/utils";

export function PrintLayoutRecord({
  order,
  className,
}: {
  order: Pick<Order, "productionItems">;
  className?: string;
}) {
  const items = layoutItems(order);
  if (!items.length) return null;
  const named = (order.productionItems ?? []).length > 1;
  return (
    <div className={cn("flex flex-col gap-3", className)} data-testid="print-layout-record">
      {items.map(({ item, spec }) => (
        <LayoutBlock
          key={item.id}
          spec={spec}
          title={named ? `Print layout · ${item.itemName}` : "Print layout"}
        />
      ))}
    </div>
  );
}

function LayoutBlock({ spec, title }: { spec: LayoutSpec; title: string }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2.5 rounded-card border border-outline p-3"
    >
      <div className="flex items-start gap-3">
        {isKnownLayout(spec.code) ? <LayoutGlyph layout={spec.code} selected /> : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-caption text-text-muted">{title}</span>
          <span
            className="text-body-lg text-text-primary"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {spec.label}
          </span>
          {spec.press ? (
            <span className="text-body text-text-secondary">{spec.press}</span>
          ) : null}
        </div>
      </div>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-caption text-text-muted">Paper</dt>
        <dd
          className={cn(
            "text-body m-0 tabular-nums",
            spec.paper ? "text-text-primary" : "text-text-muted",
          )}
        >
          {spec.paper ?? "Not read from the options"}
        </dd>
        <dt className="text-caption text-text-muted">Client&rsquo;s page</dt>
        <dd
          className={cn(
            "text-body m-0 tabular-nums",
            spec.page ? "text-text-primary" : "text-text-muted",
          )}
        >
          {spec.page ?? "Size not read"}
          {spec.mixed ? (
            <span className="text-caption text-text-secondary block">
              The pages differ in size; GRIDGO checked the largest.
            </span>
          ) : null}
        </dd>
      </dl>
      {spec.outcome ? <OutcomeNote note={spec.outcome} /> : null}
      {spec.suggestion ? (
        <span className="text-caption text-text-secondary">{spec.suggestion}</span>
      ) : null}
    </section>
  );
}

function OutcomeNote({ note }: { note: LayoutNote }) {
  const Icon =
    note.tone === "warning" ? TriangleAlert : note.tone === "success" ? CircleCheck : Info;
  return (
    <p
      className={cn(
        "text-body text-text-primary m-0 flex items-start gap-2 rounded-field p-2",
        note.tone === "warning" ? "border border-warning bg-surface" : "bg-surface-variant",
      )}
      data-testid={`print-layout-${note.tone}`}
    >
      <Icon
        size={16}
        aria-hidden
        className={cn(
          "mt-0.5 shrink-0",
          note.tone === "warning"
            ? "text-warning"
            : note.tone === "success"
              ? "text-success"
              : "text-text-muted",
        )}
      />
      <span className="min-w-0">{note.text}</span>
    </p>
  );
}

/**
 * The placement in miniature, as the customer app draws it: the paper, and
 * the page on it. Fit fills the paper; the actual-size layouts keep a smaller
 * page in the middle or at the top-left corner. The label beside it says the
 * same, so the picture is never the only way to tell them apart.
 */
export function LayoutGlyph({
  layout,
  selected = false,
  className,
}: {
  layout: "fit_to_paper" | "actual_size_centered" | "actual_size_original_position";
  selected?: boolean;
  className?: string;
}) {
  const page =
    layout === "fit_to_paper"
      ? { x: 3, y: 3, width: 18, height: 26 }
      : layout === "actual_size_centered"
        ? { x: 6, y: 9, width: 12, height: 14 }
        : { x: 1.5, y: 1.5, width: 12, height: 14 };
  return (
    <svg
      width={24}
      height={32}
      viewBox="0 0 24 32"
      aria-hidden
      className={cn(
        "shrink-0",
        selected ? "text-text-primary" : "text-text-muted",
        className,
      )}
    >
      <rect
        x={0.75}
        y={0.75}
        width={22.5}
        height={30.5}
        rx={1.5}
        className="fill-surface"
        stroke="currentColor"
        strokeWidth={1.5}
      />
      <rect {...page} rx={0.5} fill="currentColor" opacity={selected ? 0.85 : 0.45} />
    </svg>
  );
}
