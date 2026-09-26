import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setTokenProvider } from "@/lib/api/client";
import {
  getSupportChatMe,
  getSupportChatThread,
  markSupportChatRead,
  openSupportChatThread,
  sendSupportChatMessage,
} from "@/lib/api/support-chat-party";

describe("support chat party client", () => {
  it("owns the personal routes and leaves the staff desk alone", () => {
    const src = readFileSync(resolve(__dirname, "../support-chat-party.ts"), "utf8");
    expect(src).toMatch(/export async function getSupportChatMe/);
    expect(src).toMatch(/export async function openSupportChatThread/);
    expect(src).toMatch(/export async function sendSupportChatMessage/);
    expect(src).toMatch(/export async function markSupportChatRead/);
    expect(src).toMatch(/\/support-chat\/me/);
    expect(src).toMatch(/\/support-chat\/me\/threads/);
    expect(src).toMatch(/\/support-chat\/me\/messages/);
    expect(src).toMatch(/\/support-chat\/me\/read/);
    expect(src).not.toMatch(/listSupportChatThreads/);
    expect(src).not.toMatch(/replySupportChat/);
    expect(src).not.toMatch(/\/support-chat\/threads\/\$\{[^}]+\}\/messages/);
    expect(src).not.toMatch(/support-tickets/);
    expect(src).not.toMatch(/support-desk/);
  });
});

afterEach(() => {
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

it("sends the supplier workspace role on the personal thread", async () => {
  vi.stubGlobal("window", { location: { pathname: "/supplier/chat" } });
  setTokenProvider(() => "test-bearer");
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ threads: [], thread: null, messages: [], unreadCount: 0 }),
      {
        status: 200,
      },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);

  await getSupportChatMe();

  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toMatch(/\/support-chat\/me$/);
  expect(init.method ?? "GET").toBe("GET");
  const headers = new Headers(init.headers);
  expect(headers.get("X-GRIDGO-Role")).toBe("supplier");
  expect(headers.get("Authorization")).toBe("Bearer test-bearer");
});

it("opens, reads, and writes one personal conversation", async () => {
  vi.stubGlobal("window", { location: { pathname: "/supplier/chat" } });
  setTokenProvider(() => "test-bearer");
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (String(url).endsWith("/support-chat/me/threads")) {
      return new Response(JSON.stringify({ thread: { id: "thread-1" } }), {
        status: 200,
      });
    }
    if (String(url).endsWith("/support-chat/me/messages")) {
      return new Response(
        JSON.stringify({ thread: { id: "thread-1" }, message: { id: "m1" } }),
        {
          status: 201,
        },
      );
    }
    if (String(url).endsWith("/read")) {
      return new Response(
        JSON.stringify({ thread: { id: "thread-1" }, unreadCount: 0 }),
        {
          status: 200,
        },
      );
    }
    return new Response(JSON.stringify({ thread: { id: "thread-1" }, messages: [] }), {
      status: 200,
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  await openSupportChatThread();
  await getSupportChatThread("thread/1");
  await sendSupportChatMessage("Where is the payout?", "thread-1");
  await sendSupportChatMessage("Hello");
  await markSupportChatRead("thread-1");
  await markSupportChatRead();

  const calls = fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: (init as RequestInit | undefined)?.method ?? "GET",
    body: (init as RequestInit | undefined)?.body,
  }));

  expect(calls[0]).toMatchObject({
    url: expect.stringMatching(/\/support-chat\/me\/threads$/),
    method: "POST",
  });
  expect(JSON.parse(String(calls[0]?.body))).toEqual({});
  expect(calls[1]?.url).toMatch(/\/support-chat\/threads\/thread%2F1$/);
  expect(calls[1]?.method).toBe("GET");
  expect(calls[2]).toMatchObject({
    url: expect.stringMatching(/\/support-chat\/me\/messages$/),
    method: "POST",
  });
  expect(JSON.parse(String(calls[2]?.body))).toEqual({
    body: "Where is the payout?",
    threadId: "thread-1",
  });
  expect(JSON.parse(String(calls[3]?.body))).toEqual({ body: "Hello" });
  expect(calls[4]).toMatchObject({
    url: expect.stringMatching(/\/support-chat\/threads\/thread-1\/read$/),
    method: "PATCH",
  });
  expect(calls[5]).toMatchObject({
    url: expect.stringMatching(/\/support-chat\/me\/read$/),
    method: "PATCH",
  });
});
