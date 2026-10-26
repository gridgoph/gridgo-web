// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IssueReportsDesk } from "@/components/issue-reports/IssueReportsDesk";
import type { IssueReport, IssueReportTriageCounts } from "@/lib/api/types";

vi.stubGlobal("React", React);

// Base UI's checkbox dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

const { listIssueReports, updateIssueReport, getIssueReport, search } = vi.hoisted(() => ({
  listIssueReports: vi.fn(),
  updateIssueReport: vi.fn(),
  getIssueReport: vi.fn(),
  search: { params: new URLSearchParams() },
}));

vi.mock("@/lib/api/client", () => ({
  listIssueReports,
  updateIssueReport,
  getIssueReport,
  isApiError: (err: unknown) => err instanceof Error && "kind" in err,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => search.params,
  usePathname: () => "/ops/issue-reports",
}));

const REVIEW = { validity: ["unreviewed"] };
const COUNTS = { new: 2, tracked: 0, published: 0, dismissed: 0, priorities: 0 };

const triage = {
  validity: "unreviewed" as const,
  category: null,
  labels: [] as string[],
  duplicateOf: null,
  triagedBy: null,
  triagedAt: null,
};

const first: IssueReport = {
  id: "50d4f603-c50a-4e95-93f8-107a1cd8cf91",
  issue: "Buy cheap followers at example.com",
  category: "other",
  status: "new",
  publishedIn: null,
  trackerIssueUrl: null,
  createdAt: "2026-10-23T09:37:12.000Z",
  updatedAt: "2026-10-23T09:37:12.000Z",
  screenshots: [],
  triage,
  aiReview: null,
};

const second: IssueReport = {
  ...first,
  id: "aaaa0002-0000-4000-8000-000000000002",
  issue: "The rider map does not load on checkout",
  category: "bug",
};

const triageCounts = (overrides: Partial<IssueReportTriageCounts> = {}): IssueReportTriageCounts => ({
  validity: { unreviewed: 2, valid: 0, spam: 1, duplicate: 0 },
  aiReviewed: 1,
  aiAwaitingHuman: 1,
  labels: [
    { label: "checkout", count: 3 },
    { label: "map", count: 1 },
  ],
  ...overrides,
});

function answer(reports: IssueReport[], extra: Partial<IssueReportTriageCounts> = {}) {
  return { reports, counts: COUNTS, triageCounts: triageCounts(extra) };
}

afterEach(() => cleanup());

beforeEach(() => {
  search.params = new URLSearchParams();
  window.history.replaceState(null, "", "/ops/issue-reports");
  listIssueReports.mockReset();
  updateIssueReport.mockReset();
  getIssueReport.mockReset();
  listIssueReports.mockResolvedValue(answer([first, second]));
});

async function opened() {
  return screen.findByRole("heading", { name: "Report 50D4F603" });
}

