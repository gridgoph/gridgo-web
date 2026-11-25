import { formatPhp } from "@/lib/format";
import { StatusChip } from "@/components/ui/StatusChip";
import { BUDGET_CHIP, type Budget } from "@/lib/organization-partners";
import { cn } from "@/lib/utils";

const medium = { fontFamily: "var(--font-medium)" } as const;

/**
 * One organization's perk budget: used against the cap. The bar is drawn from
 * the API's two figures; the words beside it carry the same meaning, so it
 * reads without colour. `warn` is off when no new order can use the perk.
 */
export function BudgetMeter({
  budget,
  warn,
  compact = false,
}: {
  budget: Budget;
  warn: boolean;
  compact?: boolean;
}) {
  if (budget.capMinor === null || budget.leftMinor === null) {
    return (
      <p className="text-body text-text-secondary m-0">
        {budget.usedMinor > 0
          ? `${formatPhp(budget.usedMinor)} used. No cap is set.`
          : "No budget set yet"}
      </p>
    );
  }
  const alerting = warn && (budget.level === "near" || budget.level === "spent");
  const label = `${formatPhp(budget.usedMinor)} used of a ${formatPhp(budget.capMinor)} cap, ${formatPhp(budget.leftMinor)} left`;
  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-3")}>
      {compact ? (
        <span className="text-body text-text-primary tabular-nums">
          {formatPhp(budget.usedMinor)} of {formatPhp(budget.capMinor)}
        </span>
      ) : (
        <p className="text-body text-text-secondary m-0">
          <span className="text-h2 text-text-primary tabular-nums">
            {formatPhp(budget.usedMinor)}
          </span>{" "}
          used of {formatPhp(budget.capMinor)}
        </p>
      )}
      <div
        role="img"
        aria-label={label}
        className={cn(
          "bg-surface-variant border-outline w-full overflow-hidden rounded-full border",
          compact ? "h-2 max-w-40" : "h-3",
        )}
      >
        <div
          className={cn(
            "h-full",
            alerting && budget.level === "spent"
              ? "bg-error"
              : alerting
                ? "bg-warning"
                : "bg-text-primary",
          )}
          style={{ width: `${budget.percent}%` }}
        />
      </div>
      {compact ? null : (
        <p className="text-body text-text-secondary m-0">
          <span className="text-text-primary tabular-nums" style={medium}>
            {formatPhp(budget.leftMinor)}
          </span>{" "}
          left. Orders waiting for payment count as used until they are paid or cancelled.
        </p>
      )}
      {alerting && (budget.level === "near" || budget.level === "spent") ? (
        <div>
          <StatusChip {...BUDGET_CHIP[budget.level]} />
        </div>
      ) : null}
    </div>
  );
}
