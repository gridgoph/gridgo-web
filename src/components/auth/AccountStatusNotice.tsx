"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";

type Props = {
  title: string;
  reason: string;
  onSignOut: () => void;
  supplierSelfService?: boolean;
};

/** Replaces the portal shell. The Clerk session stays; the workspace does not. */
export function AccountStatusNotice({
  title,
  reason,
  onSignOut,
  supplierSelfService,
}: Props) {
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
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" onClick={onSignOut}>
              Sign out
            </Button>
            {supplierSelfService ? (
              <>
                <Link
                  href="/supplier/legal"
                  className="text-body text-text-primary underline"
                >
                  Legal documents
                </Link>
                <Link
                  href="/supplier/privacy"
                  className="text-body text-text-primary underline"
                >
                  Your data
                </Link>
              </>
            ) : null}
          </div>
        }
      />
    </main>
  );
}
