"use client";

import { Clock, UserRoundX } from "lucide-react";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/** Re-check every 15 s while waiting: a pending person has no live stream. */
export const PENDING_RECHECK_MS = 15_000;

function NoticeFrame({
  icon,
  title,
  shopName,
  body,
  children,
  testId,
}: {
  icon: ReactNode;
  title: string;
  shopName?: string | null;
  body: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <main
      id="main-content"
      data-testid={testId}
      className="flex min-h-dvh items-center justify-center bg-canvas p-4"
    >
      <section
        aria-labelledby={`${testId}-title`}
        className="flex w-full max-w-md flex-col items-center gap-3 rounded-card border border-outline bg-surface p-6 text-center md:p-8"
      >
        <span
          aria-hidden
          className="flex size-14 items-center justify-center rounded-pill border border-outline bg-surface-variant text-text-secondary"
        >
          {icon}
        </span>
        {shopName ? (
          <p className="text-body text-text-secondary m-0">{shopName}</p>
        ) : null}
        <h1 id={`${testId}-title`} className="text-h2 text-text-primary m-0">
          {title}
        </h1>
        <p className="text-body text-text-secondary m-0">{body}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>
      </section>
    </main>
  );
}

/**
 * Joined, not yet approved. Nothing of the shop is readable until the Owner
 * approves, so this screen checks again on its own and opens the work as
 * soon as they do.
 */
export function ShopPendingNotice({
  shopName,
  onCheckAgain,
  onSignOut,
}: {
  shopName?: string | null;
  onCheckAgain: () => void;
  onSignOut: () => void;
}) {
  useEffect(() => {
    const timer = window.setInterval(onCheckAgain, PENDING_RECHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") onCheckAgain();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [onCheckAgain]);

  return (
    <NoticeFrame
      testId="shop-pending"
      icon={<Clock className="size-6" />}
      shopName={shopName}
      title="Waiting for approval"
      body="The Owner needs to approve you. This page opens your jobs when they do."
    >
      <Button variant="secondary" onClick={onCheckAgain}>
        Check now
      </Button>
      <Button variant="ghost" onClick={onSignOut}>
        Sign out
      </Button>
    </NoticeFrame>
  );
}

/** Removed from the shop: the work is gone from this browser. */
export function ShopRemovedNotice({
  onSignOut,
  otherWorkspace,
}: {
  onSignOut: () => void;
  /** Another GRIDGO workspace this person still has, if any. */
  otherWorkspace?: { href: string; label: string } | null;
}) {
  return (
    <NoticeFrame
      testId="shop-removed"
      icon={<UserRoundX className="size-6" />}
      title="You're no longer on this shop's team"
      body="Ask the Owner for a new invite if this is a mistake."
    >
      {otherWorkspace ? (
        <Button variant="secondary" nativeButton={false} render={<Link href={otherWorkspace.href} />}>
          Open {otherWorkspace.label}
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onSignOut}>
        Sign out
      </Button>
    </NoticeFrame>
  );
}
