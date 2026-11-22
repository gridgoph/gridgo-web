// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setTokenProvider } from "@/lib/api/client";
import { getWorkingList, lockWorkingDevice, selectWorker } from "@/lib/api/shop-team";
import {
  IDLE_LOCK_MS,
  isWorkerLockCode,
  lockReasonLine,
  lockShopDevice,
  noteWorkerRefusal,
  resetShopDevice,
  shopDeviceSnapshot,
  startWorkerTurn,
  turnEndReason,
  workerTokenHeader,
} from "@/lib/shop-device";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TURN = {
  worker: { id: "shp_ana", name: "Ana", role: "staff" as const },
  token: "worker-token-1",
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
};

let seen: Array<{ path: string; headers: Record<string, string>; body: string | null }>;

beforeEach(() => {
  resetShopDevice();
  seen = [];
  setTokenProvider(() => "clerk-jwt");
});

afterEach(() => {
  resetShopDevice();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

function stubFetch(answer: (path: string) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://gridgo.test").pathname;
      seen.push({
        path,
        headers: { ...(init?.headers as Record<string, string>) },
        body: typeof init?.body === "string" ? init.body : null,
      });
      return answer(path);
    }),
  );
}

describe("shared shop PC turn", () => {
  it("keeps the worker token in memory only and drops it on lock", () => {
    const before = { ...window.localStorage };
    startWorkerTurn(TURN);
    expect(workerTokenHeader()).toBe("worker-token-1");
    expect(shopDeviceSnapshot()).toMatchObject({
      shared: true,
      worker: { pinStaffId: "shp_ana", name: "Ana", role: "staff" },
    });
    // Nothing of the turn is written anywhere a reload could find it.
    expect({ ...window.localStorage }).toEqual(before);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain("worker-token-1");
    lockShopDevice("switch");
    expect(workerTokenHeader()).toBeNull();
    expect(shopDeviceSnapshot()).toMatchObject({ shared: true, worker: null, lockReason: "switch" });
  });

  it("treats every worker refusal as the picker, never a retry", () => {
    for (const code of ["shop_worker_locked", "shop_worker_invalid", "shop_device_session_required"]) {
      expect(isWorkerLockCode(code)).toBe(true);
    }
    expect(isWorkerLockCode("forbidden")).toBe(false);
    startWorkerTurn(TURN);
    noteWorkerRefusal("forbidden");
    expect(workerTokenHeader()).toBe("worker-token-1");
    noteWorkerRefusal("shop_worker_locked");
    expect(workerTokenHeader()).toBeNull();
    expect(shopDeviceSnapshot()).toMatchObject({ shared: true, worker: null, lockReason: "ended" });
  });

  it("locks after 15 minutes without use, or when the 30-minute turn ends", () => {
    const now = Date.parse("2026-11-22T08:00:00Z");
    const turn = { worker: { pinStaffId: "shp_ana", name: "Ana", role: "staff" as const }, expiresAt: new Date(now + 30 * 60_000).toISOString() };
    expect(IDLE_LOCK_MS).toBe(15 * 60_000);
    expect(turnEndReason(turn, now - IDLE_LOCK_MS + 1000, now)).toBeNull();
    expect(turnEndReason(turn, now - IDLE_LOCK_MS, now)).toBe("idle");
    expect(turnEndReason(turn, now, now + 30 * 60_000)).toBe("expired");
    expect(turnEndReason({ worker: null, expiresAt: null }, 0, now)).toBeNull();
    expect(lockReasonLine("idle")).toBe("Locked after 15 minutes without use.");
    expect(lockReasonLine(null)).toBeNull();
  });
});

describe("shared shop PC requests", () => {
  it("sends the PIN once as a string and the turn's token on every later request", async () => {
    stubFetch((path) =>
      path.endsWith("/select")
        ? json({ worker: { id: "shp_ana", name: "Ana", role: "staff" }, token: "worker-token-1", expiresAt: TURN.expiresAt })
        : json({ members: [], worker: null }),
    );
    const selection = await selectWorker("shp_ana", "0123");
    expect(seen[0].path).toBe("/me/shop-team/working/select");
    expect(JSON.parse(seen[0].body ?? "{}")).toEqual({ pinStaffId: "shp_ana", pin: "0123" });
    expect(seen[0].headers["X-GRIDGO-Role"]).toBe("supplier");
    expect(seen[0].headers["X-GRIDGO-Worker-Token"]).toBeUndefined();

    startWorkerTurn(selection);
    await getWorkingList();
    expect(seen[1].headers["X-GRIDGO-Worker-Token"]).toBe("worker-token-1");
    expect(seen[1].headers.Authorization).toBe("Bearer clerk-jwt");
  });

  it("drops the turn when the API says it ended, and never resends that token", async () => {
    startWorkerTurn(TURN);
    stubFetch(() => json({ error: "shop_worker_locked" }, 403));
    await expect(getWorkingList()).rejects.toMatchObject({ code: "shop_worker_locked" });
    expect(workerTokenHeader()).toBeNull();
    expect(shopDeviceSnapshot().worker).toBeNull();
    await lockWorkingDevice().catch(() => undefined);
    expect(seen[1].headers["X-GRIDGO-Worker-Token"]).toBeUndefined();
  });
});
