// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IssueReportsDesk, reportReference } from "@/components/issue-reports/IssueReportsDesk";
import type { InvalidatePing } from "@/lib/api/types";
import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";

vi.stubGlobal("React", React);

const { listIssueReports, updateIssueReport } = vi.hoisted(() => ({
  listIssueReports: vi.fn(),
  updateIssueReport: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  listIssueReports,
  updateIssueReport,
  isApiError: (err: unknown) => err instanceof Error && "kind" in err,
}));

const TRACKER_URL = "https://github.com/gridgoph/gridgo-web/issues/62";

const report = {
  id: "50d4f603-c50a-4e95-93f8-107a1cd8cf91",
  issue: "Orders in Operations need a manual refresh.\nIt happens every morning.",
  category: "bug" as const,
  status: "new" as const,
  publishedIn: null,
  trackerIssueUrl: null,
  createdAt: "2026-09-24T09:37:12.000Z",
  updatedAt: "2026-09-24T09:37:12.000Z",
  screenshots: [
    {
      position: 0,
      contentType: "image/png",
      size: 254299,
      url: "https://files.example/issue_reports/a-1.png?sig=1",
      expiresAt: "2026-09-24T09:42:12.000Z",
    },
  ],
};

afterEach(() => cleanup());

beforeEach(() => {
  listIssueReports.mockReset();
  updateIssueReport.mockReset();
  listIssueReports.mockResolvedValue({ reports: [report], counts: { new: 1, tracked: 4, published: 2, dismissed: 0 } });
  updateIssueReport.mockResolvedValue({ ...report, status: "published" });
});

