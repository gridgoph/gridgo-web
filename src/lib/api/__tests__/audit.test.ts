import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadAuditCsv, listAuditPage, listOrderAudit, setTokenProvider } from "@/lib/api/client";

afterEach(() => {
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const csv = (rows: string[], next: string) =>
  new Response(["id,at\r\n", ...rows.map((row) => `${row}\r\n`)].join(""), {
    status: 200,
    headers: { "Content-Type": "text/csv", "X-Next-Offset": next },
  });

describe("listAuditPage", () => {
  it("sends the filters and reads the page", async () => {
    vi.stubGlobal("window", { location: { pathname: "/admin/audit" } });
    const fetchMock = vi.fn().mockResolvedValue(json({ audit: [], limit: 100, offset: 100, nextOffset: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const page = await listAuditPage({ q: "50% off", person: "Maria", from: "2026-09-30T16:00:00.000Z", limit: 100, offset: 100 });

    const url = new URL(fetchMock.mock.calls[0][0], "http://portal.test");
    expect(url.pathname).toMatch(/\/audit$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "50% off",
      person: "Maria",
      from: "2026-09-30T16:00:00.000Z",
      limit: "100",
      offset: "100",
    });
    expect(page).toMatchObject({ nextOffset: 200, offset: 100, legacy: false });
  });

  it("says when the API answered without paging, as the older log did", async () => {
    vi.stubGlobal("window", { location: { pathname: "/admin/audit" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ audit: [{ id: "aud_1" }] })));

    const page = await listAuditPage({ q: "x" });

    expect(page.legacy).toBe(true);
    expect(page.nextOffset).toBeNull();
    expect(page.audit).toHaveLength(1);
  });
});

describe("listOrderAudit", () => {
  it("reads one order's entries from its own endpoint", async () => {
    vi.stubGlobal("window", { location: { pathname: "/ops/orders/ord_1" } });
    const fetchMock = vi.fn().mockResolvedValue(json({ audit: [], limit: 50, offset: 0, nextOffset: null }));
    vi.stubGlobal("fetch", fetchMock);

    await listOrderAudit("ord_1", { limit: 50 });

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/orders\/ord_1\/audit\?limit=50$/);
    expect(fetchMock.mock.calls[0][1].headers["X-GRIDGO-Role"]).toBe("ops_admin");
  });

  it("surfaces an unknown order as the API's error", async () => {
    vi.stubGlobal("window", { location: { pathname: "/admin/orders/nope" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "order_not_found" }, 404)));
    await expect(listOrderAudit("nope")).rejects.toMatchObject({ code: "order_not_found", status: 404 });
  });
});

describe("downloadAuditCsv", () => {
  it("follows X-Next-Offset with the same pinned upper bound and one header", async () => {
    vi.stubGlobal("window", { location: { pathname: "/admin/audit" } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(csv(['"aud_2","2026-10-15"'], "5000"))
      .mockResolvedValueOnce(csv(['"aud_1","2026-10-14"'], ""));
    vi.stubGlobal("fetch", fetchMock);
    const pages: number[] = [];

    const blob = await downloadAuditCsv(
      { action: "order.transition", to: "2026-10-15T04:00:00.000Z" },
      { onPage: (count) => pages.push(count) },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new URL(fetchMock.mock.calls[0][0], "http://portal.test");
    const second = new URL(fetchMock.mock.calls[1][0], "http://portal.test");
    expect(first.pathname).toMatch(/\/audit$/);
    expect(first.searchParams.get("format")).toBe("csv");
    expect(first.searchParams.get("limit")).toBe("5000");
    expect(first.searchParams.get("offset")).toBe("0");
    expect(second.searchParams.get("offset")).toBe("5000");
    expect(second.searchParams.get("to")).toBe("2026-10-15T04:00:00.000Z");
    expect(second.searchParams.get("action")).toBe("order.transition");
    expect(await blob.text()).toBe('id,at\r\n"aud_2","2026-10-15"\r\n"aud_1","2026-10-14"\r\n');
    expect(pages).toEqual([1, 2]);
  });

  it("exports one order from the order endpoint", async () => {
    vi.stubGlobal("window", { location: { pathname: "/ops/orders/ord_9" } });
    const fetchMock = vi.fn().mockResolvedValue(csv([], ""));
    vi.stubGlobal("fetch", fetchMock);

    await downloadAuditCsv({ to: "2026-10-15T04:00:00.000Z" }, { orderId: "ord_9" });

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/orders\/ord_9\/audit\?/);
  });

  it("throws the API error instead of saving an error page as CSV", async () => {
    vi.stubGlobal("window", { location: { pathname: "/admin/audit" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "invalid_date_range" }, 400)));
    await expect(downloadAuditCsv({ to: "2026-10-15T04:00:00.000Z" })).rejects.toMatchObject({
      code: "invalid_date_range",
    });
  });
});
