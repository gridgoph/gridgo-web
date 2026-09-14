// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

import { getAuthMe, setTokenProvider } from "@/lib/api/client";
import type { InvalidatePing } from "@/lib/api/types";
import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";
import {
  LIVE_RELOAD_COALESCE_MS,
  matchesInvalidate,
  useLiveReload,
} from "@/lib/live/useLiveReload";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function idleLive(overrides: Partial<LiveContextValue> = {}): LiveContextValue {
  return {
    notifications: [],
    unreadCount: 0,
    snapshot: null,
    live: true,
    subscribe: () => () => undefined,
    markRead: async () => undefined,
    markAllRead: async () => undefined,
    remove: async () => undefined,
    refreshInbox: async () => undefined,
    ...overrides,
  };
}

function Probe({
  subscribe,
  load,
  matchId,
}: {
  subscribe: LiveContextValue["subscribe"];
  load: () => void;
  matchId?: string;
}) {
  useLiveReload("orders", load, matchId ? { matchId } : undefined);
  useEffect(() => undefined, [subscribe]);
  return null;
}

describe("matchesInvalidate", () => {
  it("reloads resource-wide pings and ignores other ids on a detail page", () => {
    expect(matchesInvalidate({ resource: "orders" }, ["orders"], "ord_1")).toBe(true);
    expect(
      matchesInvalidate({ resource: "orders", id: "ord_1" }, ["orders"], "ord_1"),
    ).toBe(true);
    expect(
      matchesInvalidate({ resource: "orders", id: "ord_2" }, ["orders"], "ord_1"),
    ).toBe(false);
    expect(matchesInvalidate({ resource: "jobs" }, ["orders"])).toBe(false);
  });
});

describe("useLiveReload", () => {
  it("coalesces matching invalidates into one load", async () => {
    vi.useFakeTimers();
    const load = vi.fn();
    const listeners = new Set<(ping: InvalidatePing) => void>();
    const subscribe: LiveContextValue["subscribe"] = (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };

    render(
      <LiveContext.Provider value={idleLive({ subscribe })}>
        <Probe subscribe={subscribe} load={load} matchId="ord_1" />
      </LiveContext.Provider>,
    );

    for (const listener of listeners) {
      listener({ resource: "orders", id: "ord_1" });
      listener({ resource: "orders", id: "ord_1" });
      listener({ resource: "orders", id: "ord_9" });
    }

    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LIVE_RELOAD_COALESCE_MS);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

it("serializes a second invalidation behind the pending refresh", async () => {
  vi.useFakeTimers();
  let resolve!: () => void;
  const load = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue(undefined);
  let listener!: (ping: InvalidatePing) => void;
  const subscribe: LiveContextValue["subscribe"] = (next) => {
    listener = next;
    return () => undefined;
  };
  render(
    <LiveContext.Provider value={idleLive({ subscribe })}>
      <Probe subscribe={subscribe} load={load} />
    </LiveContext.Provider>,
  );
  listener({ resource: "orders" });
  await vi.advanceTimersByTimeAsync(300);
  listener({ resource: "orders" });
  await vi.advanceTimersByTimeAsync(300);
  expect(load).toHaveBeenCalledTimes(1);
  resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(load).toHaveBeenCalledTimes(2);
});

it("revalidates protected detail data on an identity change", () => {
  expect(matchesInvalidate({ resource: "identity" }, ["jobs"], "completed-job")).toBe(
    true,
  );
});

it("continues its queued refresh after a stalled request reaches its deadline", async () => {
  vi.useFakeTimers();
  setTokenProvider(() => null);
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  const load = vi.fn(async () => {
    await getAuthMe();
  });
  let listener!: (ping: InvalidatePing) => void;
  const subscribe: LiveContextValue["subscribe"] = (next) => {
    listener = next;
    return () => {};
  };
  render(
    <LiveContext.Provider value={idleLive({ subscribe })}>
      <Probe subscribe={subscribe} load={load} />
    </LiveContext.Provider>,
  );
  listener({ resource: "orders" });
  await vi.advanceTimersByTimeAsync(300);
  listener({ resource: "orders" });
  await vi.advanceTimersByTimeAsync(300);
  expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(load).toHaveBeenCalledTimes(2);
  vi.unstubAllGlobals();
});
