"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";

type Props = {
  title: string;
  reason: string;
  onSignOut: () => void;
};

/** Replaces the portal shell. The Clerk session stays; the workspace does not. */
export function AccountStatusNotice({ title, reason, onSignOut }: Props) {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center bg-canvas p-4"
    >
      <EmptyState
        className="w-full max-w-xl p-6 md:p-8"
        title={title}
        body={reason}
        action={
          <Button variant="primary" onClick={onSignOut}>
            Sign out
          </Button>
        }
      />
    </main>
  );
}
