import { FilePen } from "lucide-react";

import { StatusChip } from "@/components/ui/StatusChip";
import type { OrderChangeRequest } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { shopChangeNotice } from "@/lib/order-changes";

type Props = {
  request: OrderChangeRequest;
  /** The job's other requests, oldest first, said in one line each. */
  earlier?: OrderChangeRequest[];
};

/**
 * The job's change request and where it stands, in the shop's words.
 *
 * The change itself is the substance, so it sits where the eye lands after
 * the chip, with the client's note it answers muted above it. Until a change
 * is agreed every state says to keep making the job as ordered.
 */
export function ChangeRequestCard({ request, earlier = [] }: Props) {
  const notice = shopChangeNotice(request);
  return (
    <section
      className="gg-card flex flex-col gap-3 p-3"
      aria-labelledby="change-request-heading"
      data-testid="change-request"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="change-request-heading"
          className="text-h3 text-text-primary m-0 flex items-center gap-2"
        >
          <FilePen size={18} strokeWidth={1.75} aria-hidden />
          Change request
        </h3>
        <StatusChip {...notice.chip} />
      </div>
      <div className="flex flex-col gap-1">
        <p
          className="text-body-lg text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {notice.title}
        </p>
        <p className="text-body text-text-secondary m-0 max-w-prose">{notice.body}</p>
      </div>
      <dl className="bg-surface-variant border-outline m-0 flex flex-col gap-2 rounded-field border p-3">
        {request.originalInstructions ? (
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-text-muted">The client asked</dt>
            <dd className="text-body text-text-secondary m-0 break-words">
              {request.originalInstructions}
            </dd>
          </div>
        ) : null}
        {request.proposedSpec ? (
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-text-muted">Your change</dt>
            <dd
              className="text-body text-text-primary m-0 break-words"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {request.proposedSpec}
            </dd>
          </div>
        ) : null}
        {request.proposedReadyBy ? (
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-text-muted">New ready time</dt>
            <dd className="text-body text-text-primary m-0">
              {formatDateTime(request.proposedReadyBy)}
            </dd>
          </div>
        ) : null}
      </dl>
      {notice.money ? (
        <p className="text-body text-text-primary m-0 tabular-nums">{notice.money}</p>
      ) : null}
      {request.reason ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-caption text-text-muted m-0">Your reason, as the client read it</p>
          <p className="text-body text-text-secondary m-0 max-w-prose break-words">
            {request.reason}
          </p>
        </div>
      ) : null}
      <p className="text-caption text-text-muted m-0">Asked {formatDateTime(request.createdAt)}</p>
      {earlier.length ? (
        <div className="flex flex-col gap-1 border-t border-outline-subtle pt-3">
          <p className="text-caption text-text-muted m-0">Earlier requests on this job</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {earlier.map((row) => (
              <li key={row.id} className="text-body text-text-secondary">
                {shopChangeNotice(row).chip.label}: {row.proposedSpec || "a new time"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
