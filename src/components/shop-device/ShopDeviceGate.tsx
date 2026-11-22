"use client";

import { LogOut, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { WhosWorking } from "@/components/shop-device/WhosWorking";
import { useShopDevice } from "@/components/shop-device/useShopDevice";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isPersonalPushReleased, releaseWebPushOnLockedPc } from "@/lib/pwa/webPush";
import { isWorkerLockCode } from "@/lib/shop-device";

/** The PC cannot be handed to PIN staff until this browser drops the account's alerts. */
export const PUSH_NOT_RELEASED_COPY =
  "This PC still gets the shop account's alerts, so it can't be shared yet. Try again, or turn off notifications for this site in the browser.";

type Release = "checking" | "ready" | "failed";

/**
 * The supplier tree on a shared shop PC. While nobody is picked, the whole
 * screen is "Who's working?" and nothing behind it mounts, so no Owner screen,
 * stream or cache survives a lock. A reload drops the in-memory turn; the API
 * then answers `shop_worker_locked` and the picker shows again.
 *
 * Whatever way the picker is reached ("Share this PC", a reload, another tab,
 * a refusal), it shows only once this browser has confirmed it holds none of
 * the signed-in account's push. Until then nobody can pick, so no worker turn
 * starts on a PC that could still show the account's alerts.
 */
export function ShopDeviceGate({ children }: { children: ReactNode }) {
  const device = useShopDevice();
  const auth = useAuth();
  const apiLocked = auth.status === "unavailable" && isWorkerLockCode(auth.accessError);
  const picker = !device.worker && (device.shared || apiLocked);

  if (picker) {
    return (
      <PushReleased>
        <WhosWorking reason={device.lockReason} />
      </PushReleased>
    );
  }
  // Picked, while the sign-in check catches up with the new turn.
  if (device.worker && (apiLocked || auth.status === "checking")) {
    return <LoadingBlock label="Opening the shop…" />;
  }
  return <>{children}</>;
}

function PushReleased({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [release, setRelease] = useState<Release>(() =>
    isPersonalPushReleased() ? "ready" : "checking",
  );

  const run = useCallback(async () => {
    if (isPersonalPushReleased()) {
      setRelease("ready");
      return;
    }
    setRelease("checking");
    try {
      await releaseWebPushOnLockedPc();
      setRelease("ready");
    } catch {
      setRelease("failed");
    }
  }, []);

  useEffect(() => {
    if (release === "checking") void run();
    // Runs once per mount; "Try again" calls `run` itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (release === "ready") return <>{children}</>;
  if (release === "checking") return <LoadingBlock label="Getting this shop PC ready…" />;
  return (
    <main
      data-testid="push-not-released"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-center"
    >
      <h1 className="text-h2 text-text-primary m-0">This PC isn&apos;t ready to share</h1>
      <p role="alert" className="text-body text-text-secondary m-0 max-w-prose">
        {PUSH_NOT_RELEASED_COPY}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={() => void run()}>
          <RotateCw aria-hidden />
          Try again
        </Button>
        <Button variant="ghost" onClick={() => void auth.signOut()}>
          <LogOut aria-hidden />
          Sign out of this PC
        </Button>
      </div>
    </main>
  );
}