describe("verdicts", () => {
  it("marks a report valid in one press and keeps it open where it stays in view", async () => {
    search.params = new URLSearchParams("tab=all");
    updateIssueReport.mockResolvedValue({ ...first, triage: { ...triage, validity: "valid" } });
    render(<IssueReportsDesk />);
    await opened();
    const verdicts = screen.getByRole("group", { name: "Is it real?" });
    listIssueReports.mockResolvedValue(answer([{ ...first, triage: { ...triage, validity: "valid" } }, second]));
    fireEvent.click(within(verdicts).getByRole("button", { name: /^Valid/ }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(first.id, { triage: { validity: "valid" } }),
    );
    expect(await within(verdicts).findByRole("button", { name: /Marked valid/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Report 50D4F603" })).toBeInTheDocument();
  });

  it("hides a report marked spam, opens the next one, and can undo", async () => {
    updateIssueReport.mockResolvedValueOnce({ ...first, triage: { ...triage, validity: "spam" } });
    render(<IssueReportsDesk />);
    await opened();
    listIssueReports.mockResolvedValue(answer([second]));
    fireEvent.click(within(screen.getByRole("group", { name: "Is it real?" })).getByRole("button", { name: /^Spam/ }));
    expect(await screen.findByRole("heading", { name: "Report AAAA0002" })).toBeInTheDocument();
    expect(updateIssueReport).toHaveBeenCalledWith(first.id, { triage: { validity: "spam" } });
    expect(screen.getByText(/Report 50D4F603 marked spam and moved out of this view/)).toBeInTheDocument();

    updateIssueReport.mockResolvedValueOnce(first);
    listIssueReports.mockResolvedValue(answer([first, second]));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenLastCalledWith(first.id, { triage: { validity: "unreviewed" } }),
    );
    expect(await screen.findByRole("heading", { name: "Report 50D4F603" })).toBeInTheDocument();
  });

  it("takes V, S and D from the keyboard, but not while typing", async () => {
    updateIssueReport.mockResolvedValue({ ...first, triage: { ...triage, validity: "duplicate" } });
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.keyDown(screen.getByLabelText("Labels"), { key: "s" });
    expect(updateIssueReport).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button", { name: /Buy cheap followers/ }), { key: "d" });
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(first.id, { triage: { validity: "duplicate" } }),
    );
  });

  it("puts a verdict back to Needs review", async () => {
    const valid = { ...first, triage: { ...triage, validity: "valid" as const } };
    listIssueReports.mockResolvedValue(answer([valid]));
    updateIssueReport.mockResolvedValue(first);
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.click(screen.getByRole("button", { name: "Back to Needs review" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(first.id, { triage: { validity: "unreviewed" } }),
    );
  });

  it("records which report a duplicate repeats, by its reference", async () => {
    const duplicate = { ...first, triage: { ...triage, validity: "duplicate" as const } };
    listIssueReports.mockResolvedValue(answer([duplicate, second]));
    updateIssueReport.mockResolvedValue({ ...duplicate, triage: { ...duplicate.triage, duplicateOf: second.id } });
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.change(screen.getByLabelText("Repeats report"), { target: { value: "aaaa0002" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(first.id, { triage: { duplicateOf: second.id } }),
    );
  });

  it("says why a triage change was refused", async () => {
    updateIssueReport.mockRejectedValue(Object.assign(new Error("bad"), { kind: "validation", code: "invalid_request" }));
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.click(within(screen.getByRole("group", { name: "Is it real?" })).getByRole("button", { name: /^Valid/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The server refused that change");
  });
});

describe("category and labels", () => {
  it("sets the staff category without touching the reporter's", async () => {
    const user = userEvent.setup();
    updateIssueReport.mockResolvedValue({ ...first, triage: { ...triage, category: "feedback" } });
    render(<IssueReportsDesk />);
    await opened();
    expect(screen.getByText(/Reporter picked Something else/)).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Category of report 50D4F603" }));
    await user.click(await screen.findByRole("option", { name: "Feedback" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(first.id, { triage: { category: "feedback" } }),
    );
  });

  it("adds a label as the API stores it, refuses a bad one, and removes one", async () => {
    const labelled = { ...first, triage: { ...triage, labels: ["map"] } };
    listIssueReports.mockResolvedValue(answer([labelled]));
    updateIssueReport.mockResolvedValue(labelled);
    render(<IssueReportsDesk />);
    await opened();
    const input = screen.getByLabelText("Labels");
    fireEvent.change(input, { target: { value: "Rider Checkout" } });
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(first.id, { triage: { labels: ["map", "rider-checkout"] } }),
    );

    fireEvent.change(input, { target: { value: "no!" } });
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    expect(await screen.findByText(/Use lowercase letters/)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(updateIssueReport).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Remove label map" }));
    await waitFor(() => expect(updateIssueReport).toHaveBeenLastCalledWith(first.id, { triage: { labels: [] } }));
  });

  it("shows the category and labels on the list row", async () => {
    listIssueReports.mockResolvedValue(
      answer([{ ...first, triage: { ...triage, validity: "valid", category: "bug", labels: ["map", "checkout"] } }]),
    );
    render(<IssueReportsDesk />);
    const list = await screen.findByRole("list", { name: "Issue reports" });
    for (const token of ["Bug", "#map", "#checkout"]) expect(within(list).getByText(token)).toBeInTheDocument();
    expect(within(list).getByText("Valid")).toBeInTheDocument();
  });
});

describe("AI review", () => {
  const reviewed = {
    ...first,
    aiReview: {
      reviewedAt: "2026-10-23T10:00:00.000Z",
      validity: "spam" as const,
      category: "other" as const,
      labels: ["promo"],
      duplicateOf: null,
      note: "Advertising, see https://github.com/gridgoph/gridgo-api/issues/9",
      outcome: "pending" as const,
    },
  };

  it("shows the suggestion as waiting for a person and takes it in one press", async () => {
    listIssueReports.mockResolvedValue(answer([reviewed, second]));
    updateIssueReport.mockResolvedValue(reviewed);
    const { container } = render(<IssueReportsDesk />);
    await opened();
    const list = screen.getByRole("list", { name: "Issue reports" });
    expect(within(list).getByText("Suggested: Spam")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "AI suggestion" });
    expect(within(card).getByText("Waiting for a person")).toBeInTheDocument();
    expect(within(card).getByText("Suggested: Spam")).toBeInTheDocument();
    // Operations never sees a GitHub link, the AI's note included.
    expect(within(card).getByText(/Advertising, see \[link hidden\]/)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/github/i);
    const verdicts = screen.getByRole("group", { name: "Is it real?" });
    fireEvent.click(within(verdicts).getByRole("button", { name: "Accept suggestion: Spam" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(first.id, {
        triage: { validity: "spam", category: "other", labels: ["promo"] },
      }),
    );
  });

  it("says who confirmed or overrode it", async () => {
    const by = { ...triage, validity: "spam" as const, triagedBy: { id: "u1", name: "Ana" }, triagedAt: "2026-10-23T11:00:00.000Z" };
    listIssueReports.mockResolvedValue(
      answer([{ ...reviewed, triage: by, aiReview: { ...reviewed.aiReview, outcome: "confirmed" } }], {}),
    );
    render(<IssueReportsDesk />);
    await opened();
    const card = screen.getByRole("region", { name: "AI suggestion" });
    expect(within(card).getByText("Confirmed by Ana")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept suggestion/ })).toBeNull();
    expect(screen.getByText(/Last sorted by Ana/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Issue reports" })).getByText("Matches the suggestion")).toBeInTheDocument();
  });

  it("says when AI has not reviewed a report", async () => {
    render(<IssueReportsDesk />);
    await opened();
    expect(screen.getByText(/Not reviewed by AI yet/)).toBeInTheDocument();
  });
});

describe("validity tabs", () => {
  it("counts every tab from the triage totals and keeps the open tab in the URL", async () => {
    render(<IssueReportsDesk />);
    await opened();
    const tabs = within(screen.getByRole("tablist", { name: "Reports by verdict" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Needs review, 2",
      "Valid, 0",
      "Duplicate, 0",
      "Spam, 1",
      "All, 3",
    ]);
    expect(listIssueReports).toHaveBeenCalledWith(null, { limit: 25 }, REVIEW);
    expect(screen.getByText("2 reports wait for a verdict, 1 with an AI suggestion.")).toBeInTheDocument();

    listIssueReports.mockResolvedValue(answer([{ ...first, triage: { ...triage, validity: "spam" } }]));
    fireEvent.click(screen.getByRole("tab", { name: "Spam, 1" }));
    await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith(null, { limit: 25 }, { validity: ["spam"] }));
    await waitFor(() => expect(window.location.search).toContain("tab=spam"));

    fireEvent.click(screen.getByRole("tab", { name: "All, 3" }));
    await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith(null, { limit: 25 }, {}));
  });

  it("opens on the tab and filters a shared link names", async () => {
    search.params = new URLSearchParams("tab=duplicate&status=tracked&label=checkout");
    render(<IssueReportsDesk />);
    await waitFor(() =>
      expect(listIssueReports).toHaveBeenCalledWith("tracked", { limit: 25 }, { validity: ["duplicate"], label: "checkout" }),
    );
    expect(screen.getByRole("tab", { name: "Duplicate, 0" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("validity labels and suggestions", () => {
  const original = { ...second, id: "3c7d1e2f-0000-4000-8000-000000000001", issue: "The map is blank" };
  const repeat: IssueReport = {
    ...first,
    issue: "Map is blank again",
    aiReview: {
      reviewedAt: "2026-10-27T01:00:00.000Z",
      validity: "duplicate",
      category: "bug",
      labels: ["client-app"],
      duplicateOf: original.id,
      note: "Same blank map as the earlier report.",
      outcome: "pending",
    },
  };

  it("badges every row's verdict and shows the suggestion apart from it", async () => {
    const valid = { ...second, triage: { ...triage, validity: "valid" as const } };
    listIssueReports.mockResolvedValue(answer([repeat, valid]));
    render(<IssueReportsDesk />);
    await opened();
    const list = screen.getByRole("list", { name: "Issue reports" });
    const [row, other] = within(list).getAllByRole("listitem");
    expect(within(row).getByText("Needs review")).toBeInTheDocument();
    expect(within(row).getByText("Suggested: Duplicate of 3C7D1E2F")).toBeInTheDocument();
    expect(within(row).getByText(/Same blank map as the earlier report/)).toBeInTheDocument();
    expect(within(row).getByText("Suggestion note:")).toHaveClass("sr-only");
    expect(within(other).getByText("Valid")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "AI suggestion" });
    expect(within(card).getByText("Suggested: Duplicate")).toBeInTheDocument();
    expect(within(card).getByText(/Same blank map as the earlier report/)).toBeInTheDocument();
  });

  it("links a duplicate to the report it repeats, opening it even outside the view", async () => {
    listIssueReports.mockResolvedValue(answer([repeat]));
    getIssueReport.mockResolvedValue({ ...original, triage: { ...triage, validity: "valid" } });
    render(<IssueReportsDesk />);
    await opened();
    const link = within(screen.getByRole("region", { name: "AI suggestion" })).getByRole("link", { name: "Report 3C7D1E2F" });
    expect(link).toHaveAttribute("href", `/ops/issue-reports?tab=all&report=${original.id}`);
    fireEvent.click(link);
    expect(await screen.findByRole("heading", { name: "Report 3C7D1E2F" })).toBeInTheDocument();
    expect(getIssueReport).toHaveBeenCalledWith(original.id);
    expect(screen.getByRole("note")).toHaveTextContent("not in this view: it is valid and new");
  });

  function deferred() {
    let resolve!: (report: IssueReport) => void;
    const promise = new Promise<IssueReport>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  it("waits on an outside report by name, then drops it if another report was opened first", async () => {
    listIssueReports.mockResolvedValue(answer([repeat, second]));
    const read = deferred();
    getIssueReport.mockReturnValue(read.promise);
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.click(within(screen.getByRole("region", { name: "AI suggestion" })).getByRole("link", { name: "Report 3C7D1E2F" }));
    expect(await screen.findByText("Opening report 3C7D1E2F…")).toBeInTheDocument();
    // Nothing can act on the report it is leaving.
    expect(screen.queryByRole("group", { name: "Is it real?" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Report 50D4F603" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /rider map does not load/ }));
    expect(await screen.findByRole("heading", { name: "Report AAAA0002" })).toBeInTheDocument();
    await act(async () => read.resolve({ ...original, triage: { ...triage, validity: "valid" } }));
    expect(screen.getByRole("heading", { name: "Report AAAA0002" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Report 3C7D1E2F" })).toBeNull();
    expect(window.location.search).toContain(`report=${second.id}`);
  });

  it("drops an outside report when the tab changes while it loads", async () => {
    listIssueReports.mockResolvedValue(answer([repeat]));
    const read = deferred();
    getIssueReport.mockReturnValue(read.promise);
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.click(within(screen.getByRole("region", { name: "AI suggestion" })).getByRole("link", { name: "Report 3C7D1E2F" }));
    await screen.findByText("Opening report 3C7D1E2F…");
    listIssueReports.mockResolvedValue(answer([second]));
    fireEvent.click(screen.getByRole("tab", { name: /^Valid/ }));
    expect(await screen.findByRole("heading", { name: "Report AAAA0002" })).toBeInTheDocument();
    await act(async () => read.resolve({ ...original, triage: { ...triage, validity: "valid" } }));
    expect(screen.queryByRole("heading", { name: "Report 3C7D1E2F" })).toBeNull();
    expect(screen.queryByText(/Opening report/)).toBeNull();
  });

  it("refreshes an outside report along with the list", async () => {
    listIssueReports.mockResolvedValue(answer([repeat]));
    getIssueReport.mockResolvedValue({ ...original, triage: { ...triage, validity: "valid" } });
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.click(within(screen.getByRole("region", { name: "AI suggestion" })).getByRole("link", { name: "Report 3C7D1E2F" }));
    await screen.findByRole("heading", { name: "Report 3C7D1E2F" });
    getIssueReport.mockResolvedValue({ ...original, issue: "The map is blank, now on iOS too", triage: { ...triage, validity: "valid" } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh reports" }));
    expect(await screen.findByText("The map is blank, now on iOS too")).toBeInTheDocument();
    expect(getIssueReport).toHaveBeenCalledTimes(2);
  });
});

describe("accept suggestion", () => {
  const suggested: IssueReport = {
    ...second,
    aiReview: {
      reviewedAt: "2026-10-27T01:00:00.000Z",
      validity: "valid",
      category: "bug",
      labels: ["client-app"],
      duplicateOf: null,
      note: null,
      outcome: "pending",
    },
  };

  it("accepts one row's suggestion in one press and keeps the open report", async () => {
    listIssueReports.mockResolvedValue(answer([first, suggested]));
    updateIssueReport.mockResolvedValue({ ...suggested, triage: { ...triage, validity: "valid" } });
    render(<IssueReportsDesk />);
    await opened();
    listIssueReports.mockResolvedValue(answer([first]));
    fireEvent.click(screen.getByRole("button", { name: "Accept suggestion for report AAAA0002: Valid" }));
    await waitFor(() =>
      expect(updateIssueReport).toHaveBeenCalledWith(suggested.id, {
        triage: { validity: "valid", category: "bug", labels: ["client-app"] },
      }),
    );
    expect(await screen.findByRole("heading", { name: "Report 50D4F603" })).toBeInTheDocument();
  });

  it("accepts the open report's suggestion with A", async () => {
    listIssueReports.mockResolvedValue(answer([suggested]));
    updateIssueReport.mockResolvedValue({ ...suggested, triage: { ...triage, validity: "valid" } });
    render(<IssueReportsDesk />);
    const row = await screen.findByRole("button", { name: /rider map does not load/ });
    fireEvent.keyDown(row, { key: "a" });
    await waitFor(() => expect(updateIssueReport).toHaveBeenCalledTimes(1));
  });
});

describe("bulk actions", () => {
  const withSuggestion = (report: IssueReport, validity: "valid" | "spam"): IssueReport => ({
    ...report,
    aiReview: {
      reviewedAt: "2026-10-27T01:00:00.000Z",
      validity,
      category: null,
      labels: [],
      duplicateOf: null,
      note: null,
      outcome: "pending",
    },
  });
  const third: IssueReport = { ...second, id: "aaaa0003-0000-4000-8000-000000000003", issue: "Third report" };

  it("accepts every selected suggestion one at a time and names the one that failed", async () => {
    const reports = [withSuggestion(first, "spam"), withSuggestion(second, "valid"), third];
    listIssueReports.mockResolvedValue(answer(reports));
    updateIssueReport.mockImplementation(async (id: string) => {
      if (id === second.id) throw Object.assign(new Error("gone"), { kind: "not_found", code: "issue_report_not_found" });
      return { ...reports[0], triage: { ...triage, validity: "spam" } };
    });
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all 3 shown" }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();

    listIssueReports.mockResolvedValue(answer([withSuggestion(second, "valid"), third]));
    fireEvent.click(screen.getByRole("button", { name: "Accept suggestion" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("They become 1 spam, 1 valid.");
    expect(confirm).toHaveTextContent("Left as they are: 1 no suggestion yet.");
    fireEvent.click(within(confirm).getByRole("button", { name: "Accept 2 suggestions" }));

    const result = await screen.findByText(/1 saved\. 1 could not be saved\. 1 left as they were\./);
    expect(result.closest("[role=alert]")).not.toBeNull();
    expect(updateIssueReport.mock.calls.map((call) => call[0])).toEqual([first.id, second.id]);
    expect(screen.getByRole("list", { name: "Reports not saved" })).toHaveTextContent(
      "Report AAAA0002: This report no longer exists.",
    );
    // Only the failed report stays selected, ready to retry.
    await waitFor(() => expect(screen.getByText("1 selected")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Select report AAAA0002" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Retry the failed report" })).toBeInTheDocument();
  });

  it("retries only the report that failed, with its write, whatever is selected now", async () => {
    const reports = [withSuggestion(first, "valid"), withSuggestion(second, "valid")];
    listIssueReports.mockResolvedValue(answer(reports));
    updateIssueReport.mockRejectedValueOnce(new Error("offline"));
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select report 50D4F603" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept suggestion" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Accept 1 suggestion" }));
    const retry = await screen.findByRole("button", { name: "Retry the failed report" });
    const failedWrite = updateIssueReport.mock.calls[0][1];

    // The reader moves the selection on before retrying.
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select report 50D4F603" })).toBeChecked());
    fireEvent.click(screen.getByRole("checkbox", { name: "Select report 50D4F603" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select report AAAA0002" }));
    updateIssueReport.mockResolvedValue({ ...reports[0], triage: { ...triage, validity: "valid" } });
    fireEvent.click(retry);

    expect(await screen.findByText(/1 saved\./)).toBeInTheDocument();
    expect(updateIssueReport).toHaveBeenCalledTimes(2);
    expect(updateIssueReport).toHaveBeenLastCalledWith(first.id, failedWrite);
  });

  it("finishes a stopped run only for the reports it never reached, after a confirm", async () => {
    const reports = [withSuggestion(first, "spam"), withSuggestion(second, "valid"), withSuggestion(third, "valid")];
    listIssueReports.mockResolvedValue(answer(reports));
    let land!: (report: IssueReport) => void;
    updateIssueReport.mockReturnValueOnce(
      new Promise<IssueReport>((done) => {
        land = done;
      }),
    );
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all 3 shown" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept suggestion" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Accept 3 suggestions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await act(async () => land({ ...reports[0], triage: { ...triage, validity: "spam" } }));
    expect(await screen.findByText(/1 saved\. Stopped before 2 more\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull();

    updateIssueReport.mockImplementation(async (id: string) => ({ ...first, id, triage: { ...triage, validity: "valid" } }));
    fireEvent.click(screen.getByRole("button", { name: "Finish the 2 not tried…" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByRole("list", { name: "Reports not tried" })).toHaveTextContent("Report AAAA0002");
    expect(updateIssueReport).toHaveBeenCalledTimes(1);
    fireEvent.click(within(confirm).getByRole("button", { name: "Accept 2 suggestions" }));
    await waitFor(() => expect(updateIssueReport).toHaveBeenCalledTimes(3));
    expect(updateIssueReport.mock.calls.slice(1).map((call) => call[0])).toEqual([second.id, third.id]);
  });

  it("marks the selection a duplicate of one report by its reference", async () => {
    listIssueReports.mockResolvedValue(answer([first, second, third]));
    updateIssueReport.mockImplementation(async (id: string) => ({ ...first, id, triage: { ...triage, validity: "duplicate" } }));
    const user = userEvent.setup();
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select report AAAA0002" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select report AAAA0003" }));
    await user.click(screen.getByRole("button", { name: "Mark as" }));
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate of…" }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.change(within(confirm).getByLabelText("They repeat report"), { target: { value: "50d4f603" } });
    fireEvent.click(within(confirm).getByRole("button", { name: "Mark 2 reports duplicate of 50D4F603" }));
    await waitFor(() => expect(updateIssueReport).toHaveBeenCalledTimes(2));
    expect(updateIssueReport).toHaveBeenNthCalledWith(1, second.id, { triage: { validity: "duplicate", duplicateOf: first.id } });
    expect(updateIssueReport).toHaveBeenNthCalledWith(2, third.id, { triage: { validity: "duplicate", duplicateOf: first.id } });
    expect(await screen.findByText(/2 saved\./)).toBeInTheDocument();
  });

  it("moves the selection to a status without any tracker link", async () => {
    listIssueReports.mockResolvedValue(answer([first, second]));
    updateIssueReport.mockImplementation(async (id: string) => ({ ...first, id, status: "dismissed" }));
    const user = userEvent.setup();
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all 2 shown" }));
    await user.click(screen.getByRole("button", { name: "Set status" }));
    await user.click(await screen.findByRole("menuitem", { name: "Dismissed" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Move 2 reports to Dismissed" }));
    await waitFor(() => expect(updateIssueReport).toHaveBeenCalledTimes(2));
    expect(updateIssueReport).toHaveBeenCalledWith(first.id, { status: "dismissed", publishedIn: null });
  });
});

describe("filters and chips", () => {
  it("narrows by category, label and suggestion, each shown as a removable chip", async () => {
    const user = userEvent.setup();
    render(<IssueReportsDesk />);
    await opened();
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Bug" }));
    await waitFor(() =>
      expect(listIssueReports).toHaveBeenLastCalledWith(null, { limit: 25 }, { ...REVIEW, triageCategory: ["bug"] }),
    );
    await user.click(screen.getByRole("combobox", { name: "Label" }));
    await user.click(await screen.findByRole("option", { name: "checkout (3)" }));
    await user.click(screen.getByRole("combobox", { name: "Suggestion" }));
    await user.click(await screen.findByRole("option", { name: "No suggestion yet" }));
    await waitFor(() =>
      expect(listIssueReports).toHaveBeenLastCalledWith(
        null,
        { limit: 25 },
        { ...REVIEW, triageCategory: ["bug"], label: "checkout", aiReviewed: false },
      ),
    );
    const chips = screen.getByRole("list", { name: "Filters in use" });
    expect(within(chips).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Category: Bug",
      "Label: checkout",
      "No suggestion yet",
      "Clear all",
    ]);
    fireEvent.click(within(chips).getByRole("button", { name: "Remove filter Label: checkout" }));
    await waitFor(() =>
      expect(listIssueReports).toHaveBeenLastCalledWith(
        null,
        { limit: 25 },
        { ...REVIEW, triageCategory: ["bug"], aiReviewed: false },
      ),
    );
    fireEvent.click(within(screen.getByRole("list", { name: "Filters in use" })).getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith(null, { limit: 25 }, REVIEW));
    expect(screen.queryByRole("list", { name: "Filters in use" })).toBeNull();
  });

  it("dates the Received window from now", async () => {
    const user = userEvent.setup();
    render(<IssueReportsDesk />);
    await opened();
    await user.click(screen.getByRole("combobox", { name: "Received" }));
    await user.click(await screen.findByRole("option", { name: "Last 7 days" }));
    await waitFor(() => expect(listIssueReports.mock.calls.at(-1)?.[2]).toHaveProperty("since"));
    const since = Date.parse(listIssueReports.mock.calls.at(-1)![2].since);
    expect(Date.now() - since).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000);
    expect(screen.getByRole("list", { name: "Filters in use" })).toHaveTextContent("Received: last 7 days");
  });

  it("searches the loaded reports in the browser, reading every page at once", async () => {
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search reports" }), { target: { value: "rider map" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith(null, { limit: 500 }, REVIEW));
    const list = await screen.findByRole("list", { name: "Issue reports" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
    expect(within(list).getByText(/rider map does not load/)).toBeInTheDocument();
    expect(screen.getByText("1 match")).toBeInTheDocument();
  });

  it("keeps focus in the search box after Clear search", async () => {
    render(<IssueReportsDesk />);
    await opened();
    const box = screen.getByRole("searchbox", { name: "Search reports" });
    fireEvent.change(box, { target: { value: "rider" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(box).toHaveValue("");
    expect(box).toHaveFocus();
  });

  it("drops a search still waiting to apply when Clear all is pressed", async () => {
    search.params = new URLSearchParams("status=new");
    render(<IssueReportsDesk />);
    await opened();
    const box = screen.getByRole("searchbox", { name: "Search reports" });
    fireEvent.change(box, { target: { value: "rider" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await new Promise((done) => setTimeout(done, 400));
    expect(box).toHaveValue("");
    expect(screen.queryByRole("list", { name: "Filters in use" })).toBeNull();
    expect(window.location.search).not.toContain("q=");
  });

  it("offers to clear filters that match nothing", async () => {
    search.params = new URLSearchParams("label=map");
    listIssueReports.mockResolvedValue(answer([]));
    render(<IssueReportsDesk />);
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
    listIssueReports.mockResolvedValue(answer([first]));
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith(null, { limit: 25 }, REVIEW));
  });

  it("pages a filtered list by whether the last page came back full", async () => {
    search.params = new URLSearchParams("status=new");
    const many = Array.from({ length: 25 }, (_, index) => ({
      ...second,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      issue: `Report ${index}`,
    }));
    listIssueReports.mockResolvedValue({ reports: many, counts: { ...COUNTS, new: 25 }, triageCounts: triageCounts() });
    render(<IssueReportsDesk />);
    // New · 25 counts every verdict, so the desk does not claim the list is whole.
    expect(await screen.findByText("25 reports")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });
});