describe("IssueReportsDesk", () => {
  it("shows the first new report with its text, reference, category and screenshot", async () => {
    render(<IssueReportsDesk />);
    expect(await screen.findByRole("heading", { name: `Report ${reportReference(report.id)}` })).toBeInTheDocument();
    expect(reportReference(report.id)).toBe("50D4F603");
    expect(screen.getByText(/It happens every morning/)).toBeInTheDocument();
    expect(screen.getByText(/Bug, issue or concern/, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Screenshot 1/ })).toHaveAttribute("src", report.screenshots[0].url);
    expect(screen.getByRole("button", { name: "New · 1" })).toBeInTheDocument();
    expect(listIssueReports).toHaveBeenCalledWith("new", { limit: 25 });
  });

  it("marks a report published with the reports page date, then reloads", async () => {
    render(<IssueReportsDesk />);
    await screen.findByRole("heading", { name: /Report 50D4F603/ });
    listIssueReports.mockResolvedValue({ reports: [], counts: { new: 0, published: 3, dismissed: 0 } });
    fireEvent.change(screen.getByPlaceholderText("09-25-2026"), { target: { value: "09-25-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark published" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(report.id, { status: "published", publishedIn: "09-25-2026" }),
    );
    expect(await screen.findByText("No new reports")).toBeInTheDocument();
  });

  it("dismisses without a date", async () => {
    render(<IssueReportsDesk />);
    await screen.findByRole("heading", { name: /Report 50D4F603/ });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(report.id, { status: "dismissed", publishedIn: null }),
    );
  });

  it("says what went wrong when the list cannot load", async () => {
    listIssueReports.mockRejectedValue(new Error("offline"));
    render(<IssueReportsDesk />);
    expect(await screen.findByText(/Could not load issue reports/)).toBeInTheDocument();
  });

  it("puts a Tracked tab with its count between New and Published", async () => {
    render(<IssueReportsDesk />);
    await screen.findByRole("heading", { name: /Report 50D4F603/ });
    const group = screen.getByRole("group", { name: "Filter reports by status" });
    const tabs = within(group).getAllByRole("button").map((tab) => tab.textContent);
    expect(tabs).toEqual(["New · 1", "Tracked · 4", "Published · 2", "Dismissed · 0"]);

    listIssueReports.mockResolvedValue({ reports: [], counts: { new: 1, tracked: 0, published: 2, dismissed: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Tracked · 4" }));
    await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith("tracked", { limit: 25 }));
    expect(await screen.findByText("No tracked reports")).toBeInTheDocument();
  });

  it("counts Tracked as zero against an API that does not send it yet", async () => {
    listIssueReports.mockResolvedValue({ reports: [report], counts: { new: 1, published: 2, dismissed: 0 } });
    render(<IssueReportsDesk />);
    expect(await screen.findByRole("button", { name: "Tracked · 0" })).toBeInTheDocument();
  });

  it("links a tracked row to its GitHub issue in a new tab", async () => {
    listIssueReports.mockResolvedValue({
      reports: [{ ...report, status: "tracked", trackerIssueUrl: TRACKER_URL }],
      counts: { new: 0, tracked: 1, published: 0, dismissed: 0 },
    });
    render(<IssueReportsDesk />);
    const list = await screen.findByRole("list", { name: "Issue reports" });
    const link = await within(list).findByRole("link", { name: /Tracked: gridgo-web #62/ });
    expect(link).toHaveAttribute("href", TRACKER_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("Tracked: gridgo-web #62");
    // The detail panel carries the same link.
    expect(screen.getAllByRole("link", { name: /Tracked: gridgo-web #62/ })).toHaveLength(2);
  });

  it("shows both chips on a published report that was tracked", async () => {
    listIssueReports.mockResolvedValue({
      reports: [{ ...report, status: "published", publishedIn: "09-25-2026", trackerIssueUrl: TRACKER_URL }],
      counts: { new: 0, tracked: 0, published: 1, dismissed: 0 },
    });
    render(<IssueReportsDesk />);
    const list = await screen.findByRole("list", { name: "Issue reports" });
    expect(await within(list).findByText("Published 09-25-2026")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: /Tracked: gridgo-web #62/ })).toHaveAttribute("href", TRACKER_URL);
    fireEvent.click(screen.getByRole("button", { name: "Move back to Tracked" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(report.id, {
        status: "tracked",
        publishedIn: null,
        trackerIssueUrl: TRACKER_URL,
      }),
    );
  });

  it("marks a report tracked with a pasted GitHub issue link", async () => {
    render(<IssueReportsDesk />);
    await screen.findByRole("heading", { name: /Report 50D4F603/ });
    fireEvent.change(screen.getByLabelText("GitHub tracker issue"), {
      target: { value: ` ${TRACKER_URL}/#issuecomment-1 ` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark tracked" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(report.id, {
        status: "tracked",
        publishedIn: null,
        trackerIssueUrl: TRACKER_URL,
      }),
    );
  });

  it.each([
    ["", "Paste the GitHub issue link first."],
    ["https://github.com/someone-else/gridgo-web/issues/62", "Only issues in the gridgoph GitHub organisation can be linked."],
    ["https://github.com/gridgoph/gridgo-web/pull/62", "That is not a GitHub issue link."],
    ["gridgo-web #62", "That is not a GitHub issue link."],
  ])("refuses %j before sending it", async (value, message) => {
    render(<IssueReportsDesk />);
    await screen.findByRole("heading", { name: /Report 50D4F603/ });
    const input = screen.getByLabelText("GitHub tracker issue");
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Mark tracked" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(updateIssueReport).not.toHaveBeenCalled();
  });

  it("keeps the tracker link when a tracked report is published", async () => {
    listIssueReports.mockResolvedValue({
      reports: [{ ...report, status: "tracked", trackerIssueUrl: TRACKER_URL }],
      counts: { new: 0, tracked: 1, published: 0, dismissed: 0 },
    });
    render(<IssueReportsDesk />);
    await screen.findByRole("heading", { name: /Report 50D4F603/ });
    expect(screen.getByLabelText("GitHub tracker issue")).toHaveValue(TRACKER_URL);
    fireEvent.change(screen.getByPlaceholderText("09-25-2026"), { target: { value: "09-26-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark published" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(report.id, {
        status: "published",
        publishedIn: "09-26-2026",
        trackerIssueUrl: TRACKER_URL,
      }),
    );
  });

  it("reloads when issue reports change and keeps the open report", async () => {
    const open = {
      ...report,
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      issue: "Second report stays open",
    };
    const arrived = {
      ...report,
      id: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      issue: "A third report arrived",
    };
    listIssueReports.mockResolvedValue({
      reports: [report, open],
      counts: { new: 2, tracked: 0, published: 0, dismissed: 0 },
    });
    const listeners = new Set<(ping: InvalidatePing) => void>();
    const live: LiveContextValue = {
      notifications: [],
      unreadCount: 0,
      snapshot: null,
      live: true,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      markRead: async () => undefined,
      markAllRead: async () => undefined,
      remove: async () => undefined,
      refreshInbox: async () => undefined,
    };
    render(
      <LiveContext.Provider value={live}>
        <IssueReportsDesk />
      </LiveContext.Provider>,
    );
    await screen.findByRole("heading", { name: /Report 50D4F603/ });
    fireEvent.click(screen.getByRole("button", { name: /Second report stays open/ }));
    expect(await screen.findByRole("heading", { name: /Report AAAAAAAA/ })).toBeInTheDocument();
    const calls = listIssueReports.mock.calls.length;
    listIssueReports.mockResolvedValue({
      reports: [report, open, arrived],
      counts: { new: 3, tracked: 0, published: 0, dismissed: 0 },
    });
    for (const listener of listeners) listener({ resource: "issue-reports" });
    expect(await screen.findByRole("button", { name: /A third report arrived/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Report AAAAAAAA/ })).toBeInTheDocument();
    expect(listIssueReports.mock.calls.length).toBeGreaterThan(calls);
  });

  describe("paging", () => {
    const many = (count: number, from = 0) =>
      Array.from({ length: count }, (_, index) => ({
        ...report,
        id: `00000000-0000-4000-8000-${String(from + index).padStart(12, "0")}`,
        issue: `Report number ${from + index}`,
        screenshots: [],
      }));
    const COUNTS = { new: 30, tracked: 0, published: 0, dismissed: 0 };

    it("loads the first page, then the next one after the last report shown", async () => {
      const first = many(25);
      listIssueReports.mockResolvedValueOnce({ reports: first, counts: COUNTS });
      render(<IssueReportsDesk />);
      expect(await screen.findByText("Showing 25 of 30")).toBeInTheDocument();
      expect(listIssueReports).toHaveBeenCalledWith("new", { limit: 25 });

      listIssueReports.mockResolvedValueOnce({ reports: many(5, 25), counts: COUNTS });
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(await screen.findByText("30 reports")).toBeInTheDocument();
      expect(listIssueReports).toHaveBeenLastCalledWith("new", { limit: 25, before: first[24].id });
      expect(within(screen.getByRole("list", { name: "Issue reports" })).getAllByRole("listitem")).toHaveLength(30);
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
      // The tab counts stay the API's totals.
      expect(screen.getByRole("button", { name: "New · 30" })).toBeInTheDocument();
    });

    it("keeps every loaded page on a refresh", async () => {
      listIssueReports.mockResolvedValueOnce({ reports: many(25), counts: COUNTS });
      render(<IssueReportsDesk />);
      await screen.findByText("Showing 25 of 30");
      listIssueReports.mockResolvedValueOnce({ reports: many(5, 25), counts: COUNTS });
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await screen.findByText("30 reports");

      listIssueReports.mockResolvedValueOnce({ reports: many(30), counts: COUNTS });
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith("new", { limit: 50 }));
      expect(await screen.findByText("30 reports")).toBeInTheDocument();
    });

    it("grows the first page against an API that ignores before", async () => {
      const first = many(25);
      listIssueReports.mockResolvedValueOnce({ reports: first, counts: COUNTS });
      render(<IssueReportsDesk />);
      await screen.findByText("Showing 25 of 30");
      listIssueReports
        .mockResolvedValueOnce({ reports: first, counts: COUNTS })
        .mockResolvedValueOnce({ reports: many(30), counts: COUNTS });
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(await screen.findByText("30 reports")).toBeInTheDocument();
      expect(listIssueReports).toHaveBeenLastCalledWith("new", { limit: 50 });
    });

    it("says when the next page fails and offers to try again", async () => {
      listIssueReports.mockResolvedValueOnce({ reports: many(25), counts: COUNTS });
      render(<IssueReportsDesk />);
      await screen.findByText("Showing 25 of 30");
      listIssueReports.mockRejectedValueOnce(new Error("offline"));
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(await screen.findByText("Could not load more reports.")).toBeInTheDocument();
      listIssueReports.mockResolvedValueOnce({ reports: many(5, 25), counts: COUNTS });
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("30 reports")).toBeInTheDocument();
    });

    it("starts the new tab from its first page", async () => {
      listIssueReports.mockResolvedValueOnce({ reports: many(25), counts: { ...COUNTS, tracked: 40 } });
      render(<IssueReportsDesk />);
      await screen.findByText("Showing 25 of 30");
      listIssueReports.mockResolvedValueOnce({ reports: many(5, 25), counts: { ...COUNTS, tracked: 40 } });
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await screen.findByText("30 reports");
      listIssueReports.mockResolvedValueOnce({
        reports: many(25, 100).map((entry) => ({ ...entry, status: "tracked" as const, trackerIssueUrl: TRACKER_URL })),
        counts: { ...COUNTS, tracked: 40 },
      });
      fireEvent.click(screen.getByRole("button", { name: "Tracked · 40" }));
      await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith("tracked", { limit: 25 }));
      expect(await screen.findByText("Showing 25 of 40")).toBeInTheDocument();
    });
  });

  it("moves through reports with the arrow keys", async () => {
    const second = { ...report, id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", issue: "Second report" };
    listIssueReports.mockResolvedValue({ reports: [report, second], counts: { new: 2, tracked: 0, published: 0, dismissed: 0 } });
    render(<IssueReportsDesk />);
    await screen.findByRole("heading", { name: /Report 50D4F603/ });
    const firstRow = screen.getByRole("button", { name: /Orders in Operations/ });
    firstRow.focus();
    fireEvent.keyDown(firstRow, { key: "ArrowDown" });
    expect(await screen.findByRole("heading", { name: /Report AAAAAAAA/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Second report/ })).toHaveFocus();
    expect(screen.getByRole("button", { name: /Second report/ })).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(await screen.findByRole("heading", { name: /Report 50D4F603/ })).toBeInTheDocument();
  });

  it("opens the report below once the open one leaves the tab", async () => {
    const second = { ...report, id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", issue: "Second report" };
    const third = { ...report, id: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee", issue: "Third report" };
    listIssueReports.mockResolvedValue({ reports: [report, second, third], counts: { new: 3, tracked: 0, published: 0, dismissed: 0 } });
    render(<IssueReportsDesk />);
    await screen.findByRole("heading", { name: /Report 50D4F603/ });
    fireEvent.click(screen.getByRole("button", { name: /Second report/ }));
    await screen.findByRole("heading", { name: /Report AAAAAAAA/ });
    listIssueReports.mockResolvedValue({ reports: [report, third], counts: { new: 2, tracked: 0, published: 0, dismissed: 1 } });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(await screen.findByRole("heading", { name: /Report BBBBBBBB/ })).toBeInTheDocument();
  });

  describe("on a phone-sized screen", () => {
    beforeEach(() => {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.stubGlobal("React", React);
    });

    it("shows the list, opens a report full width, and goes back", async () => {
      render(<IssueReportsDesk />);
      const listPane = await screen.findByRole("complementary", { name: "Report list" });
      const reportPane = screen.getByRole("region", { name: "Open report" });
      await screen.findByRole("heading", { name: /Report 50D4F603/ });
      expect(listPane).not.toHaveClass("hidden");
      expect(reportPane).toHaveClass("hidden");

      fireEvent.click(screen.getByRole("button", { name: /Orders in Operations/ }));
      await waitFor(() => expect(listPane).toHaveClass("hidden"));
      expect(reportPane).not.toHaveClass("hidden");
      expect(screen.getByRole("heading", { name: /Report 50D4F603/ })).toHaveFocus();

      fireEvent.click(screen.getByRole("button", { name: "All reports" }));
      await waitFor(() => expect(reportPane).toHaveClass("hidden"));
      expect(listPane).not.toHaveClass("hidden");
      expect(screen.getByRole("button", { name: /Orders in Operations/ })).toHaveFocus();
    });
  });
});
