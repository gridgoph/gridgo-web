import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getOrder,
  listEscalations,
  listOrders,
  setTestOperationsSession,
} from "@/lib/api/client";

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function stub(pathname: string) {
  vi.stubGlobal("window", { location: { pathname } });
  const fetchMock = vi.fn(async (url: string) =>
    ok(
      url.includes("/escalations")
        ? { escalations: [] }
        : url.includes("/orders/")
          ? { order: { id: "ord_1", state: "production" } }
          : { orders: [] },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  setTestOperationsSession(false);
  vi.unstubAllGlobals();
});

describe("review data on staff reads", () => {
  it("leaves test orders out by default", async () => {
    const fetchMock = stub("/ops/orders");
    await listOrders();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/orders$/);
  });

  it("asks for test orders when the switch is on", async () => {
    const fetchMock = stub("/ops/orders");
    await listOrders({ includeReviewData: true });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/orders\?includeReviewData=1$/);
  });

  it("sends the flag on every listed read for a test operations login", async () => {
    setTestOperationsSession(true);
    const fetchMock = stub("/ops/overview");
    await listOrders();
    await listEscalations({ status: "open" });
    await getOrder("ord_1");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/orders\?includeReviewData=1$/);
    expect(fetchMock.mock.calls[1][0]).toMatch(/includeReviewData=1/);
    // One order is not a list read.
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/orders\/ord_1$/);
  });

  it("never sends it from another tree", async () => {
    setTestOperationsSession(true);
    const fetchMock = stub("/admin/overview");
    await listOrders();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/orders$/);
  });
});
