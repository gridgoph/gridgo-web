import {
  audienceLabel,
  describeAge,
  presentAnnouncementReach,
} from "@/app/admin/_lib/broadcasts";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Announcement } from "@/lib/api/types";

type Props = {
  last: Announcement | null;
  /** Stable clock owned by the page, so ages do not shift between renders. */
  nowMs: number | null;
};

/**
 * This session only. There is no list API — inventing one would 404-loop.
 * The last send stays here so the operator can see what just left, and so an
 * identical resend in the same sitting is visible before they press again.
 */
export function LastSend({ last, nowMs }: Props) {
  const reach = last
    ? presentAnnouncementReach(
        last.notifiedUsers,
        last.unclaimedDevices,
        last.audience,
      )
    : null;

  return (
    <section
      className="gg-card flex flex-col gap-3"
      aria-labelledby="last-send-heading"
    >
      <h2 id="last-send-heading" className="text-h3 text-text-primary m-0">
        This session
      </h2>

      {!last || !reach ? (
        <p className="text-body text-text-secondary m-0">
          Nothing sent this session. The last announcement you send stays here
          until you leave, with who it reached.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-field border border-outline bg-surface-variant px-3 py-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-caption text-text-muted">
              {audienceLabel(last.audience)}
            </span>
            <span className="text-caption text-text-muted" aria-hidden>
              ·
            </span>
            <span className="text-caption text-text-muted">
              {nowMs === null ? "" : describeAge(last.at, nowMs)}
            </span>
          </div>

          <p
            className="text-body text-text-primary m-0 line-clamp-2"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {last.title}
          </p>
          {last.imageUrl ? (
            <p className="text-caption text-text-muted m-0">With picture</p>
          ) : null}

          <div>
            <StatusChip
              tone={reach.tone}
              label={reach.label}
              icon={reach.icon}
            />
          </div>
        </div>
      )}
    </section>
  );
}
