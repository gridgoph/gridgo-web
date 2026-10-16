import type { ReactNode } from "react";

import { StatusChip } from "@/components/ui/StatusChip";
import type { VoucherCampaign } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MODE_COPY, presentCampaignStatus, validityText } from "@/lib/vouchers";

/**
 * A campaign drawn as the voucher it hands out: the face value large on the
 * left, a perforated stub on the right with the code a client types (or the
 * fact that there is none). The stub's two notches are cut in the page
 * colour, so the ticket reads the same in both themes.
 *
 * Below 768px the stub folds under the face, perforation on top.
 */
export function VoucherTicket({
  campaign,
  issued,
  footer,
  className,
}: {
  campaign: VoucherCampaign;
  /** How many accounts hold one, when known. */
  issued?: number | null;
  /** The meter or anything else that belongs on the ticket's face. */
  footer?: ReactNode;
  className?: string;
}) {
  const status = presentCampaignStatus(campaign.status);
  const mode = MODE_COPY[campaign.mode];
  return (
    <article
      aria-label={`${campaign.name}, ${formatPhp(campaign.valueMinor)} voucher`}
      className={cn(
        "bg-surface border-outline relative grid overflow-hidden rounded-card border md:grid-cols-[minmax(0,1fr)_minmax(11rem,15rem)]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-h3 text-text-primary m-0 min-w-0 break-words">{campaign.name}</h2>
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
        </div>
        <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-display text-text-primary tabular-nums">
            {formatPhp(campaign.valueMinor)}
          </span>
          <span className="text-body text-text-secondary">off GRIDGO&rsquo;s fees, paid by GRIDGO</span>
        </p>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          <dt className="text-caption text-text-muted">How clients get it</dt>
          <dd className="text-body text-text-secondary m-0">{mode.label}</dd>
          <dt className="text-caption text-text-muted">Each voucher lasts</dt>
          <dd className="text-body text-text-secondary m-0">{validityText(campaign)}</dd>
          <dt className="text-caption text-text-muted">Limit</dt>
          <dd className="text-body text-text-secondary m-0 tabular-nums">
            {campaign.totalLimit.toLocaleString("en-PH")}{" "}
            {campaign.totalLimit === 1 ? "account" : "accounts"}, one each
            {issued != null ? `, ${issued.toLocaleString("en-PH")} issued` : ""}
          </dd>
        </dl>
        {footer}
      </div>

      <div className="border-outline relative flex flex-col justify-center gap-1 border-t border-dashed p-4 md:border-t-0 md:border-l">
        {/* The notches: half-discs in the page colour over the perforation. */}
        <span
          aria-hidden
          className="bg-background border-outline absolute hidden size-5 rounded-full border md:-top-2.5 md:-left-2.5 md:block"
        />
        <span
          aria-hidden
          className="bg-background border-outline absolute hidden size-5 rounded-full border md:-bottom-2.5 md:-left-2.5 md:block"
        />
        {campaign.mode === "shared" ? (
          <>
            <span className="text-caption text-text-muted">Code clients type</span>
            <span
              className="text-h3 text-text-primary break-all tabular-nums"
              style={{ letterSpacing: "0.06em" }}
            >
              {campaign.code}
            </span>
            <span className="text-caption text-text-muted">Not case-sensitive</span>
          </>
        ) : (
          <>
            <span className="text-caption text-text-muted">No code to type</span>
            <span className="text-body text-text-secondary">
              Super Admin issues it to client email addresses.
            </span>
          </>
        )}
      </div>
    </article>
  );
}
