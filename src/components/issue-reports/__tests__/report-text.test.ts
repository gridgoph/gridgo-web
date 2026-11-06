import { describe, expect, it } from "vitest";

import { reportBodyText, reportTitleLine } from "@/components/issue-reports/report-text";

const THREAD = "350e0593-047f-4269-968c-179b957835f5";
const shot = { position: 0, contentType: "image/png", size: 1, url: "https://x/1", expiresAt: "" };
const app = [
  "Bug report from the client app",
  "",
  "What happened:",
  "My artwork would not attach.",
  "",
  "App: GRIDGO Client 1.0.506",
  "",
  `Support chat thread: ${THREAD}`,
  "Screenshots: 2, in that thread",
].join("\n");

describe("reportBodyText", () => {
  it("drops the thread id and count once the desk shows both", () => {
    const text = reportBodyText({ issue: app, supportThreadId: THREAD, screenshots: [shot] });
    expect(text).toContain("My artwork would not attach.");
    expect(text).not.toContain("Support chat thread");
    expect(text).not.toContain("in that thread");
    expect(text.endsWith("App: GRIDGO Client 1.0.506")).toBe(true);
  });

  it("keeps the text as sent when no thread resolved", () => {
    expect(reportBodyText({ issue: app, supportThreadId: null, screenshots: [] })).toBe(app);
    expect(reportBodyText({ issue: app, screenshots: [] })).toBe(app);
  });

  it("keeps a thread line naming a different thread", () => {
    const other = "11111111-047f-4269-968c-179b957835f5";
    expect(reportBodyText({ issue: app, supportThreadId: other, screenshots: [shot] })).toContain(
      `Support chat thread: ${THREAD}`,
    );
  });

  it("keeps the count when no pictures are left to show", () => {
    expect(reportBodyText({ issue: app, supportThreadId: THREAD, screenshots: [] })).toContain(
      "Screenshots: 2, in that thread",
    );
  });
});

describe("reportTitleLine", () => {
  it("names an app report by what happened", () => {
    expect(reportTitleLine(app)).toBe("My artwork would not attach.");
  });

  it("uses the first line of any other report", () => {
    expect(reportTitleLine("\nOrders need a refresh.\nEvery morning.")).toBe("Orders need a refresh.");
  });

  it("falls back to the heading when nothing follows it", () => {
    expect(reportTitleLine("Bug report from the client app\n\nWhat happened:\n")).toBe("Bug report from the client app");
  });
});
