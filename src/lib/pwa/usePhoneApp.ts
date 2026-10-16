"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  promptInstall,
  readDevice,
  readInstallRoute,
  subscribeInstall,
  type DeviceKind,
  type InstallRoute,
} from "@/lib/pwa/install";
import {
  prefetchWebPushKey,
  readWebPushStatus,
  turnOffWebPush,
  turnOnWebPush,
  type WebPushStatus,
} from "@/lib/pwa/webPush";

export const PHONE_APP_INVITE_KEY = "gridgo-web.phone-app-invite";

const serverRoute = (): InstallRoute => "none";

export type PhoneAppControl = {
  device: DeviceKind | null;
  install: InstallRoute;
  installing: boolean;
  installApp: () => Promise<void>;
  /** Null until the browser has been read (first client render). */
  push: WebPushStatus | null;
  pushBusy: boolean;
  /** Why the last turn-on failed, in screen copy. */
  pushError: string | null;
  turnOnPush: () => Promise<void>;
  turnOffPush: () => Promise<void>;
};

/** One shop's phone setup in this browser: install, then notifications. */
export function usePhoneApp(): PhoneAppControl {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const install = useSyncExternalStore(subscribeInstall, readInstallRoute, serverRoute);
  const [device, setDevice] = useState<DeviceKind | null>(null);
  const [installing, setInstalling] = useState(false);
  const [push, setPush] = useState<WebPushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    setDevice(readDevice());
  }, [install]);

  useEffect(() => {
    let live = true;
    const read = () =>
      void readWebPushStatus().then((status) => {
        if (live) setPush(status);
      });
    read();
    // Coming back from the browser's site settings, or from the Home Screen.
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [install]);

  // Read the server's key before the tap, so the permission ask comes first.
  useEffect(() => {
    if (push !== "ask" && push !== "off") return;
    let live = true;
    void prefetchWebPushKey().then((value) => {
      if (live) setKey(value);
    });
    return () => {
      live = false;
    };
  }, [push]);

  const installApp = useCallback(async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  }, []);

  const turnOnPush = useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      const outcome = await turnOnWebPush(key, userId);
      setPush(outcome.status);
      if ("reason" in outcome) setPushError(outcome.reason);
    } finally {
      setPushBusy(false);
    }
  }, [key, userId]);

  const turnOffPush = useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      setPush(await turnOffWebPush());
    } finally {
      setPushBusy(false);
    }
  }, []);

  return {
    device,
    install,
    installing,
    installApp,
    push,
    pushBusy,
    pushError,
    turnOnPush,
    turnOffPush,
  };
}
