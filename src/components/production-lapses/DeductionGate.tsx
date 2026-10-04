import Link from "next/link";

import { settingsHref, type LapseTree } from "@/components/production-lapses/paths";
import { StatusChip } from "@/components/ui/StatusChip";
import type { ProductionPenaltyPolicy } from "@/lib/api/types";
import { formatRatePercent } from "@/components/settings/service-fee";

/**
 * Whether late jobs cost shops money right now, said once at the top of the
 * late-production screens. Null policy: the settings could not be read, so
 * the line says nothing rather than guess.
 */
export function DeductionGate({
  policy,
  tree,
}: {
  policy: ProductionPenaltyPolicy | null;
  tree: LapseTree;
}) {
  if (!policy) return null;
  const rates = `${formatRatePercent(policy.minorBps)} / ${formatRatePercent(policy.moderateBps)} / ${formatRatePercent(policy.severeBps)}`;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
      data-testid="deduction-gate"
    >
      <StatusChip
        tone={policy.deductionsEnabled ? "warning" : "neutral"}
        icon={policy.deductionsEnabled ? "triangle-alert" : "circle-dashed"}
        label={policy.deductionsEnabled ? "Deductions on" : "Warnings only"}
      />
      <p className="text-body text-text-secondary m-0 max-w-prose">
        {policy.deductionsEnabled
          ? `New late jobs lose ${rates} (minor / moderate / severe) of what the shop is still owed on them.`
          : `Real deductions are off, so no shop loses money for a late job. Rates on file: ${rates}.`}{" "}
        <Link
          href={settingsHref(tree)}
          className="text-[var(--color-brand)] underline-offset-4 hover:underline"
        >
          {tree === "admin" ? "Change in settings" : "See settings"}
        </Link>
      </p>
    </div>
  );
}
