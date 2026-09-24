"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import type { Role } from "@/lib/api/types";
import {
  createBrowserDesktopAlertSurface,
  desktopAlertsOnConfirmation,
  dismissDesktopAlertPrompt,
  readDesktopAlertPromptDismissed,
  readDesktopAlertStatus,
  subscribeDesktopAlerts,
  turnOnDesktopAlerts,
  writeDesktopAlertsEnabled,
  type DesktopAlertStatus,
} from "@/lib/live/desktopAlerts";

const serverStatus = (): DesktopAlertStatus => "unsupported";
const serverDismissed = () => true;

export type DesktopAlertsControl = {
  status: DesktopAlertStatus;
  /** The browser's permission prompt is open. */
  requesting: boolean;
  /** The one-time Desk prompt: undecided permission and never dismissed. */
  promptVisible: boolean;
  turnOn: () => Promise<void>;
  turnOff: () => void;
  dismissPrompt: () => void;
};

/** The Desk's desktop-alert switch for this browser. */
export function useDesktopAlerts(role: Role): DesktopAlertsControl {
  const status = useSyncExternalStore(
    subscribeDesktopAlerts,
    readDesktopAlertStatus,
    serverStatus,
  );
  const dismissed = useSyncExternalStore(
    subscribeDesktopAlerts,
    readDesktopAlertPromptDismissed,
    serverDismissed,
  );
  const [requesting, setRequesting] = useState(false);

  const turnOn = useCallback(async () => {
    setRequesting(true);
    try {
      const wasAsking = readDesktopAlertStatus() === "ask";
      const next = await turnOnDesktopAlerts();
      // A first grant shows one alert, so the person knows what they look like
      // and learns straight away if the operating system is holding them back.
      if (wasAsking && next === "on") {
        await createBrowserDesktopAlertSurface({ onClick: () => undefined })
          .show(desktopAlertsOnConfirmation(role))
          .catch(() => undefined);
      }
    } finally {
      setRequesting(false);
    }
  }, [role]);

  const turnOff = useCallback(() => writeDesktopAlertsEnabled(false), []);

  return {
    status,
    requesting,
    promptVisible: status === "ask" && !dismissed,
    turnOn,
    turnOff,
    dismissPrompt: dismissDesktopAlertPrompt,
  };
}
