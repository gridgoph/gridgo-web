import { describe, expect, it } from "vitest";

import { supportChatMessageBody } from "@/lib/api/support-chat-party";
import { deletionConfirmMethod } from "@/lib/account-deletion";
import { composeProblemReport, problemReportIssue } from "@/lib/problem-report";
import { legalBlocksWork, legalGateAllows } from "@/lib/supplier-legal";

describe("supplier legal and a problem report", () => {
  it("keeps legal, privacy, and deletion open, and blocks the rest when terms are waiting", () => {
    expect(legalGateAllows("/supplier/legal/review")).toBe(true);
    expect(legalGateAllows("/supplier/privacy/delete")).toBe(true);
    expect(legalGateAllows("/supplier/jobs")).toBe(false);
    expect(legalBlocksWork({ blocking: true, pending: [{ id: "v1" }] })).toBe(true);
    expect(legalBlocksWork({ blocking: true, pending: [] })).toBe(false);
    expect(legalBlocksWork({ blocking: false, pending: [{ id: "v1" }] })).toBe(false);
  });

  it("writes a browser report as its own conversation and keeps an empty one unsent", () => {
    const body = composeProblemReport({
      what: "The photo would not upload.",
      job: { orderId: "ord_1", title: "Cards" },
      context: { appVersion: "web", browser: "TestBrowser" },
    });
    expect(body).toContain("Problem report");
    expect(body).toContain("Job: Cards");
    expect(body).toContain("Browser: TestBrowser");
    expect(body).not.toContain("Phone:");
    expect(problemReportIssue("  ")).toMatch(/Say what went wrong/);
    expect(supportChatMessageBody("Problem report", undefined, ["file_1"], { newThread: true })).toEqual({
      body: "Problem report",
      newThread: true,
      attachmentFileIds: ["file_1"],
    });
    expect(supportChatMessageBody("Hello", "thread_1")).toEqual({ body: "Hello", threadId: "thread_1" });
  });

  it("asks a password account for a password and a Google-only account for a code", () => {
    expect(deletionConfirmMethod({ passwordEnabled: true })).toBe("password");
    expect(deletionConfirmMethod({ passwordEnabled: false })).toBe("email_code");
  });
});
