// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    getWebPushPublicKey: vi.fn(async () => {
      calls.push("key");
      return "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
    }),
    subscribeWebPush: vi.fn(async () => {
      calls.push("save");
    }),
    unsubscribeWebPush: vi.fn(async () => {
      calls.push("forget");
    }),
  };
});

const lockApi = vi.hoisted(() => ({ lockWorkingDevice: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/shop-team", () => lockApi);

const registration = {
  pushManager: {
    getSubscription: vi.fn(async (): Promise<PushSubscription | null> => null),
    subscribe: vi.fn(async () => {
      calls.push("subscribe");
      return fakeSubscription();
    }),
  },
  showNotification: vi.fn(async () => undefined),
};

vi.mock("@/lib/live/desktopAlerts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/live/desktopAlerts")>();
  return { ...actual, ensureDesktopAlertWorker: vi.fn(async () => registration) };
});

import { enterSharedPc } from "@/components/shop-device/enterSharedPc";
import { ApiError, subscribeWebPush, unsubscribeWebPush } from "@/lib/api/client";
import { ensureDesktopAlertWorker } from "@/lib/live/desktopAlerts";
import { resetShopDevice, shopDeviceSnapshot } from "@/lib/shop-device";
import { resetDeviceLock } from "@/lib/shop-device-lock";
import type { DeviceKind } from "@/lib/pwa/install";

import {
  applicationServerKey,
  pushSupport,
  isPersonalPushReleased,
  releaseWebPushForSharedPc,
  releaseWebPushOnLockedPc,
  releaseWebPushForSignOut,
  resetWebPushForTests,
  resumePersonalPush,
  SharedPcCleanupError,
  WEB_PUSH_PENDING_REMOVAL_KEY,
  syncWebPush,
  turnOffWebPush,
  turnOnWebPush,
  webPushErrorCopy,
  webPushStatusFor,
  WEB_PUSH_OWNER_KEY,
  type PushFeatures,
} from "../webPush";

const unsubscribe = vi.fn(async () => true);

function fakeSubscription(): PushSubscription {
  return {
    endpoint: "https://push.example/abc",
    options: { applicationServerKey: null, userVisibleOnly: true },
    unsubscribe,
    toJSON: () => ({
      endpoint: "https://push.example/abc",
      expirationTime: null,
      keys: { p256dh: "p", auth: "a" },
    }),
  } as unknown as PushSubscription;
}

function installNotification(
  start: NotificationPermission,
  answer: NotificationPermission,
) {
  // The browser's Notification is a constructor with static members.
  const api = Object.assign(function Notification() {}, {
    permission: start,
    requestPermission: vi.fn(async () => {
      calls.push("ask");
      api.permission = answer;
      return answer;
    }),
  });
  vi.stubGlobal("Notification", api);
  return api;
}

beforeEach(() => {
  calls.length = 0;
  window.localStorage.clear();
  resetWebPushForTests();
  vi.clearAllMocks();
  registration.pushManager.getSubscription.mockResolvedValue(null);
  Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
  vi.stubGlobal("PushManager", function PushManager() {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const features: PushFeatures = {
  secure: true,
  serviceWorker: true,
  pushManager: true,
  notification: true,
};
const iphone = (
  standalone: boolean,
  version: [number, number] = [18, 5],
): DeviceKind => ({
  ios: true,
  iosSafari: true,
  iosVersion: version,
  android: false,
  standalone,
});
const android: DeviceKind = {
  ios: false,
  iosSafari: false,
  iosVersion: null,
  android: true,
  standalone: false,
};

describe("where phone notifications can work", () => {
  it("needs the Home Screen app on iPhone, and iOS 16.4", () => {
    expect(pushSupport(iphone(false), { ...features, pushManager: false })).toBe(
      "needs-install",
    );
    expect(pushSupport(iphone(true), features)).toBe("supported");
    expect(pushSupport(iphone(true, [16, 3]), features)).toBe("ios-too-old");
    expect(pushSupport(iphone(false, [15, 8]), features)).toBe("ios-too-old");
  });

  it("works in an Android browser tab without installing", () => {
    expect(pushSupport(android, features)).toBe("supported");
    expect(pushSupport(android, { ...features, pushManager: false })).toBe("unsupported");
  });

  it("reads permission and subscription into one status", () => {
    expect(webPushStatusFor("supported", "default", false)).toBe("ask");
    expect(webPushStatusFor("supported", "denied", false)).toBe("blocked");
    expect(webPushStatusFor("supported", "granted", false)).toBe("off");
    expect(webPushStatusFor("supported", "granted", true)).toBe("on");
    expect(webPushStatusFor("needs-install", "granted", true)).toBe("needs-install");
  });
});

it("turns the base64url VAPID key into the raw 65-byte point", () => {
  const key = applicationServerKey(
    "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
  );
  expect(key).toHaveLength(65);
  expect(key[0]).toBe(4);
});

describe("Turn on notifications", () => {
  it("asks for permission before anything waits on the network, then subscribes and saves", async () => {
    installNotification("default", "granted");
    const outcome = await turnOnWebPush(null, "shop_1");
    expect(outcome).toEqual({ status: "on" });
    expect(calls).toEqual(["ask", "key", "subscribe", "save"]);
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(subscribeWebPush).toHaveBeenCalledWith({
      endpoint: "https://push.example/abc",
      expirationTime: null,
      keys: { p256dh: "p", auth: "a" },
    });
    expect(registration.showNotification).toHaveBeenCalledWith(
      "Notifications are on",
      expect.objectContaining({ tag: "gridgo-push-on" }),
    );
  });

  it("uses a key read ahead of the tap", async () => {
    installNotification("default", "granted");
    await turnOnWebPush(
      "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
      "shop_1",
    );
    expect(calls).toEqual(["ask", "subscribe", "save"]);
  });

  it("stops at a refusal, without subscribing", async () => {
    installNotification("default", "denied");
    expect(await turnOnWebPush(null, "shop_1")).toEqual({ status: "blocked" });
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("explains a server with no push keys yet in plain words", async () => {
    installNotification("granted", "granted");
    vi.mocked(subscribeWebPush).mockRejectedValueOnce(
      new ApiError(503, { error: "web_push_unavailable", message: "VAPID keys missing" }),
    );
    const outcome = await turnOnWebPush(
      "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
      "shop_1",
    );
    expect(outcome).toMatchObject({
      reason: "GRIDGO can't send phone notifications yet. Try again later.",
    });
    expect(webPushErrorCopy(new Error("x"))).toMatch(/Check your connection/);
  });
});

describe("keeping the API copy right", () => {
  it("re-sends a subscription the browser already holds, once per load, never asking", async () => {
    const api = installNotification("granted", "granted");
    window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "shop_1");
    registration.pushManager.getSubscription.mockResolvedValue(fakeSubscription());
    await syncWebPush("shop_1");
    await syncWebPush("shop_1");
    expect(subscribeWebPush).toHaveBeenCalledTimes(1);
    expect(api.requestPermission).not.toHaveBeenCalled();
  });

  it("turning off forgets this phone in the browser and the API", async () => {
    installNotification("granted", "granted");
    registration.pushManager.getSubscription.mockResolvedValueOnce(fakeSubscription());
    await turnOffWebPush();
    expect(unsubscribe).toHaveBeenCalled();
    expect(unsubscribeWebPush).toHaveBeenCalledWith("https://push.example/abc");
  });

  it("signing out stops the shop's pushes to this phone", async () => {
    installNotification("granted", "granted");
    registration.pushManager.getSubscription.mockResolvedValueOnce(fakeSubscription());
    await releaseWebPushForSignOut();
    expect(unsubscribeWebPush).toHaveBeenCalledWith(
      "https://push.example/abc",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("still drops the subscription in the browser when it answers after the sign-out limit", async () => {
    installNotification("granted", "granted");
    let answer: (value: PushSubscription) => void = () => undefined;
    registration.pushManager.getSubscription.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    await releaseWebPushForSignOut(10);
    expect(unsubscribe).not.toHaveBeenCalled();
    answer(fakeSubscription());
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalled());
  });

  it("never hands one shop's subscription to the next account on this browser", async () => {
    installNotification("granted", "granted");
    window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "shop_1");
    registration.pushManager.getSubscription.mockResolvedValue(fakeSubscription());
    await syncWebPush("shop_2");
    expect(subscribeWebPush).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalled();
    expect(window.localStorage.getItem(WEB_PUSH_OWNER_KEY)).toBeNull();
  });

  it("drops the subscription in the browser before telling the API at sign-out", async () => {
    installNotification("granted", "granted");
    const order: string[] = [];
    unsubscribe.mockImplementationOnce(async () => {
      order.push("browser");
      return true;
    });
    vi.mocked(unsubscribeWebPush).mockImplementationOnce(async () => {
      order.push("api");
    });
    registration.pushManager.getSubscription.mockResolvedValueOnce(fakeSubscription());
    await releaseWebPushForSignOut();
    expect(order).toEqual(["browser", "api"]);
  });

  it("drops a subscription whose owner it cannot tell, instead of adopting it", async () => {
    installNotification("granted", "granted");
    registration.pushManager.getSubscription.mockResolvedValue(fakeSubscription());
    await syncWebPush("shop_1");
    expect(subscribeWebPush).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("turning on for a different account ends the old subscription first", async () => {
    installNotification("granted", "granted");
    window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "shop_1");
    registration.pushManager.getSubscription.mockResolvedValueOnce(fakeSubscription());
    await turnOnWebPush(
      "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
      "shop_2",
    );
    expect(unsubscribe).toHaveBeenCalled();
    expect(unsubscribeWebPush).toHaveBeenCalledWith("https://push.example/abc");
    expect(registration.pushManager.subscribe).toHaveBeenCalled();
    expect(window.localStorage.getItem(WEB_PUSH_OWNER_KEY)).toBe("shop_2");
  });

  it("keeps the owner record until a slow browser has really dropped it", async () => {
    installNotification("granted", "granted");
    window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "shop_1");
    let answer: (value: PushSubscription) => void = () => undefined;
    registration.pushManager.getSubscription.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    await releaseWebPushForSignOut(10);
    expect(window.localStorage.getItem(WEB_PUSH_OWNER_KEY)).toBe("shop_1");
    answer(fakeSubscription());
    await vi.waitFor(() =>
      expect(window.localStorage.getItem(WEB_PUSH_OWNER_KEY)).toBeNull(),
    );
  });
});


describe("handing this browser over to a shared shop PC", () => {
  /** The site's registrations as the browser lists them: the push one, with what it shows. */
  function registered(getRegistrations?: () => Promise<unknown[]>) {
    const close = vi.fn();
    const withShown = Object.assign(registration, {
      getNotifications: vi.fn(async () => [{ close }, { close }]),
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations: vi.fn(getRegistrations ?? (async () => [withShown])) },
    });
    return close;
  }

  beforeEach(() => {
    registered();
    resetShopDevice();
    resetDeviceLock();
    lockApi.lockWorkingDevice.mockClear();
  });

  it("closes shown notifications and removes the subscription here and at GRIDGO", async () => {
    installNotification("granted", "granted");
    const close = registered();
    window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "user_owner");
    registration.pushManager.getSubscription.mockResolvedValue(fakeSubscription());
    await releaseWebPushForSharedPc();
    expect(close).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalled();
    expect(unsubscribeWebPush).toHaveBeenCalledWith("https://push.example/abc", expect.anything());
    expect(window.localStorage.getItem(WEB_PUSH_OWNER_KEY)).toBeNull();
    expect(window.localStorage.getItem(WEB_PUSH_PENDING_REMOVAL_KEY)).toBeNull();
  });

  it("stops when the browser will not drop the subscription, and keeps the owner record", async () => {
    installNotification("granted", "granted");
    window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "user_owner");
    registration.pushManager.getSubscription.mockResolvedValue(fakeSubscription());
    unsubscribe.mockResolvedValueOnce(false);
    await expect(releaseWebPushForSharedPc()).rejects.toBeInstanceOf(SharedPcCleanupError);
    unsubscribe.mockRejectedValueOnce(new Error("busy"));
    await expect(releaseWebPushForSharedPc()).rejects.toMatchObject({ step: "browser" });
    expect(unsubscribeWebPush).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(WEB_PUSH_OWNER_KEY)).toBe("user_owner");
  });

  it("stops when the browser never says whether it holds one", async () => {
    installNotification("granted", "granted");
    registration.pushManager.getSubscription.mockReturnValueOnce(new Promise(() => undefined));
    await expect(releaseWebPushForSharedPc(10)).rejects.toMatchObject({ step: "browser" });
  });

  it("keeps GRIDGO's copy to remove on the retry when that call fails", async () => {
    installNotification("granted", "granted");
    window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "user_owner");
    registration.pushManager.getSubscription.mockResolvedValueOnce(fakeSubscription());
    vi.mocked(unsubscribeWebPush).mockRejectedValueOnce(new ApiError(503, { error: "server_error" }));
    await expect(releaseWebPushForSharedPc()).rejects.toMatchObject({ step: "gridgo" });
    expect(window.localStorage.getItem(WEB_PUSH_PENDING_REMOVAL_KEY)).toBe("https://push.example/abc");
    expect(window.localStorage.getItem(WEB_PUSH_OWNER_KEY)).toBe("user_owner");
    // The retry: the browser holds nothing now, GRIDGO's copy still goes.
    registration.pushManager.getSubscription.mockResolvedValueOnce(null);
    await releaseWebPushForSharedPc();
    expect(unsubscribeWebPush).toHaveBeenLastCalledWith("https://push.example/abc", expect.anything());
    expect(window.localStorage.getItem(WEB_PUSH_PENDING_REMOVAL_KEY)).toBeNull();
    expect(window.localStorage.getItem(WEB_PUSH_OWNER_KEY)).toBeNull();
  });

  it("waits for a registration on its way, then registers nothing new until resumed", async () => {
    installNotification("granted", "granted");
    window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "user_owner");
    let found: (value: PushSubscription | null) => void = () => undefined;
    registration.pushManager.getSubscription.mockReturnValueOnce(
      new Promise((resolve) => {
        found = resolve;
      }),
    );
    const syncing = syncWebPush("user_owner");
    registration.pushManager.getSubscription.mockResolvedValue(fakeSubscription());
    const handover = releaseWebPushForSharedPc();
    found(fakeSubscription());
    await syncing;
    await handover;
    // The sync's save ran before the browser and GRIDGO copies were removed.
    expect(calls.indexOf("save")).toBeLessThan(calls.indexOf("forget"));
    vi.mocked(subscribeWebPush).mockClear();
    await syncWebPush("user_other");
    expect(subscribeWebPush).not.toHaveBeenCalled();
    registration.pushManager.subscribe.mockClear();
    await turnOnWebPush("key", "user_owner");
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(subscribeWebPush).not.toHaveBeenCalled();
    resumePersonalPush();
  });

  it("finds the subscription even when the alert worker lookup answers nothing", async () => {
    installNotification("granted", "granted");
    window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "user_owner");
    registration.pushManager.getSubscription.mockResolvedValue(fakeSubscription());
    vi.mocked(ensureDesktopAlertWorker).mockResolvedValue(null);
    await enterSharedPc();
    expect(unsubscribe).toHaveBeenCalled();
    expect(unsubscribeWebPush).toHaveBeenCalledWith("https://push.example/abc", expect.anything());
    expect(shopDeviceSnapshot().shared).toBe(true);
    expect(isPersonalPushReleased()).toBe(true);
    vi.mocked(ensureDesktopAlertWorker).mockResolvedValue(registration as never);
  });

  it("does not share the PC when the registration lookup fails", async () => {
    installNotification("granted", "granted");
    window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "user_owner");
    registered(() => Promise.reject(new Error("registration failed")));
    await expect(enterSharedPc()).rejects.toBeInstanceOf(SharedPcCleanupError);
    expect(shopDeviceSnapshot()).toMatchObject({ shared: false, preparing: false });
    expect(lockApi.lockWorkingDevice).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(WEB_PUSH_OWNER_KEY)).toBe("user_owner");
    expect(isPersonalPushReleased()).toBe(false);
  });

  it("does not share the PC when the registration lookup never answers", async () => {
    vi.useFakeTimers();
    try {
      installNotification("granted", "granted");
      window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "user_owner");
      registered(() => new Promise<unknown[]>(() => undefined));
      const sharing = enterSharedPc();
      const outcome = expect(sharing).rejects.toMatchObject({ step: "browser" });
      await vi.advanceTimersByTimeAsync(10_001);
      await outcome;
      expect(shopDeviceSnapshot()).toMatchObject({ shared: false, preparing: false });
      expect(lockApi.lockWorkingDevice).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(WEB_PUSH_OWNER_KEY)).toBe("user_owner");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not share the PC when the browser cannot list its registrations at all", async () => {
    installNotification("granted", "granted");
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
    await expect(enterSharedPc()).rejects.toMatchObject({ step: "browser" });
    expect(shopDeviceSnapshot().shared).toBe(false);
    expect(lockApi.lockWorkingDevice).not.toHaveBeenCalled();
  });

  it("on a PC GRIDGO already locked, drops the browser's copy without calling GRIDGO", async () => {
    installNotification("granted", "granted");
    window.localStorage.setItem(WEB_PUSH_OWNER_KEY, "user_owner");
    registration.pushManager.getSubscription.mockResolvedValue(fakeSubscription());
    await releaseWebPushOnLockedPc();
    expect(unsubscribe).toHaveBeenCalled();
    expect(unsubscribeWebPush).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(WEB_PUSH_PENDING_REMOVAL_KEY)).toBe("https://push.example/abc");
    expect(isPersonalPushReleased()).toBe(true);
  });

  it("on a locked PC, still refuses when the browser keeps the subscription", async () => {
    installNotification("granted", "granted");
    registration.pushManager.getSubscription.mockResolvedValue(fakeSubscription());
    unsubscribe.mockResolvedValueOnce(false);
    await expect(releaseWebPushOnLockedPc()).rejects.toMatchObject({ step: "browser" });
    expect(isPersonalPushReleased()).toBe(false);
  });
});
