import type { Notification } from "@/lib/api/types";

/**
 * The Desk arrival toast.
 *
 * A fresh slip landing on the register is announced once, where the person is
 * looking, so an order milestone or a payout release is never only a number
 * on the bell. Two rules keep it honest:
 *
 * - One slip, one toast, with an "Open" that goes where the inbox row would.
 * - A burst folds into one line. Arrivals within the coalescing window update
 *   the toast already showing into "N new updates on the desk" instead of
 *   stacking a card per row; a reconnect replay never reaches here at all
 *   (the provider gates on the first inbox fetch, exactly as the chime does).
 *
 * The announcer knows nothing about sound or read state: the provider decides
 * whether an arrival is news, this only says it out loud.
 */

export const ARRIVAL_TOAST_TYPE = "arrival";
export const ARRIVAL_BURST_TOAST_TYPE = "arrival-burst";
export const ARRIVAL_TOAST_TIMEOUT_MS = 8_000;
export const ARRIVAL_TOAST_COALESCE_MS = 1_500;

export type ArrivalToastData = {
  notification: Notification;
};

export type ArrivalBurstToastData = {
  count: number;
};

type AddOptions = {
  id?: string;
  type?: string;
  title?: string;
  description?: string;
  timeout?: number;
  priority?: "low" | "high";
  data?: ArrivalToastData | ArrivalBurstToastData;
  actionProps?: { children?: string; onClick?: () => void };
  onClose?: () => void;
};

/** The slice of the Base UI toast manager the announcer needs. */
export type ArrivalToastManager = {
  add: (options: AddOptions) => string;
  update: (id: string, options: Partial<AddOptions>) => void;
};

export type ArrivalAnnouncer = {
  /** Say that this row just landed. Returns the toast id it went into. */
  announce: (notification: Notification) => string;
  /** Forget the open burst; later arrivals start a fresh toast. */
  dispose: () => void;
};

type AnnouncerOptions = {
  manager: ArrivalToastManager;
  onOpen: (notification: Notification) => void;
  coalesceMs?: number;
  timeoutMs?: number;
  now?: () => number;
};

export function burstTitle(count: number): string {
  return `${count} new updates on the desk`;
}

export function createArrivalAnnouncer({
  manager,
  onOpen,
  coalesceMs = ARRIVAL_TOAST_COALESCE_MS,
  timeoutMs = ARRIVAL_TOAST_TIMEOUT_MS,
  now = () => Date.now(),
}: AnnouncerOptions): ArrivalAnnouncer {
  let burst: { id: string; count: number; startedAt: number } | null = null;

  return {
    announce(notification) {
      const at = now();
      if (burst && at - burst.startedAt <= coalesceMs) {
        burst.count += 1;
        const count = burst.count;
        manager.update(burst.id, {
          type: ARRIVAL_BURST_TOAST_TYPE,
          title: burstTitle(count),
          description: "Open the bell to read them.",
          data: { count },
          actionProps: undefined,
          timeout: timeoutMs,
        });
        return burst.id;
      }
      const id = manager.add({
        type: ARRIVAL_TOAST_TYPE,
        title: notification.title,
        description: notification.body,
        timeout: timeoutMs,
        priority: "low",
        data: { notification },
        actionProps: { children: "Open", onClick: () => onOpen(notification) },
        onClose: () => {
          if (burst?.id === id) burst = null;
        },
      });
      burst = { id, count: 1, startedAt: at };
      return id;
    },
    dispose() {
      burst = null;
    },
  };
}
