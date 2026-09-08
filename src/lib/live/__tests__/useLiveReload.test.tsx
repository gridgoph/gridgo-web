// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

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
    expect(
      matchesInvalidate({ resource: "orders" }, ["orders"], "ord_1"),
    ).toBe(true);
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
