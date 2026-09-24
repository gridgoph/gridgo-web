// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Notification } from "@/lib/api/types";
import {
  DESKTOP_ALERT_CLICK_MESSAGE,
  DESKTOP_ALERTS_PREFERENCE_KEY,
  DESKTOP_ALERTS_PROMPT_KEY,
  createBrowserDesktopAlertSurface,
  createDesktopAnnouncer,
  desktopAlertStatus,
  desktopAlertWanted,
  readDesktopAlertClick,
  readDesktopAlertPromptDismissed,
  readDesktopAlertStatus,
  resetDesktopAlertWorkerForTests,
  safePortalPath,
  turnOnDesktopAlerts,
  writeDesktopAlertsEnabled,
  type DesktopAlert,
  type DesktopAlertStatus,
} from "../desktopAlerts";

function row(id: string, extra: Partial<Notification> = {}): Notification {
  return {
    id,
    userId: "u1",
    type: "ops_payment_submitted",
    orderId: `ord_${id}`,
    title: `Title ${id}`,
    body: `Body ${id}`,
    read: false,
    at: new Date().toISOString(),
    ...extra,
  };
}

type FakeNotificationClass = {
  new (
    title: string,
    options?: NotificationOptions,
  ): {
    title: string;
    options?: NotificationOptions;
    onclick: (() => void) | null;
    close: () => void;
  };
  permission: NotificationPermission;
  requestPermission: ReturnType<typeof vi.fn>;
  created: Array<{
    title: string;
    options?: NotificationOptions;
    onclick: (() => void) | null;
  }>;
};

function installNotification(
  permission: NotificationPermission,
  answer: NotificationPermission = permission,
): FakeNotificationClass {
  const created: FakeNotificationClass["created"] = [];
  class FakeNotification {
    static permission = permission;
    static created = created;
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = answer;
      return answer;
    });
    onclick: (() => void) | null = null;
    close = vi.fn();
    constructor(
      public title: string,
      public options?: NotificationOptions,
    ) {
      created.push(this);
    }
  }
  vi.stubGlobal("Notification", FakeNotification);
  return FakeNotification as unknown as FakeNotificationClass;
}

beforeEach(() => {
  window.localStorage.clear();
  resetDesktopAlertWorkerForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("permission states", () => {
  it("maps browser permission and the Desk preference to one status", () => {
    expect(desktopAlertStatus("unsupported", "on")).toBe("unsupported");
    expect(desktopAlertStatus("denied", "on")).toBe("blocked");
    expect(desktopAlertStatus("default", "on")).toBe("ask");
    expect(desktopAlertStatus("granted", null)).toBe("on");
    expect(desktopAlertStatus("granted", "on")).toBe("on");
    expect(desktopAlertStatus("granted", "off")).toBe("off");
  });

  it("reads unsupported where the browser has no Notification API", () => {
    vi.stubGlobal("Notification", undefined);
    expect(readDesktopAlertStatus()).toBe("unsupported");
  });

  it("reads unsupported on an insecure origin", () => {
    installNotification("granted");
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      configurable: true,
    });
    try {
      expect(readDesktopAlertStatus()).toBe("unsupported");
    } finally {
      Reflect.deleteProperty(window, "isSecureContext");
    }
  });

  it("follows the per-browser switch once permission is granted", () => {
    installNotification("granted");
    expect(readDesktopAlertStatus()).toBe("on");
    writeDesktopAlertsEnabled(false);
    expect(readDesktopAlertStatus()).toBe("off");
    writeDesktopAlertsEnabled(true);
    expect(readDesktopAlertStatus()).toBe("on");
  });
});

