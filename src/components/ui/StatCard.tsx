import type { LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  /** What is being counted, in the user's words. */
  label: string;
  value: string;
  /** One line saying what the number is drawn from. Never an API field name. */
  hint?: string;
  /**
   * Optional glyph. Use the icon the rail already uses for the screen this
   * figure belongs to — it teaches the mapping. Omit it rather than decorate.
   */
  icon?: LucideIcon;
  /**
   * The figure is still being fetched. Label, hint and icon are the screen's
   * own copy, so they stay on; only the number is reserved, in the box it will
   * land in. Pass any placeholder as `value` — it is not rendered.
   */
  loading?: boolean;
  className?: string;
};

/**
 * A single figure with its provenance. Structural fill only — never yellow.
 *
 * Below 768px figures sit two to a row, so the number steps down to `text-h3`
 * and the glyph tile drops out: at 390px a ₱123,456.00 still fits its half of
 * the screen, and the first job on a board is not pushed below the fold.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading = false,
  className,
}: Props) {
  return (
    <div
      className={cn("gg-card flex items-start justify-between gap-3", className)}
      aria-busy={loading || undefined}
    >
      <div className="min-w-0">
        <p className="text-overline text-text-muted m-0 uppercase">{label}</p>
        {loading ? (
          // 26px / 30px are the `text-h3` / `text-h2` line boxes, so the number
          // drops in without nudging the hint below it.
          <div className="mt-1 flex h-[26px] items-center md:h-[30px]">
            <Skeleton className="h-6 w-20" aria-hidden />
            <span className="sr-only">Still loading</span>
          </div>
        ) : (
          <p
            data-slot="stat-value"
            className="text-h3 md:text-h2 text-text-primary m-0 mt-1 tabular-nums"
          >
            {value}
          </p>
        )}
        {hint ? (
          <p className="text-caption text-text-muted m-0 mt-1">{hint}</p>
        ) : null}
      </div>
      {Icon ? (
        <span
          className="bg-surface-variant text-text-muted hidden size-10 shrink-0 items-center justify-center rounded-field md:flex"
          aria-hidden
        >
          <Icon size={18} strokeWidth={1.75} />
        </span>
      ) : null}
    </div>
  );
}
