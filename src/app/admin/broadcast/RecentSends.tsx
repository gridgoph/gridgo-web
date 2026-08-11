import {
  audienceLabel,
  describeAge,
  presentDelivery,
} from "@/app/admin/_lib/broadcasts";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Broadcast } from "@/lib/api/types";

type Props = {
  broadcasts: readonly Broadcast[] | null;
  loading: boolean;
  error: string | null;
  /** Stable clock owned by the page, so ages do not shift between renders. */
  nowMs: number | null;
  onRetry: () => void;
  /** The send that just happened, called out where the operator is composing. */
  highlightId?: string | null;
};

/**
 * Recent sends live beside the compose fields, not on a separate screen.
 * The mistake this guards against — the same broadcast twice, minutes apart —
 * is only visible to someone who can see what already went out.
 */
export function RecentSends({
  broadcasts,
  loading,
  error,
  nowMs,
  onRetry,
  highlightId,
}: Props) {
  return (
    <section
      className="gg-card flex flex-col gap-3"
      aria-labelledby="recent-sends-heading"
    >
      <h2 id="recent-sends-heading" className="text-h3 text-text-primary m-0">
        Already sent
      </h2>

      {loading ? (
        <p className="text-body text-text-muted m-0" role="status">
          Checking what has gone out recently…
        </p>
      ) : error ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-body text-text-secondary m-0" role="alert">
            {error}
          </p>
          <p className="text-caption text-text-muted m-0">
            Without this list you cannot see whether the same message went out a
            few minutes ago. Load it before sending.
          </p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : !broadcasts || broadcasts.length === 0 ? (
        <p className="text-body text-text-secondary m-0">
          Nothing has been broadcast yet. The first one you send appears here,
          with who sent it and how many phones took it.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {broadcasts.map((sent) => {
            const delivery = presentDelivery(
              sent.deliveredCount,
              sent.failedCount,
            );
            const isNew = highlightId === sent.id;
            return (
              <li
                key={sent.id}
                className={`flex flex-col gap-1.5 rounded-field border px-3 py-2.5 ${
                  isNew ? "border-outline bg-surface-variant" : "border-outline-subtle"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-caption text-text-muted">
                    {audienceLabel(sent.audience)}
                  </span>
                  <span className="text-caption text-text-muted" aria-hidden>
                    ·
                  </span>
                  <span className="text-caption text-text-muted">
                    {nowMs === null ? "" : describeAge(sent.sentAt, nowMs)}
                  </span>
                  {sent.sentByName ? (
                    <>
                      <span className="text-caption text-text-muted" aria-hidden>
                        ·
                      </span>
                      <span className="text-caption text-text-muted truncate">
                        {sent.sentByName}
                      </span>
                    </>
                  ) : null}
                </div>

                <p
                  className="text-body text-text-primary m-0 line-clamp-2"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  {sent.title}
                </p>

                <div>
                  <StatusChip
                    tone={delivery.tone}
                    label={delivery.label}
                    icon={delivery.icon}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
