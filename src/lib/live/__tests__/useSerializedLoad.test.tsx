// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import React, { useCallback, useEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { InvalidatePing } from "@/lib/api/types";
import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";
import {
  useLiveReload,
  LIVE_RELOAD_COALESCE_MS,
} from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

vi.stubGlobal("React", React);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function Probe({ read }: { read: () => Promise<string> }) {
  const [value, setValue] = useState("");
  const load = useSerializedLoad(
    useCallback(async () => {
      setValue(await read());
    }, [read]),
  );
  useLiveReload("identity", load);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <output>{value}</output>
      <button onClick={() => void load()}>Refresh</button>
    </>
  );
}

it("coalesces live and manual loads behind the initial load", async () => {
  vi.useFakeTimers();
  const initial = deferred<string>();
  const liveRead = deferred<string>();
  const read = vi
    .fn()
    .mockReturnValueOnce(initial.promise)
    .mockReturnValueOnce(liveRead.promise);
  let listener!: (ping: InvalidatePing) => void;
  const live: LiveContextValue = {
    notifications: [],
    unreadCount: 0,
    snapshot: null,
    live: true,
    subscribe: (next) => {
      listener = next;
      return () => undefined;
    },
    markRead: async () => {},
    markAllRead: async () => {},
    remove: async () => {},
    refreshInbox: async () => {},
  };
  render(
    <LiveContext.Provider value={live}>
      <Probe read={read} />
    </LiveContext.Provider>,
  );
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => {
    listener({ resource: "identity" });
    await vi.advanceTimersByTimeAsync(LIVE_RELOAD_COALESCE_MS);
  });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => {
    initial.resolve("Old role");
  });
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => {
    liveRead.resolve("Newest role");
  });
  expect(read).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("status")).toHaveTextContent("Newest role");
});

it("retains arguments and continues queued work after rejection", async () => {
  const first = deferred<void>();
  const read = vi.fn(async (id: string) => {
    if (id === "first") {
      await first.promise;
      throw new Error("Offline");
    }
  });
  const { result } = renderHook(() => useSerializedLoad(read));
  const rejected = result.current("first").catch((error) => error.message);
  const next = result.current("second");
  expect(read.mock.calls).toEqual([["first"]]);
  first.resolve();
  expect(await rejected).toBe("Offline");
  await next;
  expect(read.mock.calls).toEqual([["first"], ["second"]]);
});

it("keeps new dependency loads behind a pending previous load", async () => {
  const first = deferred<void>();
  const calls: string[] = [];
  const oldLoad = async () => {
    await first.promise;
    calls.push("old");
  };
  const newLoad = async () => {
    calls.push("new");
  };
  const { result, rerender } = renderHook(
    ({ load }) => useSerializedLoad(load),
    {
      initialProps: { load: oldLoad },
    },
  );
  const old = result.current();
  rerender({ load: newLoad });
  const next = result.current();
  expect(calls).toEqual([]);
  first.resolve();
  await Promise.all([old, next]);
  expect(calls).toEqual(["old", "new"]);
});

it("runs only the latest pending filter and settles every superseded caller", async () => {
  const first = deferred<void>();
  const last = deferred<void>();
  const read = vi.fn(async (filter: string) => {
    if (filter === "") await first.promise;
    else await last.promise;
  });
  const { result } = renderHook(() => useSerializedLoad(read));
  const initial = result.current("");
  const calls = [
    result.current("o"),
    result.current("or"),
    result.current("ord"),
    result.current("order_123"),
  ];
  expect(read.mock.calls).toEqual([[""]]);
  let settled = false;
  void Promise.all(calls).then(() => {
    settled = true;
  });
  first.resolve();
  await initial;
  expect(read.mock.calls).toEqual([[""], ["order_123"]]);
  expect(settled).toBe(false);
  last.resolve();
  await Promise.all(calls);
  expect(settled).toBe(true);
});
