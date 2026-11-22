// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShopDeviceGate } from "@/components/shop-device/ShopDeviceGate";
import { useTurnWatch } from "@/components/shop-device/WorkerBar";
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
vi.mock("@/lib/api/shop-team", () => api);
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => auth.current }));

const ana = { id: "shp_ana", shopId: "shop_1", kind: "pin", name: "Ana", role: "staff", status: "active", jobAlerts: true, photoFileId: null };
const lito = { ...ana, id: "shp_lito", name: "Lito" };
const owner = { userId: "user_owner", name: "Olive Owner", role: "owner", status: "active", kind: "account" };

beforeEach(() => {
  resetShopDevice();
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
