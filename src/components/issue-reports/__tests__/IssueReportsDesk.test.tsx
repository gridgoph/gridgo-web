// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IssueReportsDesk, reportReference } from "@/components/issue-reports/IssueReportsDesk";

vi.stubGlobal("React", React);

const { listIssueReports, updateIssueReport } = vi.hoisted(() => ({
  listIssueReports: vi.fn(),
  updateIssueReport: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ listIssueReports, updateIssueReport }));

const report = {
  id: "50d4f603-c50a-4e95-93f8-107a1cd8cf91",
  issue: "Orders in Operations need a manual refresh.\nIt happens every morning.",
  category: "bug" as const,
  status: "new" as const,
  publishedIn: null,
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
  listIssueReports.mockResolvedValue({ reports: [report], counts: { new: 1, published: 2, dismissed: 0 } });
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
});
