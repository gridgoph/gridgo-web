import { afterEach, describe, expect, it, vi } from "vitest";

import { getApiBase, setTokenProvider } from "@/lib/api/client";
import {
  openNotificationStream,
  markNotificationRead,
  readInvalidateEvent,
  readNotificationEvent,
} from "@/lib/api/notifications";
import { parseSseChunk } from "@/lib/eventStream";

afterEach(() => {
  setTokenProvider(() => null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("scopes a single inbox mutation to the active workspace", async () => {
  vi.stubGlobal("window", { location: { pathname: "/ops/overview" } });
  setTokenProvider(() => "test-bearer");
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ notification: { id: "ntf_1" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await markNotificationRead("ntf_1");
  expect(new Headers(fetchMock.mock.calls[0][1].headers).get("X-GRIDGO-Role")).toBe("ops_admin");
});

describe("SSE event readers", () => {
  it("accepts wrapped notification frames and typed invalidate pings", () => {
    const [notification] = parseSseChunk(
      'event: notification\ndata: {"notification":{"id":"ntf_1","title":"New job","userId":"u1","read":false,"at":"2026-09-01T00:00:00.000Z"}}\n\n',
    ).events;
    const [invalidate] = parseSseChunk(
      'event: invalidate\ndata: {"resource":"orders","id":"ord_1"}\n\n',
    ).events;
    expect(readNotificationEvent(notification)?.id).toBe("ntf_1");
    expect(readInvalidateEvent(invalidate)).toEqual({
      resource: "orders",
      id: "ord_1",
    });
    expect(
      readInvalidateEvent({
        event: "invalidate",
        data: '{"resource":"nope"}',
        id: null,
        retryMs: null,
      }),
    ).toBeNull();
  });
});

describe("openNotificationStream", () => {
  it("clears the resume cursor after 409 and reconnects without Last-Event-ID", async () => {
    vi.useFakeTimers();
    const resume = { current: "ntf_old" as string | null };
    const onResumeUnavailable = vi.fn(async () => {
      resume.current = null;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 409, statusText: "Conflict" }),
      )
      .mockResolvedValueOnce(
        new Response(new ReadableStream(), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    setTokenProvider(() => "clerk-session-token");

    const handle = openNotificationStream({
      getResumeFrom: () => resume.current,
      onNotification: () => undefined,
      onInvalidate: () => undefined,
      onResumeUnavailable,
    });

    await vi.waitFor(() => expect(onResumeUnavailable).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const firstHeaders = new Headers(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    );
    const secondHeaders = new Headers(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers,
    );
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      `${getApiBase()}/notifications/stream`,
    );
    expect(firstHeaders.get("authorization")).toBe("Bearer clerk-session-token");
    expect(firstHeaders.get("last-event-id")).toBe("ntf_old");
    expect(firstHeaders.get("accept")).toBe("text/event-stream");
    expect(secondHeaders.get("last-event-id")).toBeNull();
    expect(resume.current).toBeNull();
    handle.close();
  });

  it("refreshes the Clerk token once after 401, then reconnects", async () => {
    const tokens = ["stale", "fresh"];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(new ReadableStream(), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    setTokenProvider((options) =>
      options?.skipCache ? tokens[1] : tokens[0],
    );

    const handle = openNotificationStream({
      onNotification: () => undefined,
      onInvalidate: () => undefined,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const first = new Headers(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    );
    const second = new Headers(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers,
    );
    expect(first.get("authorization")).toBe("Bearer stale");
    expect(second.get("authorization")).toBe("Bearer fresh");
    handle.close();
  });
});
