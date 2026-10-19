"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TEST_OPERATIONS_BANNER, TEST_OPERATIONS_UNAVAILABLE } from "@/lib/review-data";

/**
 * Always on screen for a test operations login, so nobody mistakes the test
 * desk for the real one. Informational, never yellow.
 */
export function TestOperationsBanner() {
  return (
    <div
      role="note"
      aria-label="Test operations"
      data-testid="test-operations-banner"
      className="sticky top-14 z-20 flex items-center gap-2 border-b border-info bg-surface px-3 py-2"
    >
      <FlaskConical aria-hidden className="size-4 shrink-0 text-info" />
      <p
        className="text-body text-text-primary m-0"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {TEST_OPERATIONS_BANNER}
      </p>
    </div>
  );
}

/** A page outside the test operations desk: calm, with a way back. */
export function TestOperationsUnavailable() {
  return (
    <EmptyState
      title={TEST_OPERATIONS_UNAVAILABLE.title}
      body={TEST_OPERATIONS_UNAVAILABLE.body}
      action={
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href="/ops/orders" />}
        >
          Open Orders
        </Button>
      }
    />
  );
}

/** Some read on an allowed page was refused; the rest of the page still works. */
export function TestOperationsPartialNotice() {
  return (
    <p
      role="status"
      className="text-body text-text-secondary m-0 mb-3 flex items-center gap-2 rounded-card border border-outline bg-surface p-3"
    >
      <FlaskConical aria-hidden className="size-4 shrink-0 text-info" />
      {TEST_OPERATIONS_UNAVAILABLE.partial}
    </p>
  );
}
