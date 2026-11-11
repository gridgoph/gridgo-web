// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IssueReportsDesk } from "@/components/issue-reports/IssueReportsDesk";
import type { IssueReport, IssueReportBugConfirmation } from "@/lib/api/types";

vi.stubGlobal("React", React);

class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

const { listIssueReports, updateIssueReport, getIssueReport, confirmIssueReportBug, search } = vi.hoisted(() => ({
  listIssueReports: vi.fn(),
  updateIssueReport: vi.fn(),
  getIssueReport: vi.fn(),
  confirmIssueReportBug: vi.fn(),
  search: { params: new URLSearchParams() },
}));

vi.mock("@/lib/api/client", () => ({
  listIssueReports,
  updateIssueReport,
  getIssueReport,
  confirmIssueReportBug,
  isApiError: (err: unknown) => err instanceof Error && "kind" in err,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => search.params,
  usePathname: () => "/ops/issue-reports",
}));

const COUNTS = { new: 1, tracked: 0, published: 0, dismissed: 0, priorities: 0 };
const triage = {
  validity: "unreviewed" as const,
  category: null,
  labels: [] as string[],
  duplicateOf: null,
  triagedBy: null,
  triagedAt: null,
};

const report: IssueReport = {
  id: "50d4f603-c50a-4e95-93f8-107a1cd8cf91",
  issue: "The rider map does not load on checkout",
  category: "bug",
  status: "new",
  publishedIn: null,
  trackerIssueUrl: null,
  createdAt: "2026-11-01T09:00:00.000Z",
  updatedAt: "2026-11-01T09:00:00.000Z",
  screenshots: [],
  triage,
  aiReview: null,
  reporter: { id: "usr_ana", name: "Ana", tester: true, bugRewardAvailable: true },
  bugConfirmation: null,
};

const granted: IssueReportBugConfirmation = {
  confirmedAt: "2026-11-02T08:00:00.000Z",
  confirmedBy: { id: "usr_ops", name: "Lea" },
  voucherOutcome: "granted",
  voucherGranted: true,
  reward: { id: "trwd_1", status: "issued", amountMinor: 1500, voucherId: "vch_1" },
};

function answer(reports: IssueReport[]) {
  return { reports, counts: COUNTS };
}

function refusal(status: number, code: string) {
  return Object.assign(new Error(code), { status, code, kind: status === 403 ? "forbidden" : "conflict" });
}

afterEach(() => cleanup());

beforeEach(() => {
  search.params = new URLSearchParams();
  window.history.replaceState(null, "", "/ops/issue-reports");
  listIssueReports.mockReset();
  updateIssueReport.mockReset();
  getIssueReport.mockReset();
  confirmIssueReportBug.mockReset();
  listIssueReports.mockResolvedValue(answer([report]));
});

async function realBug() {
  await screen.findByRole("heading", { name: "Report 50D4F603" });
  return screen.getByRole("region", { name: /Report 50D4F603 text/ });
}

