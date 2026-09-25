// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IssueReportsDesk, reportReference } from "@/components/issue-reports/IssueReportsDesk";

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
    expect(listIssueReports).toHaveBeenCalledWith("new");
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
    await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith("tracked"));
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
});
