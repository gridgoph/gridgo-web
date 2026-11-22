// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enterSharedPc } from "@/components/shop-device/enterSharedPc";
import { ShopDeviceGate } from "@/components/shop-device/ShopDeviceGate";
import { LOCK_PENDING_COPY } from "@/components/shop-device/WhosWorking";
import { PUSH_NOT_RELEASED_COPY } from "@/components/shop-device/ShopDeviceGate";
import { endWorkerTurn, useTurnWatch } from "@/components/shop-device/WorkerBar";
import { resetDeviceLock } from "@/lib/shop-device-lock";
import { ApiError } from "@/lib/api/client";
import {
  IDLE_LOCK_MS,
  lockShopDevice,
  resetShopDevice,
  shopDeviceSnapshot,
  startWorkerTurn,
  workerTokenHeader,
} from "@/lib/shop-device";

const api = vi.hoisted(() => ({
  getWorkingList: vi.fn(),
  selectWorker: vi.fn(),
  lockWorkingDevice: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  current: {
    status: "mapped" as string,
    accessError: null as string | null,
    refresh: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  },
}));

vi.stubGlobal("React", React);
const push = vi.hoisted(() => ({
  released: true,
  releaseWebPushForSharedPc: vi.fn(async () => undefined),
  releaseWebPushOnLockedPc: vi.fn(async (): Promise<void> => undefined),
  resumePersonalPush: vi.fn(),
  isPersonalPushReleased: vi.fn((): boolean => true),
}));
vi.mock("@/lib/api/shop-team", () => api);
vi.mock("@/lib/pwa/webPush", () => push);
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => auth.current }));

const ana = { id: "shp_ana", shopId: "shop_1", kind: "pin", name: "Ana", role: "staff", status: "active", jobAlerts: true, photoFileId: null };
const lito = { ...ana, id: "shp_lito", name: "Lito" };
const owner = { userId: "user_owner", name: "Olive Owner", role: "owner", status: "active", kind: "account" };

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
}

