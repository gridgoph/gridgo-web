import { describe, expect, it, vi } from "vitest";

import type { Notification } from "@/lib/api/types";
import {
  ARRIVAL_BURST_TOAST_TYPE,
  ARRIVAL_TOAST_TYPE,
  burstTitle,
  createArrivalAnnouncer,
  type ArrivalToastManager,
} from "@/lib/live/arrivalToast";

function note(id: string, partial: Partial<Notification> = {}): Notification {
  return {
    id,
    userId: "user_ops",
    title: `Ready for a rider · ${id}`,
    body: "Packaging is ready.",
    read: false,
    at: "2026-09-15T12:00:00.000Z",
    orderId: id,
    type: "ops_order_progress",
    ...partial,
  };
}

function manager() {
  let next = 0;
  const add = vi.fn(() => `toast_${++next}`);
  const update = vi.fn();
  return { add, update } as ArrivalToastManager & {
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

describe("arrival announcer", () => {
  it("shows one slip per arrival, with Open going to the row", () => {
    const m = manager();
    const onOpen = vi.fn();
    let clock = 0;
    const announcer = createArrivalAnnouncer({ manager: m, onOpen, now: () => clock });

    announcer.announce(note("ord_1"));
    clock = 5_000;
    announcer.announce(note("ord_2"));

    expect(m.add).toHaveBeenCalledTimes(2);
    expect(m.update).not.toHaveBeenCalled();
    const first = m.add.mock.calls[0][0];
    expect(first.type).toBe(ARRIVAL_TOAST_TYPE);
    expect(first.data).toEqual({ notification: note("ord_1") });
    expect(first.timeout).toBe(8_000);
    first.actionProps?.onClick?.();
    expect(onOpen).toHaveBeenCalledWith(note("ord_1"));
  });

  it("folds a burst into one line instead of stacking slips", () => {
    const m = manager();
    let clock = 0;
    const announcer = createArrivalAnnouncer({
      manager: m,
      onOpen: vi.fn(),
      now: () => clock,
    });

    const id = announcer.announce(note("ord_1"));
    clock = 400;
    expect(announcer.announce(note("ord_2"))).toBe(id);
    clock = 1_400;
    expect(announcer.announce(note("ord_3"))).toBe(id);

    expect(m.add).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledTimes(2);
    const last = m.update.mock.calls[1][1];
    expect(last.type).toBe(ARRIVAL_BURST_TOAST_TYPE);
    expect(last.title).toBe(burstTitle(3));
    expect(last.data).toEqual({ count: 3 });
    expect(last.actionProps).toBeUndefined();

    // Once the window closes, the next arrival is its own slip again.
    clock = 4_000;
    expect(announcer.announce(note("ord_4"))).not.toBe(id);
    expect(m.add).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh slip after the open toast was closed", () => {
    const m = manager();
    let clock = 0;
    const announcer = createArrivalAnnouncer({
      manager: m,
      onOpen: vi.fn(),
      now: () => clock,
    });

    announcer.announce(note("ord_1"));
    m.add.mock.calls[0][0].onClose?.();
    clock = 200;
    announcer.announce(note("ord_2"));

    expect(m.add).toHaveBeenCalledTimes(2);
    expect(m.update).not.toHaveBeenCalled();
  });
});
