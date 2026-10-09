import { afterEach, describe, expect, it, vi } from "vitest";

import {
  downloadLegalAcceptancesCsv,
  publishLegalDocument,
  setTokenProvider,
  updateLegalDraft,
  updatePrivacyRequest,
} from "@/lib/api/client";

afterEach(() => {
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

const csv = (rows: string[], next?: number) =>
  new Response(["id,user_id\r\n", ...rows.map((row) => `${row}\r\n`)].join(""), {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      ...(next !== undefined ? { "X-Next-Offset": String(next) } : {}),
    },
  });

describe("downloadLegalAcceptancesCsv", () => {
  it("follows X-Next-Offset and keeps only the first page's header", async () => {
    vi.stubGlobal("window", { location: { pathname: "/admin/acceptance-log" } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(csv(['"a1","u1"'], 1000))
      .mockResolvedValueOnce(csv(['"a2","u1"']));
    vi.stubGlobal("fetch", fetchMock);

    const blob = await downloadLegalAcceptancesCsv("u1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/admin\/legal\/acceptances\?userId=u1&offset=0&format=csv$/,
    );
    expect(fetchMock.mock.calls[1][0]).toMatch(/offset=1000&format=csv$/);
    expect(await blob.text()).toBe('id,user_id\r\n"a1","u1"\r\n"a2","u1"\r\n');
  });

  it("throws the API error instead of saving an error page as CSV", async () => {
    vi.stubGlobal("window", { location: { pathname: "/ops/acceptance-log" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "user_id_required" }), { status: 400 })),
    );
    await expect(downloadLegalAcceptancesCsv("u1")).rejects.toMatchObject({ code: "user_id_required" });
  });
});

describe("legal writes", () => {
  it("send the revision the editor started from", async () => {
    vi.stubGlobal("window", { location: { pathname: "/admin/legal/terms-of-service" } });
    const fetchMock = vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateLegalDraft("terms-of-service", 4, { text: "New" });
    await publishLegalDocument("terms-of-service", 5);
    await updatePrivacyRequest("pr_1", { expectedRevision: 2, status: "in_progress" });

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/admin\/legal\/documents\/terms-of-service$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      expectedRevision: 4,
      draft: { text: "New" },
    });
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/admin\/legal\/documents\/terms-of-service\/publish$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ expectedRevision: 5 });
    expect(fetchMock.mock.calls[2][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      expectedRevision: 2,
      status: "in_progress",
    });
  });
});