beforeEach(() => {
  resetShopDevice();
  resetDeviceLock();
  push.released = true;
  push.isPersonalPushReleased.mockImplementation(() => push.released);
  push.releaseWebPushOnLockedPc.mockImplementation(async () => {
    push.released = true;
  });
  setVisibility("visible");
  auth.current = { ...auth.current, status: "mapped", accessError: null };
  api.getWorkingList.mockResolvedValue({ members: [owner, ana, lito], worker: null });
  api.lockWorkingDevice.mockResolvedValue(undefined);
  api.selectWorker.mockImplementation(async (id: string, pin: string) => {
    if (pin !== "0420") throw new ApiError(403, { error: "shop_pin_invalid" });
    return { worker: { ...ana, id }, token: "turn-token", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
  });
});

afterEach(() => {
  cleanup();
  resetShopDevice();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("Who's working?", () => {
  it("covers the shop's screens while the PC is locked", async () => {
    lockShopDevice("idle");
    render(
      <ShopDeviceGate>
        <p>Owner screens</p>
      </ShopDeviceGate>,
    );
    expect(screen.queryByText("Owner screens")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Who’s working?" })).toBeVisible();
    expect(screen.getByText("Locked after 15 minutes without use.")).toBeVisible();
    // PIN people only: account holders use their own login.
    const faces = await screen.findAllByTestId("worker-face");
    expect(faces.map((face) => face.textContent)).toEqual(["AAnaStaff", "LLitoStaff"]);
    expect(screen.getByText(/Olive Owner: use your own login/)).toBeVisible();
  });

  it("shows the picker after a reload of a locked PC (the API says so)", () => {
    auth.current = { ...auth.current, status: "unavailable", accessError: "shop_worker_locked" };
    render(
      <ShopDeviceGate>
        <p>Owner screens</p>
      </ShopDeviceGate>,
    );
    expect(screen.getByTestId("whos-working")).toBeVisible();
    expect(screen.queryByText("Owner screens")).not.toBeInTheDocument();
  });

  it("leaves an ordinary signed-in shop alone", () => {
    render(
      <ShopDeviceGate>
        <p>Owner screens</p>
      </ShopDeviceGate>,
    );
    expect(screen.getByText("Owner screens")).toBeVisible();
  });

  it("picks a face, takes the PIN from the keyboard and starts that person's turn", async () => {
    lockShopDevice(null);
    render(
      <ShopDeviceGate>
        <p>Work screens</p>
      </ShopDeviceGate>,
    );
    await userEvent.click((await screen.findAllByTestId("worker-face"))[0]);
    const pin = screen.getByLabelText("Ana, type your PIN");
    expect(pin).toHaveFocus();
    await userEvent.keyboard("0420");
    await waitFor(() => expect(api.selectWorker).toHaveBeenCalledWith("shp_ana", "0420"));
    expect(workerTokenHeader()).toBe("turn-token");
    expect(auth.current.refresh).toHaveBeenCalled();
    expect(await screen.findByText("Work screens")).toBeVisible();
  });

  it("clears a wrong PIN and says so", async () => {
    lockShopDevice(null);
    render(<ShopDeviceGate>{null}</ShopDeviceGate>);
    await userEvent.click((await screen.findAllByTestId("worker-face"))[1]);
    await userEvent.keyboard("1111");
    expect(await screen.findByRole("alert")).toHaveTextContent("That PIN is not right. Try again.");
    expect(screen.getByLabelText("Lito, type your PIN")).toHaveValue("");
    expect(workerTokenHeader()).toBeNull();
    // Focus stays in the field, so the right PIN goes straight in.
    expect(screen.getByLabelText("Lito, type your PIN")).toHaveFocus();
    await userEvent.keyboard("0420");
    await waitFor(() => expect(api.selectWorker).toHaveBeenLastCalledWith("shp_lito", "0420"));
    expect(workerTokenHeader()).toBe("turn-token");
  });

  it("says to wait after too many wrong PINs", async () => {
    api.selectWorker.mockRejectedValue(new ApiError(429, { error: "shop_pin_rate_limited" }));
    lockShopDevice(null);
    render(<ShopDeviceGate>{null}</ShopDeviceGate>);
    await userEvent.click((await screen.findAllByTestId("worker-face"))[0]);
    await userEvent.keyboard("1234");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Wait 15 minutes/);
  });

  it("explains an empty picker instead of a dead end", async () => {
    api.getWorkingList.mockResolvedValue({ members: [owner], worker: null });
    lockShopDevice(null);
    render(<ShopDeviceGate>{null}</ShopDeviceGate>);
    expect(await screen.findByText(/Nobody has a PIN yet/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out of this PC" })).toBeVisible();
  });
});

describe("idle lock", () => {
  it("locks back to the picker after 15 minutes without use", async () => {
    vi.useFakeTimers();
    startWorkerTurn({ worker: ana as never, token: "turn-token", expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() });
    renderHook(() => useTurnWatch(true));
    await act(async () => {
      vi.advanceTimersByTime(IDLE_LOCK_MS - 30_000);
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    await act(async () => {
      vi.advanceTimersByTime(IDLE_LOCK_MS - 30_000);
    });
    // Someone typed, so the clock started again.
    expect(shopDeviceSnapshot().worker).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(api.lockWorkingDevice).toHaveBeenCalledTimes(1);
    expect(shopDeviceSnapshot()).toMatchObject({ worker: null, lockReason: "idle" });
    expect(workerTokenHeader()).toBeNull();
  });

  it("ends the turn when GRIDGO's 30 minutes run out, even while in use", async () => {
    vi.useFakeTimers();
    startWorkerTurn({ worker: ana as never, token: "turn-token", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    renderHook(() => useTurnWatch(true));
    await act(async () => {
      vi.advanceTimersByTime(75_000);
    });
    expect(shopDeviceSnapshot()).toMatchObject({ worker: null, lockReason: "expired" });
  });
});

describe("handing over between two people", () => {
  it("sends the next PIN only after the last person's lock has landed", async () => {
    startWorkerTurn({ worker: ana as never, token: "token-ana", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() });
    let landed: () => void = () => undefined;
    api.lockWorkingDevice.mockReturnValueOnce(new Promise<void>((resolve) => (landed = resolve)));
    void endWorkerTurn("switch");
    render(<ShopDeviceGate>{null}</ShopDeviceGate>);
    // The picker shows at once; nothing of Ana's turn is left.
    expect(workerTokenHeader()).toBeNull();
    await userEvent.click((await screen.findAllByTestId("worker-face"))[1]);
    await userEvent.keyboard("0420");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.selectWorker).not.toHaveBeenCalled();
    landed();
    await waitFor(() => expect(api.selectWorker).toHaveBeenCalledWith("shp_lito", "0420"));
    expect(workerTokenHeader()).toBe("turn-token");
  });

  it("sends a lost lock again before the pick, and holds the pick while it still fails", async () => {
    startWorkerTurn({ worker: ana as never, token: "token-ana", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() });
    api.lockWorkingDevice.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"));
    await endWorkerTurn("switch");
    render(<ShopDeviceGate>{null}</ShopDeviceGate>);
    await userEvent.click((await screen.findAllByTestId("worker-face"))[0]);
    await userEvent.keyboard("0420");
    expect(await screen.findByRole("alert")).toHaveTextContent(LOCK_PENDING_COPY);
    expect(api.selectWorker).not.toHaveBeenCalled();
    // The connection is back: the lock goes again first, then the pick.
    await userEvent.keyboard("0420");
    await waitFor(() => expect(api.selectWorker).toHaveBeenCalledTimes(1));
    expect(api.lockWorkingDevice).toHaveBeenCalledTimes(3);
    const lockOrder = api.lockWorkingDevice.mock.invocationCallOrder[2];
    expect(lockOrder).toBeLessThan(api.selectWorker.mock.invocationCallOrder[0]);
  });

  it("ends a turn whose PIN was accepted while the window was hidden", async () => {
    lockShopDevice(null);
    render(<ShopDeviceGate>{null}</ShopDeviceGate>);
    await userEvent.click((await screen.findAllByTestId("worker-face"))[0]);
    let accept: (value: unknown) => void = () => undefined;
    api.selectWorker.mockReturnValueOnce(new Promise((resolve) => (accept = resolve)));
    await userEvent.keyboard("0420");
    setVisibility("hidden");
    accept({ worker: ana, token: "turn-token", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() });
    await waitFor(() => expect(shopDeviceSnapshot().lockReason).toBe("away"));
    expect(workerTokenHeader()).toBeNull();
    expect(api.lockWorkingDevice).toHaveBeenCalled();
    expect(auth.current.refresh).not.toHaveBeenCalled();
  });
});

describe("leaving the window", () => {
  it("locks at once when the window is hidden or minimised", async () => {
    startWorkerTurn({ worker: ana as never, token: "turn-token", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() });
    renderHook(() => useTurnWatch(true));
    setVisibility("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(shopDeviceSnapshot()).toMatchObject({ worker: null, lockReason: "away" });
    expect(workerTokenHeader()).toBeNull();
    expect(api.lockWorkingDevice).toHaveBeenCalledTimes(1);
  });

  it("does not let a touch after a long sleep revive the old turn", async () => {
    let clock = Date.parse("2026-11-22T08:00:00Z");
    const now = () => clock;
    startWorkerTurn({ worker: ana as never, token: "turn-token", expiresAt: new Date(clock + 60 * 60_000).toISOString() });
    renderHook(() => useTurnWatch(true, now));
    // The computer slept: no timer ran, then someone moves the mouse.
    clock += IDLE_LOCK_MS + 1000;
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove"));
    });
    expect(shopDeviceSnapshot()).toMatchObject({ worker: null, lockReason: "idle" });
  });
});

describe("Share this PC", () => {
  it("keeps this the account's PC, with a retry, when the push cleanup fails", async () => {
    push.releaseWebPushForSharedPc.mockRejectedValueOnce(new Error("browser"));
    await expect(enterSharedPc()).rejects.toThrow();
    expect(shopDeviceSnapshot()).toMatchObject({ shared: false, preparing: false });
    expect(api.lockWorkingDevice).not.toHaveBeenCalled();
    expect(push.resumePersonalPush).toHaveBeenCalled();
    // Pressing it again goes through.
    await enterSharedPc();
    expect(shopDeviceSnapshot()).toMatchObject({ shared: true, worker: null });
    expect(api.lockWorkingDevice).toHaveBeenCalledTimes(1);
  });

  it("closes the account's delivery before the cleanup starts", async () => {
    let seenPreparing: boolean | null = null;
    push.releaseWebPushForSharedPc.mockImplementationOnce(async () => {
      seenPreparing = shopDeviceSnapshot().preparing;
    });
    await enterSharedPc();
    expect(seenPreparing).toBe(true);
  });

  it("does not open the picker when the lock fails", async () => {
    api.lockWorkingDevice.mockRejectedValueOnce(new Error("offline"));
    await expect(enterSharedPc()).rejects.toThrow();
    expect(shopDeviceSnapshot().shared).toBe(false);
  });
});

describe("every way to the picker waits for the account's alerts to be gone", () => {
  it("after a reload of a locked PC: no faces, no PIN, until the browser has dropped them", async () => {
    push.released = false;
    let dropped: () => void = () => undefined;
    push.releaseWebPushOnLockedPc.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          dropped = () => {
            push.released = true;
            resolve();
          };
        }),
    );
    auth.current = { ...auth.current, status: "unavailable", accessError: "shop_worker_locked" };
    render(<ShopDeviceGate>{null}</ShopDeviceGate>);
    expect(screen.getByText("Getting this shop PC ready…")).toBeInTheDocument();
    expect(screen.queryByTestId("whos-working")).not.toBeInTheDocument();
    expect(screen.queryByTestId("worker-face")).not.toBeInTheDocument();
    dropped();
    expect(await screen.findByTestId("whos-working")).toBeVisible();
  });

  it("shows why and offers a retry when the browser will not drop them", async () => {
    push.released = false;
    push.releaseWebPushOnLockedPc.mockRejectedValueOnce(new Error("browser"));
    auth.current = { ...auth.current, status: "unavailable", accessError: "shop_worker_locked" };
    render(<ShopDeviceGate>{null}</ShopDeviceGate>);
    expect(await screen.findByRole("alert")).toHaveTextContent(PUSH_NOT_RELEASED_COPY);
    expect(screen.queryByTestId("whos-working")).not.toBeInTheDocument();
    expect(api.selectWorker).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("whos-working")).toBeVisible();
    expect(push.releaseWebPushOnLockedPc).toHaveBeenCalledTimes(2);
  });

  it("after a refusal reaches a tab that never shared: the same check first", async () => {
    push.released = false;
    push.releaseWebPushOnLockedPc.mockRejectedValueOnce(new Error("browser"));
    lockShopDevice("ended");
    render(<ShopDeviceGate>{null}</ShopDeviceGate>);
    expect(await screen.findByTestId("push-not-released")).toBeVisible();
    expect(screen.queryByTestId("whos-working")).not.toBeInTheDocument();
  });
});
