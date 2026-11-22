"use client";

import { UserRoundCheck, Users } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { lockWorkingDevice } from "@/lib/api/shop-team";
import type { ShopWorker } from "@/lib/api/types";
import { lockShopDevice, shopDeviceSnapshot, turnEndReason, type LockReason } from "@/lib/shop-device";
import { shopRoleLabel } from "@/lib/shop-team";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;
const CHECK_EVERY_MS = 15_000;

/**
 * Lock the PC: drop the turn and show the picker at once, then tell the API
 * (the lock needs no turn token; a lost call still leaves the API's own
 * 30-minute end). Nothing falls back to the signed-in account.
 */
export async function endWorkerTurn(reason: LockReason) {
  if (!shopDeviceSnapshot().worker) return;
  lockShopDevice(reason);
  await lockWorkingDevice().catch(() => undefined);
}

/**
 * Watches for use while someone is picked. 15 minutes without a key, click or
 * scroll, or the API's turn running out, locks back to "Who's working?".
 */
export function useTurnWatch(active: boolean, now: () => number = Date.now) {
  const lastActivity = useRef(now());
  useEffect(() => {
    if (!active) return;
    lastActivity.current = now();
    const mark = () => {
      lastActivity.current = now();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, mark, { passive: true });
    const timer = window.setInterval(() => {
      const reason = turnEndReason(shopDeviceSnapshot(), lastActivity.current, now());
      if (reason) void endWorkerTurn(reason);
    }, CHECK_EVERY_MS);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, mark);
      window.clearInterval(timer);
    };
  }, [active, now]);
}

/**
 * Who is working on this shared PC, always in the top bar, with the one way
 * to hand over: Switch person locks and shows the picker.
 */
export function WorkerBar({ worker }: { worker: ShopWorker }) {
  useTurnWatch(true);
  return (
    <div
      data-testid="worker-bar"
      className="flex items-center gap-1 rounded-pill border border-outline bg-surface-variant py-0.5 pl-3 pr-0.5"
    >
      <UserRoundCheck aria-hidden className="size-4 shrink-0 text-text-primary" />
      <span className="text-caption text-text-primary max-w-40 truncate" role="status">
        <span style={{ fontFamily: "var(--font-bold)" }}>{worker.name}</span>
        <span className="hidden md:inline"> is working · {shopRoleLabel(worker.role)}</span>
      </span>
      <Button
        variant="ghost"
        className="rounded-pill"
        onClick={() => void endWorkerTurn("switch")}
      >
        <Users aria-hidden />
        <span className="hidden md:inline">Switch person</span>
        <span className="sr-only md:hidden">Switch person</span>
      </Button>
    </div>
  );
}