describe("Confirm real bug", () => {
  it("says before the press that this tester gets the voucher, then shows the result on the report", async () => {
    confirmIssueReportBug.mockResolvedValue({
      ...report,
      triage: { ...triage, validity: "valid", category: "bug" },
      reporter: { ...report.reporter!, bugRewardAvailable: false },
      bugConfirmation: granted,
    });
    render(<IssueReportsDesk viewerId="usr_ops" />);
    const panel = await realBug();
    expect(within(panel).getByText("Ana · Founding Tester")).toBeInTheDocument();
    expect(within(panel).getByText("Ana gets a one-time ₱15.00 voucher.")).toBeInTheDocument();

    // Valid and Bug move it out of Needs review; it stays open to show the result.
    listIssueReports.mockResolvedValue(answer([]));
    fireEvent.click(within(panel).getByRole("button", { name: /Confirm real bug/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/marked Valid and sorted as a Bug. This cannot be undone/)).toBeInTheDocument();
    expect(within(dialog).getByTestId("confirm-bug-voucher")).toHaveTextContent("Ana gets a one-time ₱15.00 voucher.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm real bug" }));

    await waitFor(() => expect(confirmIssueReportBug).toHaveBeenCalledWith(report.id));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const after = screen.getByRole("region", { name: /Report 50D4F603 text/ });
    expect(screen.getByText("Confirmed bug")).toBeInTheDocument();
    expect(within(after).getByText("₱15.00 voucher sent")).toBeInTheDocument();
    expect(within(after).getByText(/^Confirmed by Lea on /)).toBeInTheDocument();
    expect(within(after).queryByRole("button", { name: /Confirm real bug/ })).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Kept open after confirming.");
  });

  it("tells staff when no voucher goes out", async () => {
    listIssueReports.mockResolvedValue(answer([{ ...report, reporter: null }]));
    render(<IssueReportsDesk viewerId="usr_ops" />);
    const panel = await realBug();
    expect(within(panel).getByText("Sent without signing in")).toBeInTheDocument();
    expect(within(panel).getByText("No voucher: it was sent without signing in.")).toBeInTheDocument();
  });

  it("disables the action with its reason on spam and on the viewer's own report", async () => {
    listIssueReports.mockResolvedValue(answer([{ ...report, triage: { ...triage, validity: "spam" } }]));
    search.params = new URLSearchParams("tab=spam");
    const { unmount } = render(<IssueReportsDesk viewerId="usr_ops" />);
    let panel = await realBug();
    expect(within(panel).getByRole("button", { name: /Confirm real bug/ })).toBeDisabled();
    expect(within(panel).getByText(/Marked spam/)).toBeInTheDocument();
    unmount();

    search.params = new URLSearchParams();
    listIssueReports.mockResolvedValue(answer([report]));
    render(<IssueReportsDesk viewerId="usr_ana" />);
    panel = await realBug();
    expect(within(panel).getByRole("button", { name: /Confirm real bug/ })).toBeDisabled();
    expect(within(panel).getByText("You sent this report, so a teammate confirms it.")).toBeInTheDocument();
  });

  it("explains a 409 and a 403 in plain words and keeps the report unconfirmed", async () => {
    render(<IssueReportsDesk viewerId="usr_ops" />);
    const panel = await realBug();
    confirmIssueReportBug.mockRejectedValueOnce(refusal(409, "issue_report_not_confirmable"));
    fireEvent.click(within(panel).getByRole("button", { name: /Confirm real bug/ }));
    let dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm real bug" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Spam and duplicate reports cannot be confirmed/);
    // The report changed underneath; the desk reloads it.
    await waitFor(() => expect(listIssueReports.mock.calls.length).toBeGreaterThan(1));

    confirmIssueReportBug.mockRejectedValueOnce(refusal(403, "issue_report_self_confirmation"));
    dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm real bug" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("You sent this report, so a teammate has to confirm it.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(within(panel).getByRole("button", { name: /Confirm real bug/ })).toBeEnabled();
  });

  it("shows a paused voucher and who confirmed it on an already confirmed report", async () => {
    listIssueReports.mockResolvedValue(
      answer([
        {
          ...report,
          triage: { ...triage, validity: "valid", category: "bug" },
          bugConfirmation: {
            ...granted,
            voucherOutcome: "paused",
            voucherGranted: false,
            reward: { id: "trwd_1", status: "paused", amountMinor: 1500, voucherId: null },
          },
        },
      ]),
    );
    search.params = new URLSearchParams("tab=valid");
    render(<IssueReportsDesk viewerId="usr_ops" />);
    const panel = await realBug();
    expect(within(panel).getByText("Voucher on hold")).toBeInTheDocument();
    expect(within(panel).getByText(/tester budget is used up/)).toBeInTheDocument();
    expect(screen.getByText("Confirmed bug")).toBeInTheDocument();
  });

  it("shows nothing new against an API without the reporter fields", async () => {
    const older: IssueReport = { ...report };
    delete older.reporter;
    delete older.bugConfirmation;
    listIssueReports.mockResolvedValue(answer([older]));
    render(<IssueReportsDesk viewerId="usr_ops" />);
    const panel = await realBug();
    expect(within(panel).queryByRole("button", { name: /Confirm real bug/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("heading", { name: "Real bug" })).not.toBeInTheDocument();
  });
});
