"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { isNotAvailable, partnerErrorText } from "@/lib/organization-partners";

/** A load that failed, in words: not here yet, offline, refused or busy. */
export function PartnerLoadError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  if (isNotAvailable(error)) {
    return (
      <EmptyState
        title="Not available yet"
        body="The API behind this portal does not have partner organizations yet. They appear here once it is updated."
        action={
          <Button variant="secondary" onClick={onRetry}>
            Check again
          </Button>
        }
      />
    );
  }
  return (
    <ErrorState
      body={partnerErrorText(error, "load")}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}

/** A refresh that failed while older figures are on screen. */
export function StaleFigures({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="status"
      className="gg-card flex flex-wrap items-center justify-between gap-2 p-3"
    >
      <p className="text-body text-text-secondary m-0">
        These figures may be out of date. {message}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
