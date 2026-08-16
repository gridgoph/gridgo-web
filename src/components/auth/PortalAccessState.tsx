"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

type DeniedProps = {
  body: string;
  onSignOut: () => void;
  title?: string;
};

export function PortalAccessDenied({
  body,
  onSignOut,
  title = "Portal access has not been assigned",
}: DeniedProps) {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center bg-canvas p-4"
    >
      <EmptyState
        className="w-full max-w-xl p-6 md:p-8"
        title={title}
        body={body}
        action={
          <Button variant="primary" onClick={onSignOut}>
            Use another account
          </Button>
        }
      />
    </main>
  );
}

export function PortalAccessUnavailable({
  onRetry,
  onSignOut,
}: {
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center bg-canvas p-4"
    >
      <ErrorState
        className="w-full max-w-xl p-6 md:p-8"
        title="Could not check portal access"
        body="GRIDGO could not confirm this account's memberships. Check the connection and try again."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
            <Button onClick={onSignOut}>Use another account</Button>
          </div>
        }
      />
    </main>
  );
}
