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

import { ApiError, subscribeWebPush, unsubscribeWebPush } from "@/lib/api/client";
import type { DeviceKind } from "@/lib/pwa/install";

import {
  applicationServerKey,
  pushSupport,
  releaseWebPushForSignOut,
  resetWebPushForTests,
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
});
