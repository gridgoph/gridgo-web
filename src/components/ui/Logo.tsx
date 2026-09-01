import { cn } from "@/lib/utils";

type Props = {
  /** Compact mark for the rail; full wordmark when false. */
  compact?: boolean;
  className?: string;
};

/**
 * Canonical GRIDGO lockup — 3×3 grid from the landing favicon, Instrument Sans wordmark.
 *
 * Top-right is brand yellow (the only yellow in the mark). Center-right and
 * bottom-right are the mark gray. The other six follow the foreground so they
 * stay visible in dark.
 */
export function Logo({ compact = false, className }: Props) {
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label="GRIDGO">
      <GridMark className={compact ? "size-6" : "size-8"} />
      {!compact ? (
        <span
          className="text-body-lg tracking-tight"
          style={{ fontFamily: "var(--font-black)" }}
        >
          GRIDGO
        </span>
      ) : null}
    </div>
  );
}

function GridMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-6 shrink-0 text-foreground", className)}
      aria-hidden
      data-slot="logo-mark"
    >
      <circle cx="8" cy="8" r="5" fill="currentColor" />
      <circle cx="24" cy="8" r="5" fill="currentColor" />
      <circle cx="40" cy="8" r="5" fill="var(--color-brand-logo)" />
      <circle cx="8" cy="24" r="5" fill="currentColor" />
      <circle cx="24" cy="24" r="5" fill="currentColor" />
      <circle cx="40" cy="24" r="5" fill="var(--color-brand-logo-muted)" />
      <circle cx="8" cy="40" r="5" fill="currentColor" />
      <circle cx="24" cy="40" r="5" fill="currentColor" />
      <circle cx="40" cy="40" r="5" fill="var(--color-brand-logo-muted)" />
    </svg>
  );
}
