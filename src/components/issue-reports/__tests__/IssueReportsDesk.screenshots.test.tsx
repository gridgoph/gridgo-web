// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IssueReportsDesk } from "@/components/issue-reports/IssueReportsDesk";

vi.stubGlobal("React", React);

const { listIssueReports, updateIssueReport, getIssueReport, nav } = vi.hoisted(() => ({
  listIssueReports: vi.fn(),
  updateIssueReport: vi.fn(),
  getIssueReport: vi.fn(),
  nav: { pathname: "/ops/issue-reports" },
}));

vi.mock("@/lib/api/client", () => ({
  listIssueReports,
  updateIssueReport,
  getIssueReport,
  isApiError: () => false,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => nav.pathname,
}));

const THREAD = "350e0593-047f-4269-968c-179b957835f5";

function shot(position: number, source?: "support_chat") {
  return {
    position,
    contentType: "image/png",
    size: 1000,
    url: `https://files.example/shot-${position}.png?sig=1`,
    expiresAt: "2026-11-04T09:42:12.000Z",
    ...(source ? { source } : {}),
  };
}

const base = {
  id: "d7818d9e-b3ab-477e-b9ed-ccbe5ce6d22e",
  category: "bug" as const,
  status: "new" as const,
  publishedIn: null,
  trackerIssueUrl: null,
  createdAt: "2026-11-04T09:37:12.000Z",
  updatedAt: "2026-11-04T09:37:12.000Z",
};

const inApp = {
  ...base,
  issue: [
    "Bug report from the client app",
    "",
    "What happened:",
    "My artwork would not attach.",
    "",
    `Support chat thread: ${THREAD}`,
    "Screenshots: 3, in that thread",
  ].join("\n"),
  // The second chat picture was deleted, so its position is missing.
  screenshots: [shot(0, "support_chat"), shot(2, "support_chat"), shot(3, "support_chat")],
  supportThreadId: THREAD,
};

const landing = {
  ...base,
  id: "954e5bdf-d84f-4890-9958-dfd7e5cd7c49",
  issue: "The price list page is cut off on my phone.",
  screenshots: [shot(0), shot(1)],
  supportThreadId: null,
};

function showing(report: object) {
  listIssueReports.mockResolvedValue({ reports: [report], counts: { new: 1, tracked: 0, published: 0, dismissed: 0 } });
}

afterEach(() => cleanup());

beforeEach(() => {
  nav.pathname = "/ops/issue-reports";
  window.history.replaceState(null, "", "/ops/issue-reports");
  listIssueReports.mockReset();
  updateIssueReport.mockReset();
  getIssueReport.mockReset();
});

async function openDesk(report: object) {
  showing(report);
  render(<IssueReportsDesk />);
  await screen.findByRole("heading", { name: /^Report / });
}

