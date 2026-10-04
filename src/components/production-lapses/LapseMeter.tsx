import type { ProductionLapse } from "@/lib/api/types";
import {
  LAPSES_TO_CAP,
  QUALITY_POINTS_CAP,
  presentTier,
  qualityPointsLost,
  RECENT_LAPSE_DAYS,
} from "@/lib/production-penalties";
import { cn } from "@/lib/utils";

/**
 * A shop's last 30 days as the matching rank sees them: five slots, because
 * the fifth late job is where the quality cut stops growing (2 points each,
 * 10 at most). Each late job fills a slot, newest first, and its tier sets how
 * tall the mark stands — minor a third, moderate two thirds, severe full — so
 * the meter reads in greyscale as well as colour.
 */
export function LapseMeter({
  recent,
  className,
}: {
  /** Lapses in the last 30 days, newest first. */
  recent: readonly ProductionLapse[];
  className?: string;
}) {
  const shown = recent.slice(0, LAPSES_TO_CAP);
  const extra = recent.length - shown.length;
  const points = qualityPointsLost(recent.length);
  const label =
    recent.length === 0
      ? `No late jobs in the last ${RECENT_LAPSE_DAYS} days`
      : `${recent.length} late ${recent.length === 1 ? "job" : "jobs"} in the last ${RECENT_LAPSE_DAYS} days (${shown
          .map((lapse) => presentTier(lapse.tier).label.toLowerCase())
          .join(", ")}${extra > 0 ? `, and ${extra} more` : ""}). Quality ranking lowered by ${points} of ${QUALITY_POINTS_CAP} points.`;

  return (
    <span className={cn("inline-flex items-end gap-1", className)} role="img" aria-label={label}>
      {Array.from({ length: LAPSES_TO_CAP }, (_, index) => {
        const lapse = shown[index];
        const tier = lapse ? presentTier(lapse.tier) : null;
        return (
          <span
            key={index}
            className={cn(
              "relative block h-5 w-2.5 overflow-hidden rounded-[3px] border",
              lapse ? "border-transparent bg-surface-variant" : "border-outline border-dashed",
            )}
          >
            {tier ? (
              <span
                className={cn(
                  "absolute inset-x-0 bottom-0 block",
                  tier.tone === "error" ? "h-full bg-error" : tier.tone === "warning" ? "h-2/3 bg-warning" : "h-1/3 bg-text-secondary",
                )}
              />
            ) : null}
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="text-caption text-text-muted ml-0.5 tabular-nums" aria-hidden>
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