describe("turning alerts on", () => {
  it("asks the browser only from Turn on, and remembers the prompt was answered", async () => {
    const api = installNotification("default", "granted");
    expect(readDesktopAlertStatus()).toBe("ask");
    expect(api.requestPermission).not.toHaveBeenCalled();
    await expect(turnOnDesktopAlerts()).resolves.toBe("on");
    expect(api.requestPermission).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(DESKTOP_ALERTS_PREFERENCE_KEY)).toBe("on");
    expect(readDesktopAlertPromptDismissed()).toBe(true);
  });

  it("lands on blocked when the person denies, and does not ask again", async () => {
    const api = installNotification("default", "denied");
    await expect(turnOnDesktopAlerts()).resolves.toBe("blocked");
    await expect(turnOnDesktopAlerts()).resolves.toBe("blocked");
    expect(api.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("stays askable when the browser prompt is closed without an answer", async () => {
    installNotification("default", "default");
    await expect(turnOnDesktopAlerts()).resolves.toBe("ask");
    expect(window.localStorage.getItem(DESKTOP_ALERTS_PROMPT_KEY)).toBe("dismissed");
  });

  it("flips the switch back on without re-asking a granted browser", async () => {
    const api = installNotification("granted");
    writeDesktopAlertsEnabled(false);
    await expect(turnOnDesktopAlerts()).resolves.toBe("on");
    expect(api.requestPermission).not.toHaveBeenCalled();
  });

  it("handles the older callback-only requestPermission", async () => {
    const api = installNotification("default");
    api.requestPermission.mockImplementation((callback: (value: string) => void) => {
      api.permission = "granted";
      callback("granted");
      return undefined;
    });
    await expect(turnOnDesktopAlerts()).resolves.toBe("on");
  });

  it("never asks where notifications are unsupported", async () => {
    vi.stubGlobal("Notification", undefined);
    await expect(turnOnDesktopAlerts()).resolves.toBe("unsupported");
  });
});

describe("who is alerted", () => {
  it("alerts suppliers for jobs and order changes only", () => {
    expect(desktopAlertWanted("supplier", row("a", { type: "shop_job_assigned" }))).toBe(
      true,
    );
    expect(
      desktopAlertWanted("supplier", row("b", { type: "shop_payout_released" })),
    ).toBe(true);
    expect(
      desktopAlertWanted(
        "supplier",
        row("c", { type: "supplier_service_decision", orderId: null }),
      ),
    ).toBe(false);
    expect(
      desktopAlertWanted(
        "supplier",
        row("d", { type: "announcement", orderId: null, announcementId: "ann_1" }),
      ),
    ).toBe(false);
  });

  it("alerts Operations and Super Admin for every inbox row", () => {
    const signup = row("e", { type: "ops_signup_submitted", orderId: null });
    expect(desktopAlertWanted("ops_admin", signup)).toBe(true);
    expect(desktopAlertWanted("super_admin", signup)).toBe(true);
    expect(desktopAlertWanted("client", signup)).toBe(false);
  });
});

describe("the desktop announcer", () => {
  function setup(
    options: {
      status?: DesktopAlertStatus;
      away?: boolean;
      role?: "supplier" | "ops_admin" | "super_admin";
    } = {},
  ) {
    const shown: DesktopAlert[] = [];
    let clock = 1_000;
    const announcer = createDesktopAnnouncer({
      role: options.role ?? "ops_admin",
      surface: {
        show: async (alert) => {
          shown.push(alert);
        },
      },
      readStatus: () => options.status ?? "on",
      isAway: () => options.away ?? true,
      now: () => clock,
    });
    return {
      announcer,
      shown,
      advance: (ms: number) => {
        clock += ms;
      },
    };
  }

  it("raises an alert tagged by the row with the inbox deep link when the person is away", () => {
    const { announcer, shown } = setup();
    expect(announcer.announce(row("n1"))).toBe(true);
    expect(shown).toEqual([
      {
        tag: "gridgo-desk:n1",
        title: "Title n1",
        body: "Body n1",
        href: "/ops/orders/ord_n1",
        notificationId: "n1",
        tree: "/ops/",
      },
    ]);
    expect(announcer.rowFor("n1")?.id).toBe("n1");
  });

  it("keeps Super Admin inside its own tree", () => {
    const { announcer, shown } = setup({ role: "super_admin" });
    announcer.announce(row("n1"));
    expect(shown[0]).toMatchObject({ href: "/admin/orders/ord_n1", tree: "/admin/" });
  });

  it("leaves the slip to the toast while the person is looking at the tab", () => {
    const { announcer, shown } = setup({ away: false });
    expect(announcer.announce(row("n1"))).toBe(false);
    expect(shown).toEqual([]);
  });

  it.each(["off", "ask", "blocked", "unsupported"] as const)(
    "stays quiet and hands the slip to the toast while %s",
    (status) => {
      const { announcer, shown } = setup({ status });
      expect(announcer.announce(row("n1"))).toBe(false);
      expect(shown).toEqual([]);
    },
  );

  it("hands a supplier's non-job row back to the toast", () => {
    const { announcer, shown } = setup({ role: "supplier" });
    expect(
      announcer.announce(row("s1", { type: "supplier_service_decision", orderId: null })),
    ).toBe(false);
    expect(announcer.announce(row("s2", { type: "shop_job_assigned" }))).toBe(true);
    expect(shown.map((alert) => alert.href)).toEqual(["/supplier/jobs/ord_s2"]);
  });

  it("folds a burst into the open alert's tag, and starts fresh after the window", () => {
    const { announcer, shown, advance } = setup();
    announcer.announce(row("a"));
    advance(200);
    announcer.announce(row("b"));
    announcer.announce(row("c"));
    expect(shown.map((alert) => [alert.tag, alert.title])).toEqual([
      ["gridgo-desk:a", "Title a"],
      ["gridgo-desk:a", "2 new updates on the desk"],
      ["gridgo-desk:a", "3 new updates on the desk"],
    ]);
    expect(shown[2]).toMatchObject({ href: null, notificationId: null });
    advance(5_000);
    announcer.announce(row("d"));
    expect(shown[3]).toMatchObject({ tag: "gridgo-desk:d", title: "Title d" });
  });
});

describe("click messages", () => {
  it("accepts only the worker's click message with a same-origin path", () => {
    expect(
      readDesktopAlertClick({
        type: DESKTOP_ALERT_CLICK_MESSAGE,
        notificationId: "n1",
        href: "/ops/orders/ord_1",
      }),
    ).toEqual({ notificationId: "n1", href: "/ops/orders/ord_1" });
    expect(readDesktopAlertClick({ type: "other", href: "/ops" })).toBeNull();
    expect(readDesktopAlertClick(null)).toBeNull();
    expect(
      readDesktopAlertClick({ type: DESKTOP_ALERT_CLICK_MESSAGE, href: "//evil.test/x" }),
    ).toEqual({ notificationId: null, href: null });
  });

  it("drops absolute and protocol-relative destinations", () => {
    expect(safePortalPath("/supplier/jobs/ord_1")).toBe("/supplier/jobs/ord_1");
    expect(safePortalPath("https://evil.test")).toBeNull();
    expect(safePortalPath("//evil.test")).toBeNull();
    expect(safePortalPath("/\\evil.test")).toBeNull();
    expect(safePortalPath(42)).toBeNull();
  });
});

describe("the browser surface without a service worker", () => {
  const alert: DesktopAlert = {
    tag: "gridgo-desk:n1",
    title: "Payment submitted",
    body: "Confirm the transfer",
    href: "/ops/orders/ord_1",
    notificationId: "n1",
    tree: "/ops/",
  };

  it("raises a page notification that focuses the tab and opens the row on click", async () => {
    const api = installNotification("granted");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const focus = vi.spyOn(window, "focus").mockImplementation(() => undefined);
    const onClick = vi.fn();
    await createBrowserDesktopAlertSurface({ onClick }).show(alert);
    expect(api.created).toHaveLength(1);
    expect(api.created[0].title).toBe("Payment submitted");
    expect(api.created[0].options).toMatchObject({ tag: "gridgo-desk:n1", silent: true });
    api.created[0].onclick?.();
    expect(focus).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledWith({
      href: "/ops/orders/ord_1",
      notificationId: "n1",
    });
  });

  it("stays quiet if the page regained focus, unless forced", async () => {
    const api = installNotification("granted");
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const surface = createBrowserDesktopAlertSurface({ onClick: vi.fn() });
    await surface.show(alert);
    expect(api.created).toHaveLength(0);
    await surface.show({ ...alert, force: true });
    expect(api.created).toHaveLength(1);
  });

  it("degrades silently where the constructor throws", async () => {
    vi.stubGlobal(
      "Notification",
      Object.assign(
        function Broken() {
          throw new TypeError("Illegal constructor");
        },
        { permission: "granted" },
      ),
    );
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    await expect(
      createBrowserDesktopAlertSurface({ onClick: vi.fn() }).show(alert),
    ).resolves.toBeUndefined();
  });

  it("does nothing once permission was revoked", async () => {
    const api = installNotification("denied");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    await createBrowserDesktopAlertSurface({ onClick: vi.fn() }).show(alert);
    expect(api.created).toHaveLength(0);
  });
});