describe("report screenshots", () => {
  it("shows an in-app report's support chat screenshots, numbered in list order", async () => {
    await openDesk(inApp);
    expect(screen.getByRole("img", { name: "Screenshot 1 for report D7818D9E" })).toHaveAttribute("src", inApp.screenshots[0].url);
    expect(screen.getByRole("img", { name: "Screenshot 2 for report D7818D9E" })).toHaveAttribute("src", inApp.screenshots[1].url);
    expect(screen.getByRole("img", { name: "Screenshot 3 for report D7818D9E" })).toHaveAttribute("src", inApp.screenshots[2].url);
    expect(screen.getByText(/From the reporter's support chat/)).toBeInTheDocument();
    expect(screen.getByText(/3 screenshots/)).toBeInTheDocument();
  });

  it("names the row by what happened and leaves the thread id out of the text", async () => {
    await openDesk(inApp);
    expect(screen.getByRole("button", { name: /My artwork would not attach/ })).toBeInTheDocument();
    expect(screen.queryByText(/Bug report from the client app/, { selector: "button span" })).not.toBeInTheDocument();
    expect(screen.getByText(/What happened:/)).toBeInTheDocument();
    expect(screen.queryByText(/Support chat thread/)).not.toBeInTheDocument();
    expect(screen.queryByText(/in that thread/)).not.toBeInTheDocument();
  });

  it("offers Open chat in the Operations tree when the report has a thread", async () => {
    await openDesk(inApp);
    expect(screen.getByRole("link", { name: "Open chat" })).toHaveAttribute("href", `/ops/chat?thread=${THREAD}`);
  });

  it("keeps Super Admin in the admin tree", async () => {
    nav.pathname = "/admin/issue-reports";
    await openDesk(inApp);
    expect(screen.getByRole("link", { name: "Open chat" })).toHaveAttribute("href", `/admin/chat?thread=${THREAD}`);
  });

  it("offers Open chat on a thread with no pictures", async () => {
    await openDesk({ ...inApp, screenshots: [] });
    expect(screen.getByRole("link", { name: "Open chat" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Screenshots" })).not.toBeInTheDocument();
  });

  it("hides Open chat without a thread and still shows landing screenshots", async () => {
    await openDesk(landing);
    expect(screen.queryByRole("link", { name: "Open chat" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Screenshot 1 for report 954E5BDF" })).toHaveAttribute("src", landing.screenshots[0].url);
    expect(screen.getByRole("img", { name: "Screenshot 2 for report 954E5BDF" })).toHaveAttribute("src", landing.screenshots[1].url);
    expect(screen.queryByText(/From the reporter's support chat/)).not.toBeInTheDocument();
  });

  it("hides Open chat on an API from before the field", async () => {
    const older: Partial<typeof landing> = { ...landing };
    delete older.supportThreadId;
    await openDesk(older);
    expect(screen.queryByRole("link", { name: "Open chat" })).not.toBeInTheDocument();
  });

  it("steps through the larger view with the buttons and arrow keys, wrapping at the ends", async () => {
    await openDesk(inApp);
    fireEvent.click(screen.getByRole("link", { name: "Open screenshot 2 of 3" }));
    const dialog = await screen.findByRole("dialog", { name: "Screenshot 2 of 3" });
    const larger = () => within(dialog).getByRole("img");
    expect(larger()).toHaveAttribute("src", inApp.screenshots[1].url);
    expect(within(dialog).getByRole("link", { name: "Open full size" })).toHaveAttribute("href", inApp.screenshots[1].url);

    fireEvent.click(within(dialog).getByRole("button", { name: "Next screenshot" }));
    expect(larger()).toHaveAttribute("src", inApp.screenshots[2].url);
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(larger()).toHaveAttribute("src", inApp.screenshots[0].url);
    expect(within(dialog).getByText("Screenshot 1 of 3")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(larger()).toHaveAttribute("src", inApp.screenshots[2].url);
    fireEvent.click(within(dialog).getByRole("button", { name: "Previous screenshot" }));
    expect(larger()).toHaveAttribute("src", inApp.screenshots[1].url);
  });

  it("offers no next or previous for a single screenshot", async () => {
    await openDesk({ ...landing, screenshots: [shot(0)] });
    fireEvent.click(screen.getByRole("link", { name: "Open screenshot 1 of 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Screenshot 1 of 1" });
    expect(within(dialog).queryByRole("button", { name: "Next screenshot" })).not.toBeInTheDocument();
  });

  it("leaves a modified click to open the picture in its own tab", async () => {
    await openDesk(inApp);
    fireEvent.click(screen.getByRole("link", { name: "Open screenshot 1 of 3" }), { ctrlKey: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not take the desk's verdict shortcuts from inside the larger view", async () => {
    await openDesk(inApp);
    fireEvent.click(screen.getByRole("link", { name: "Open screenshot 1 of 3" }));
    const dialog = await screen.findByRole("dialog", { name: "Screenshot 1 of 3" });
    fireEvent.keyDown(dialog, { key: "s" });
    fireEvent.keyDown(dialog, { key: "v" });
    fireEvent.keyDown(dialog, { key: "x" });
    expect(updateIssueReport).not.toHaveBeenCalled();
  });

  it("gets new links for a screenshot that did not load", async () => {
    await openDesk(inApp);
    fireEvent.click(screen.getByRole("link", { name: "Open screenshot 1 of 3" }));
    const dialog = await screen.findByRole("dialog", { name: "Screenshot 1 of 3" });
    fireEvent.error(within(dialog).getByRole("img"));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/did not load/);
    expect(within(dialog).queryByRole("link", { name: "Open full size" })).not.toBeInTheDocument();

    const fresh = { ...inApp.screenshots[0], url: "https://files.example/shot-0.png?sig=2" };
    showing({ ...inApp, screenshots: [fresh, ...inApp.screenshots.slice(1)] });
    fireEvent.click(within(dialog).getByRole("button", { name: "Get new links" }));
    await waitFor(() => expect(within(dialog).getByRole("img")).toHaveAttribute("src", fresh.url));
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });
});
