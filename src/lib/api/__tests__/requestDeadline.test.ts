import { afterEach, expect, it, vi } from "vitest";
import { getAuthMe, setTokenProvider } from "@/lib/api/client";
import { listNotificationInbox } from "@/lib/api/notifications";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setTokenProvider(() => null); });
it("bounds stalled token acquisition and prevents its late answer starting fetch", async () => {
  vi.useFakeTimers();
  let release!: (token: string) => void;
  setTokenProvider(() => new Promise((resolve) => { release = resolve; }));
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const pending = getAuthMe();
  const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(20_000);
  await rejected;
  release("late-token");
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("bounds inbox body consumption even when a transport ignores abort", async () => {
  vi.useFakeTimers();
  setTokenProvider(() => "token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => new Promise(() => {}) }));
  const rejected = expect(listNotificationInbox("ops_admin")).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(20_000);
  await rejected;
});
it("preserves the caller's immediate cancellation", async () => {
  const controller = new AbortController(); controller.abort();
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await expect(getAuthMe({ signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchMock).not.toHaveBeenCalled();
});
