import type { SupplierInvoiceCounts } from "@/lib/api/types";
import { meterParts, meterSentence } from "@/lib/supplier-invoices";
import { cn } from "@/lib/utils";

/**
 * One bar per month or shop, read left to right as the invoice's life: paper
 * original in GRIDGO's hands (solid), scanned but the paper still at the
 * shop (hatched), no usable scan yet (empty). Monochrome on purpose: the
 * three parts differ by fill, not colour, so the bar reads in greyscale, and
 * the numbers always sit beside it.
 */
export function CollectionMeter({
  counts,
  size = "md",
  className,
}: {
  counts: SupplierInvoiceCounts;
  size?: "sm" | "md";
  className?: string;
}) {
  const parts = meterParts(counts);
  const total = counts.expected;
  const height = size === "sm" ? "h-2" : "h-3.5";

  return (
    <div
      role="img"
      aria-label={meterSentence(counts)}
      className={cn(
        "border-outline bg-surface flex w-full overflow-hidden rounded-pill border",
        height,
        className,
      )}
    >
      {total > 0 ? (
        <>
          <Segment share={parts.collected / total} kind="collected" />
          <Segment share={parts.scannedOnly / total} kind="scanned" />
        </>
      ) : null}
    </div>
  );
}

function Segment({ share, kind }: { share: number; kind: "collected" | "scanned" }) {
  if (share <= 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "h-full shrink-0",
        kind === "collected" ? "bg-text-primary" : "gg-invoice-hatch text-text-muted",
      )}
      style={{ width: `${share * 100}%` }}
    />
  );
}

/** The key under the month's meter: each part's swatch and its count. */
export function CollectionMeterKey({ counts }: { counts: SupplierInvoiceCounts }) {
  const parts = meterParts(counts);
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
      <KeyItem swatch="collected" count={parts.collected}>
        {parts.collected === 1 ? "original collected" : "originals collected"}
      </KeyItem>
      <KeyItem swatch="scanned" count={parts.scannedOnly}>
        scanned, original still at the shop
      </KeyItem>
      <KeyItem swatch="missing" count={parts.missing}>
        {parts.missing === 1 ? "missing its scan" : "missing a scan"}
      </KeyItem>
    </ul>
  );
}

function KeyItem({
  swatch,
  count,
  children,
}: {
  swatch: "collected" | "scanned" | "missing";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <li className="text-caption text-text-secondary flex items-center gap-2">
      <span
        aria-hidden
        className={cn(
          "border-outline inline-block size-3 shrink-0 rounded-[3px] border",
          swatch === "collected" && "bg-text-primary border-text-primary",
          swatch === "scanned" && "gg-invoice-hatch text-text-muted",
          swatch === "missing" && "bg-surface",
        )}
      />
      <span>
        <span className="text-text-primary tabular-nums" style={{ fontFamily: "var(--font-bold)" }}>
          {count}
        </span>{" "}
        {children}
      </span>
    </li>
  );
}
