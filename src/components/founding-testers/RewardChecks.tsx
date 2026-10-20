import { StatusChip } from "@/components/ui/StatusChip";
import type { TesterReward } from "@/lib/api/types";
import {
  CHECKS,
  checkCoverageText,
  evidenceMissing,
  presentCheck,
} from "@/lib/tester-program";

/**
 * The three invite checks on a referral reward as chips, for a table cell. A
 * mission reward runs none. "Evidence missing" flags a reward that issued
 * without a full comparison, for staff review.
 */
export function RewardCheckChips({ reward }: { reward: TesterReward }) {
  if (reward.kind !== "referral") {
    return <span className="text-caption text-text-muted">None (five-step reward)</span>;
  }
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {CHECKS.map((check) => {
          const shown = presentCheck(reward.checks[check.key]);
          return (
            <li key={check.key}>
              <StatusChip
                tone={shown.tone}
                icon={shown.icon}
                label={`${check.label}: ${shown.label}`}
              />
            </li>
          );
        })}
      </ul>
      {evidenceMissing(reward) ? (
        <span className="text-caption text-text-muted">Some evidence missing</span>
      ) : null}
    </div>
  );
}

/** Each check with who it compared, matched, and could not compare. */
export function RewardCheckCoverage({
  reward,
  name,
}: {
  reward: TesterReward;
  name: (id: string) => string;
}) {
  if (reward.kind !== "referral") {
    return (
      <p className="text-body text-text-secondary m-0">
        A five-step reward runs no invite checks.
      </p>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {CHECKS.map((check) => {
        const result = reward.checks[check.key];
        const shown = presentCheck(result);
        return (
          <li
            key={check.key}
            className="border-outline flex flex-col gap-1 rounded-field border px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className="text-body text-text-primary"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {check.label}
              </span>
              <StatusChip tone={shown.tone} icon={shown.icon} label={shown.label} />
            </div>
            <p className="text-caption text-text-muted m-0">
              {checkCoverageText(result, reward.clientId, name)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
