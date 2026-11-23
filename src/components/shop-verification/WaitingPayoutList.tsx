import Link from "next/link";

import { StatusChip } from "@/components/ui/StatusChip";
import { formatPhp } from "@/lib/format";
import { waitingReasonLine, type WaitingPayout } from "@/lib/shop-verification";

/**
 * Staged payments waiting on verification (the ledger's `held` entries). The
 * stage on the job is not reshaped by GRIDGO, so this list is where a shop
 * learns the money is waiting, not lost. Owner only, like all of Money.
 */
export function WaitingPayoutList({ waiting }: { waiting: readonly WaitingPayout[] }) {
  if (!waiting.length) return null;
  const total = waiting.reduce((sum, item) => sum + item.amountMinor, 0);
  return (
    <section aria-labelledby="waiting-payouts-heading" className="gg-card flex flex-col p-4" data-testid="waiting-payouts">
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <h3 id="waiting-payouts-heading" className="text-h3 text-text-primary m-0">
          Waiting to be paid
        </h3>
        <span className="text-h3 text-text-primary tabular-nums">{formatPhp(total)}</span>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {waiting.map((item) => {
          const body = (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex">
                  <StatusChip tone="neutral" icon="clock" label="Waiting" />
                </span>
                <span className="text-caption text-text-secondary">{waitingReasonLine(item.reason)}</span>
              </span>
              <span className="text-body text-text-primary tabular-nums">{formatPhp(item.amountMinor)}</span>
            </>
          );
          return (
            <li key={item.key} className="border-outline-subtle border-t">
              {item.orderId ? (
                <Link
                  href={`/supplier/jobs/${encodeURIComponent(item.orderId)}`}
                  className="hover:bg-overlay-hover flex min-h-11 items-center gap-3 py-2 no-underline"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex min-h-11 items-center gap-3 py-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
