"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  notificationChime,
  readNotificationSoundEnabled,
  subscribeNotificationSoundEnabled,
  writeNotificationSoundEnabled,
} from "@/lib/live/notificationSound";

const serverSnapshot = () => true;

/** The Desk chime preference for this browser, plus a setter that previews the sound when turned on. */
export function useNotificationSound(): {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} {
  const enabled = useSyncExternalStore(
    subscribeNotificationSoundEnabled,
    readNotificationSoundEnabled,
    serverSnapshot,
  );
  const setEnabled = useCallback((next: boolean) => {
    writeNotificationSoundEnabled(next);
    // The click that turns sound on is also the gesture browsers need before audio may play.
    if (next) notificationChime().play();
  }, []);
  return { enabled, setEnabled };
}
