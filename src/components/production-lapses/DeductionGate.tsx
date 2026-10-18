import Link from "next/link";

import { settingsHref, type LapseTree } from "@/components/production-lapses/paths";
import { shopPerformanceHref } from "@/components/shop-performance/paths";
import { StatusChip } from "@/components/ui/StatusChip";
import type { ProductionPenaltyPolicy } from "@/lib/api/types";

/**
 * Whether late jobs cost shops money, said once at the top of the
 * late-production screens. Since the warnings-only rollout (gridgo-api#223
 * decision B, SUPPLIER_PERFORMANCE_API.md) the API takes no new deduction
 * whatever the stored switch says, so the line no longer reads the switch as
 * "on": it only warns when the switch is left on. Null policy: the settings
 * could not be read, so the line says nothing about the switch.
 */
export function DeductionGate({
  policy,
  tree,
}: {
  policy: ProductionPenaltyPolicy | null;
  tree: LapseTree;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
      data-testid="deduction-gate"
    >
      <StatusChip tone="neutral" icon="circle-dashed" label="Warnings only" />
      <p className="text-body text-text-secondary m-0 max-w-prose">
        No shop loses money for a late job: each late finish is a written notice. Deductions
        already applied stay as they were.{" "}
        {policy?.deductionsEnabled ? (
          <>
            The old deductions switch is still on in settings but no longer takes money;{" "}
            <Link
              href={settingsHref(tree)}
              className="text-[var(--color-brand)] underline-offset-4 hover:underline"
            >
              {tree === "admin" ? "turn it off" : "ask Super Admin to turn it off"}
            </Link>
            .{" "}
          </>
        ) : null}
        <Link
          href={shopPerformanceHref(tree)}
          className="text-[var(--color-brand)] underline-offset-4 hover:underline"
        >
          See shop performance
        </Link>
      </p>
    </div>
  );
}
