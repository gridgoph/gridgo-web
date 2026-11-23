"use client";

import { StatusMark } from "@/components/ui/StatusChip";
import { formatDateTime } from "@/lib/format";
import {
  setupRequestStatus,
  setupRequestTone,
  type SetupRequest,
} from "@/lib/product-templates";

/** The shop's own requests to the GRIDGO team, newest first, with where each one is. */
export function RequestList({
  requests,
  title,
}: {
  requests: SetupRequest[];
  title: string;
}) {
  if (!requests.length) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-h3 text-text-primary m-0">{title}</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {requests.map((request) => {
          const { tone, icon } = setupRequestTone(request.status);
          return (
            <li
              key={request.id}
              className="rounded-card border border-outline bg-surface flex flex-col gap-1 p-3"
            >
              <span
                className="text-body text-text-primary"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {request.requestedName ??
                  (request.fileIds.length
                    ? `${request.fileIds.length} ${request.fileIds.length === 1 ? "file" : "files"}${request.message ? " and a message" : ""}`
                    : "Message")}
              </span>
              <span className="text-caption text-text-secondary">
                <StatusMark tone={tone} icon={icon} label={setupRequestStatus(request)} />
              </span>
              {request.reason ? (
                <span className="text-caption text-text-secondary">
                  The GRIDGO team says: {request.reason}
                </span>
              ) : null}
              {request.createdAt ? (
                <span className="text-caption text-text-muted">
                  Sent {formatDateTime(request.createdAt)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
