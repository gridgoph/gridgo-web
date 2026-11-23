import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { VerifyNotice } from "@/lib/shop-verification";

export const GET_VERIFIED_HREF = "/supplier/documents";

/**
 * The short verification note on Today and Money (`src/lib/shop-verification.ts`
 * writes the words, the same as the phone app). Never yellow: on Today the
 * yellow belongs to the day's work, and on Money nothing here is the page's
 * main action. A pause is the only thing drawn in the warning tone; the
 * countdown chip appears only in the last seven days.
 */
export function VerifyNoticeCard({
  notice,
  testId,
  className = "",
}: {
  notice: VerifyNotice;
  testId?: string;
  className?: string;
}) {
  const paused = notice.tone === "warning";
  return (
    <section
      aria-label={notice.title}
      data-testid={testId}
      className={`gg-card flex flex-col gap-3 p-4 ${paused ? "border-warning" : ""} ${className}`}
    >
      <div className="flex items-start gap-3">
        <BadgeCheck
          className="mt-0.5 size-5 shrink-0"
          style={{ color: paused ? "var(--color-warning)" : "var(--color-success)" }}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-h3 text-text-primary m-0">{notice.title}</h3>
          <p className="text-body text-text-secondary m-0 max-w-prose">{notice.body}</p>
        </div>
      </div>
      {paused || notice.chip || notice.action ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex">
            {paused ? (
              <StatusChip tone="warning" icon="triangle-alert" label="New orders paused" />
            ) : notice.chip ? (
              <StatusChip tone="neutral" icon="clock" label={notice.chip} />
            ) : null}
          </div>
          {notice.action ? (
            <Button
              variant="default"
              render={<Link href={GET_VERIFIED_HREF} />}
              nativeButton={false}
            >
              {notice.action}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
