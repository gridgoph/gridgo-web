import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  apiRequest,
  listOrders,
  listUsers,
  listJobs,
  listClaims,
  listEscalations,
  listIssueReports,
  setTestOperationsSession,
  setTokenProvider,
} from "@/lib/api/client";
import { listSupportChatThreads } from "@/lib/api/support-chat";
import { invalidateSharedReads } from "@/lib/api/sharedReads";

const ok = (body: unknown) => new Response(JSON.stringify(body));

beforeEach(() => {
  vi.stubGlobal("window", { location: { pathname: "/ops/overview" } });
  setTokenProvider(() => "session-a");
});
afterEach(() => {
  setTokenProvider(() => null);
  setTestOperationsSession(false);
  vi.unstubAllGlobals();
});

it.each([
  ["orders", () => listOrders(), { orders: [] }],
  ["users", () => listUsers("supplier"), { users: [] }],
  ["jobs", () => listJobs(), { jobs: [] }],
  ["claims", () => listClaims(), { claims: [] }],
  ["escalations", () => listEscalations({ status: "open" }), { escalations: [] }],
  [
    "issue reports",
    () => listIssueReports("new"),
    { reports: [{}], counts: { new: 87 } },
  ],
  ["support chat", () => listSupportChatThreads(), { threads: [] }],
] as const)(
  "shares the flight and settled result for %s, then reads afresh",
  async (_, read, body) => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = read();
    const second = read();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolve(ok(body));
    expect(await first).toEqual(await second);
    expect(await read()).toEqual(await first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await new Promise((done) => setTimeout(done, 5));
    fetchMock.mockImplementation(async () => ok(body));
    await read();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);

it("keeps role, directory filters, review-data and page keys separate", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => ok({ orders: [], users: [] }));
  vi.stubGlobal("fetch", fetchMock);
  await Promise.all([
    listUsers("supplier"),
    listUsers("rider"),
    listOrders(),
    listOrders({ includeReviewData: true }),
  ]);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  setTestOperationsSession(true);
  await listOrders();
  expect(fetchMock).toHaveBeenCalledTimes(5);
  vi.stubGlobal("window", { location: { pathname: "/admin/overview" } });
  await listOrders();
  expect(fetchMock).toHaveBeenCalledTimes(6);
  await Promise.all([
    apiRequest("/orders?limit=1"),
    apiRequest("/orders?limit=1&cursor=next"),
  ]);
  expect(fetchMock).toHaveBeenCalledTimes(8);
  const scopes = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).headers);
  expect(scopes[0]).toMatchObject({ "X-GRIDGO-Role": "ops_admin" });
  expect(scopes[5]).toMatchObject({ "X-GRIDGO-Role": "super_admin" });
});

it("does not share data across session changes or server requests", async () => {
  const fetchMock = vi.fn(async () => ok({ users: [] }));
  vi.stubGlobal("fetch", fetchMock);
  await listUsers();
  setTokenProvider(() => "session-b");
  await listUsers();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  vi.stubGlobal("window", undefined);
  await Promise.all([listUsers(), listUsers()]);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("shares a failed flight without swallowing errors, and lets Retry read again", async () => {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const results = await Promise.allSettled([listOrders(), listOrders()]);
  expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockImplementation(async () => ok({ orders: [] }));
  await listOrders();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("invalidates pre-event flights once per ping and leaves the new flight owned", async () => {
  const fetchMock = vi.fn(async () => ok({ orders: [] }));
  vi.stubGlobal("fetch", fetchMock);
  await listOrders();
  const ping = { resource: "orders" } as const;
  invalidateSharedReads(ping);
  const fresh = listOrders();
  invalidateSharedReads(ping);
  await Promise.all([fresh, listOrders()]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("does not share caller-owned cancellation or a result across a write", async () => {
  const fetchMock = vi.fn(async () => ok({ orders: [] }));
  vi.stubGlobal("fetch", fetchMock);
  await Promise.all([
    apiRequest("/orders", { signal: new AbortController().signal }),
    listOrders(),
  ]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await apiRequest("/orders/id/state", { method: "POST", body: "{}" });
  await listOrders();
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
