import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getApiBase,
  getTracker,
  getTrackerAttachmentUrl,
  recordTrackerDecision,
  setTokenProvider,
  setTrackerStatus,
  setTrackerPriority,
  listIssueReports,
  updateIssueReport,
  uploadTrackerAttachment,
} from "@/lib/api/client";

const item = { repo: "gridgo-client", number: 41 };

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  setTokenProvider(() => "clerk-session-token");
  return fetchMock;
}

function call(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url: url.replace(getApiBase(), ""), init };
}

afterEach(() => vi.unstubAllGlobals());

describe("tracker client", () => {
  it("reads the board, and skips the API's GitHub cache only on refresh", async () => {
    let fetchMock = respondWith({ fetchedAt: "2026-09-25T00:00:00Z", items: [] });
    await getTracker();
    expect(call(fetchMock).url).toBe("/admin/tracker");

    fetchMock = respondWith({ fetchedAt: "2026-09-25T00:00:00Z", items: [] });
    await getTracker({ refresh: true });
    expect(call(fetchMock).url).toBe("/admin/tracker?refresh=1");
  });

  it("patches only the status, with a trimmed note when there is one", async () => {
    let fetchMock = respondWith({ key: "gridgo-client#41", status: "live" });
    const updated = await setTrackerStatus(item, { status: "live", note: "  shipped  " });
    let sent = call(fetchMock);
    expect(sent.url).toBe("/admin/tracker/gridgo-client/41/status");
    expect(sent.init.method).toBe("PATCH");
    expect(JSON.parse(String(sent.init.body))).toEqual({ status: "live", note: "shipped" });
    expect(updated.status).toBe("live");

    fetchMock = respondWith({ item: { key: "gridgo-client#41", status: "open" } });
    const wrapped = await setTrackerStatus(item, { status: "open", note: "   " });
    sent = call(fetchMock);
    expect(JSON.parse(String(sent.init.body))).toEqual({ status: "open" });
    expect(wrapped.status).toBe("open");
  });

  it("uploads decision files under the tracker_decision purpose", async () => {
    const fetchMock = respondWith({ file: { fileId: "file_1" } }, 201);
    const stored = await uploadTrackerAttachment(new File(["x"], "a.png", { type: "image/png" }));
    const sent = call(fetchMock);
    expect(sent.url).toBe("/files");
    const body = sent.init.body as FormData;
    expect(body.get("purpose")).toBe("tracker_decision");
    expect((body.get("file") as File).name).toBe("a.png");
    expect(stored.fileId).toBe("file_1");
  });

  it("posts a decision with its attachment ids and next status", async () => {
    const fetchMock = respondWith({ key: "gridgo-client#41", status: "open" });
    await recordTrackerDecision(item, { text: "Go", attachmentIds: ["file_1"], status: "open" });
    const sent = call(fetchMock);
    expect(sent.url).toBe("/admin/tracker/gridgo-client/41/decisions");
    expect(sent.init.method).toBe("POST");
    expect(JSON.parse(String(sent.init.body))).toEqual({
      text: "Go",
      attachmentIds: ["file_1"],
      status: "open",
    });
  });

  it("fetches one signed attachment link", async () => {
    const fetchMock = respondWith({ url: "https://files.example/signed?sig=1" });
    await expect(getTrackerAttachmentUrl("dec_1", "file_1")).resolves.toBe(
      "https://files.example/signed?sig=1",
    );
    expect(call(fetchMock).url).toBe("/admin/tracker/decisions/dec_1/attachments/file_1");
  });
});

it("priority writes contain only a boolean and report priority paging uses the server filter", async () => {
  let fetchMock = respondWith({ key: "gridgo-client#41", priority: true });
  await setTrackerPriority(item, true);
  expect(call(fetchMock).url).toBe("/admin/tracker/gridgo-client/41/priority");
  expect(JSON.parse(String(call(fetchMock).init.body))).toEqual({ priority: true });
  fetchMock = respondWith({ reports: [], counts: { priorities: 0 } });
  await listIssueReports("priorities", { limit: 25, before: "older-id" });
  expect(call(fetchMock).url).toBe(
    "/ops/issue-reports?priority=true&limit=25&before=older-id",
  );
  fetchMock = respondWith({ id: "report-1", priority: false });
  await updateIssueReport("report-1", { priority: false });
  expect(call(fetchMock).url).toBe("/ops/issue-reports/report-1");
  expect(JSON.parse(String(call(fetchMock).init.body))).toEqual({ priority: false });
});
