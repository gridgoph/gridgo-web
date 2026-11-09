import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest, getAuthMe, setTokenProvider } from "@/lib/api/client";

import { UploadXhr } from "@/test/multipart-xhr";
import { onUploadActivity, type UploadActivity } from "@/lib/upload-activity";
import { uploadErrorMessage } from "@/lib/upload-errors";

function upload(signal?: AbortSignal) {
  const body = new FormData();
  body.append("purpose", "production_photo");
  body.append("file", new File(["image"], "photo.jpg", { type: "image/jpeg" }));
  return apiRequest<{ file: { fileId: string } }>("/files", {
    method: "POST",
    body,
    signal,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("XMLHttpRequest", UploadXhr);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    ),
  );
  setTokenProvider(() => "test-token");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setTokenProvider(() => null);
});

it("a 3 MiB upload making progress for 25 seconds survives the JSON deadline", async () => {
  const pending = upload().then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(0);
  for (let second = 5; second <= 25; second += 5) {
    await vi.advanceTimersByTimeAsync(5_000);
    UploadXhr.current?.progress((second / 25) * 3 * 1024 * 1024);
  }
  UploadXhr.current?.sent();
  UploadXhr.current?.respond();
  expect(await pending).toEqual({ value: { file: { fileId: "stored" } } });
});

it("a fully sent body can wait 25 seconds for storage (scout reproduction)", async () => {
  const pending = upload().then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(0);
  UploadXhr.current?.sent();
  await vi.advanceTimersByTimeAsync(25_000);
  UploadXhr.current?.respond();
  expect(await pending).toEqual({ value: { file: { fileId: "stored" } } });
});

it("JSON still times out at 20 seconds", async () => {
  const rejected = expect(getAuthMe()).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(20_000);
  await rejected;
});

it("cancels a stalled transfer even if identical progress events keep arriving", async () => {
  const pending = upload().catch((error) => error);
  await vi.advanceTimersByTimeAsync(0);
  UploadXhr.current.progress(1024);
  await vi.advanceTimersByTimeAsync(59_000);
  UploadXhr.current.progress(1024);
  await vi.advanceTimersByTimeAsync(1_000);
  const error = await pending;
  expect(error).toMatchObject({ name: "TimeoutError", code: "upload_stalled" });
  expect(uploadErrorMessage(error)).toMatch(/60 seconds.*connection/i);
  expect(UploadXhr.current.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps a bounded 15-minute budget even while bytes keep advancing", async () => {
  const pending = upload().catch((error) => error);
  await vi.advanceTimersByTimeAsync(0);
  for (let step = 1; step < 30; step++) {
    await vi.advanceTimersByTimeAsync(30_000);
    UploadXhr.current.progress(step * 1024);
  }
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await pending).toMatchObject({ code: "upload_timeout" });
  expect(UploadXhr.current.aborted).toBe(true);
});

it("bounds saving and does not claim a timed-out file was never stored", async () => {
  const pending = upload().catch((error) => error);
  await vi.advanceTimersByTimeAsync(0);
  UploadXhr.current.sent();
  await vi.advanceTimersByTimeAsync(900_000);
  expect(uploadErrorMessage(await pending)).toMatch(/may have been stored.*check/i);
});

it("preserves caller cancellation during sending and releases timers", async () => {
  const controller = new AbortController();
  const pending = upload(controller.signal).catch((error) => error);
  await vi.advanceTimersByTimeAsync(0);
  controller.abort(new DOMException("Stopped", "AbortError"));
  expect(await pending).toMatchObject({ name: "AbortError", message: "Stopped" });
  expect(UploadXhr.current.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not start a cancelled request or one whose token arrives after 20 seconds", async () => {
  const construct = vi.fn();
  vi.stubGlobal("XMLHttpRequest", construct);
  const controller = new AbortController();
  controller.abort();
  await expect(upload(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  let release!: (token: string) => void;
  setTokenProvider(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = upload().catch((error) => error);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(await pending).toMatchObject({ name: "TimeoutError" });
  release("late");
  await vi.advanceTimersByTimeAsync(0);
  expect(construct).not.toHaveBeenCalled();
});

it("publishes byte progress, saving and stored as distinct states and supports notice cancellation", async () => {
  const events: UploadActivity[] = [];
  const unsubscribe = onUploadActivity((event) => events.push(event));
  try {
    const pending = upload();
    await vi.advanceTimersByTimeAsync(0);
    UploadXhr.current.progress(512, 1024);
    expect(events.at(-1)).toMatchObject({
      phase: "sending",
      loaded: 512,
      total: 1024,
      filename: "photo.jpg",
    });
    UploadXhr.current.sent();
    expect(events.at(-1)?.phase).toBe("saving");
    await vi.advanceTimersByTimeAsync(25_000);
    expect(events.at(-1)?.phase).toBe("saving");
    UploadXhr.current.respond();
    await pending;
    expect(events.at(-1)?.phase).toBe("stored");
    const cancelled = upload().catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    events.at(-1)?.cancel();
    expect(await cancelled).toMatchObject({
      code: "upload_cancelled",
      name: "AbortError",
    });
    expect(events.at(-1)?.phase).toBe("failed");
  } finally {
    unsubscribe();
  }
});

it("keeps the Clerk bearer, role, browser boundary and structured API errors", async () => {
  vi.stubGlobal("window", { location: { pathname: "/ops/payouts" } });
  const pending = upload().catch((error) => error);
  await vi.advanceTimersByTimeAsync(0);
  expect(UploadXhr.current.headers.Authorization).toBe("Bearer test-token");
  expect(UploadXhr.current.headers["X-GRIDGO-Role"]).toBe("ops_admin");
  expect(UploadXhr.current.headers["Content-Type"]).toBeUndefined();
  expect(UploadXhr.current.body?.get("purpose")).toBe("production_photo");
  UploadXhr.current.status = 413;
  UploadXhr.current.responseText = JSON.stringify({
    error: "file_too_large",
    maxMiB: 15,
  });
  UploadXhr.current.respond();
  expect(await pending).toMatchObject({ status: 413, code: "file_too_large" });
  expect(vi.getTimerCount()).toBe(0);
});

it("does not claim a file was never stored when the connection fails during saving", async () => {
  const pending = upload().catch((error) => error);
  await vi.advanceTimersByTimeAsync(0);
  UploadXhr.current.sent();
  UploadXhr.current.dispatchEvent(new Event("error"));
  expect(uploadErrorMessage(await pending)).toMatch(/may have been stored.*check/i);
  expect(vi.getTimerCount()).toBe(0);
});
