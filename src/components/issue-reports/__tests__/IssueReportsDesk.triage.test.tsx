// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IssueReportsDesk } from "@/components/issue-reports/IssueReportsDesk";
import type { IssueReport, IssueReportTriageCounts } from "@/lib/api/types";

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

const NOT_SPAM = { validity: ["unreviewed", "valid", "duplicate"] };
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
  listIssueReports.mockReset();
  updateIssueReport.mockReset();
  listIssueReports.mockResolvedValue(answer([first, second]));
});

async function opened() {
  return screen.findByRole("heading", { name: "Report 50D4F603" });
}

describe("verdicts", () => {
  it("marks a report valid in one press and keeps it open", async () => {
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
    expect(screen.getByText(/Report 50D4F603 marked spam and hidden by your filters/)).toBeInTheDocument();

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

  it("puts a verdict back to To review", async () => {
    const valid = { ...first, triage: { ...triage, validity: "valid" as const } };
    listIssueReports.mockResolvedValue(answer([valid]));
    updateIssueReport.mockResolvedValue(first);
    render(<IssueReportsDesk />);
    await opened();
    fireEvent.click(screen.getByRole("button", { name: "Back to To review" }));
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
    expect(within(list).getByText("AI suggests spam")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "AI suggestion" });
    expect(within(card).getByText("Waiting for a person")).toBeInTheDocument();
    expect(within(card).getByText("Spam")).toBeInTheDocument();
    // Operations never sees a GitHub link, the AI's note included.
    expect(within(card).getByText(/Advertising, see \[link hidden\]/)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/github/i);
    fireEvent.click(within(card).getByRole("button", { name: "Use AI suggestion" }));
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
    expect(within(card).queryByRole("button", { name: "Use AI suggestion" })).toBeNull();
    expect(screen.getByText(/Last sorted by Ana/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Issue reports" })).getByText("Agrees with AI")).toBeInTheDocument();
  });

  it("says when AI has not reviewed a report", async () => {
    render(<IssueReportsDesk />);
    await opened();
    expect(screen.getByText(/Not reviewed by AI yet/)).toBeInTheDocument();
  });
});

describe("filters", () => {
  it("starts with spam hidden and says the tab counts include it", async () => {
    render(<IssueReportsDesk />);
    await opened();
    expect(listIssueReports).toHaveBeenCalledWith("new", { limit: 25 }, NOT_SPAM);
    const verdicts = screen.getByRole("group", { name: "Show reports by verdict" });
    expect(within(verdicts).getByRole("button", { name: "Spam" })).toHaveAttribute("aria-pressed", "false");
    expect(within(verdicts).getByRole("button", { name: "To review" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/2 reports wait for a verdict, 1 with an AI suggestion\. Tab counts include hidden spam\./)).toBeInTheDocument();
  });

  it("shows only spam, or everything, from the verdict toggles", async () => {
    render(<IssueReportsDesk />);
    await opened();
    const verdicts = screen.getByRole("group", { name: "Show reports by verdict" });
    fireEvent.click(within(verdicts).getByRole("button", { name: "Spam" }));
    await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith("new", { limit: 25 }, {}));
    for (const name of ["To review", "Valid", "Duplicate"]) {
      fireEvent.click(within(verdicts).getByRole("button", { name }));
    }
    await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith("new", { limit: 25 }, { validity: ["spam"] }));
    // The last verdict cannot be switched off.
    fireEvent.click(within(verdicts).getByRole("button", { name: "Spam" }));
    expect(within(verdicts).getByRole("button", { name: "Spam" })).toHaveAttribute("aria-pressed", "true");
  });

  it("narrows by category, label and AI review behind More filters", async () => {
    const user = userEvent.setup();
    render(<IssueReportsDesk />);
    await opened();
    await user.click(screen.getByRole("button", { name: "More filters" }));
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Bug" }));
    await waitFor(() =>
      expect(listIssueReports).toHaveBeenLastCalledWith("new", { limit: 25 }, { ...NOT_SPAM, triageCategory: ["bug"] }),
    );
    await user.click(screen.getByRole("combobox", { name: "Label" }));
    await user.click(await screen.findByRole("option", { name: "checkout (3)" }));
    await user.click(screen.getByRole("combobox", { name: "AI review" }));
    await user.click(await screen.findByRole("option", { name: "Not AI reviewed" }));
    await waitFor(() =>
      expect(listIssueReports).toHaveBeenLastCalledWith(
        "new",
        { limit: 25 },
        { ...NOT_SPAM, triageCategory: ["bug"], label: "checkout", aiReviewed: false },
      ),
    );
    expect(screen.getByRole("button", { name: "More filters (3)" })).toBeInTheDocument();
  });

  it("offers to reset filters that match nothing", async () => {
    render(<IssueReportsDesk />);
    await opened();
    listIssueReports.mockResolvedValue(answer([]));
    fireEvent.click(within(screen.getByRole("group", { name: "Show reports by verdict" })).getByRole("button", { name: "To review" }));
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
    listIssueReports.mockResolvedValue(answer([first]));
    fireEvent.click(screen.getAllByRole("button", { name: "Reset filters" }).at(-1)!);
    await waitFor(() => expect(listIssueReports).toHaveBeenLastCalledWith("new", { limit: 25 }, NOT_SPAM));
  });

  it("pages a filtered list by whether the last page came back full", async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      ...second,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      issue: `Report ${index}`,
    }));
    listIssueReports.mockResolvedValue({ reports: many, counts: { ...COUNTS, new: 25 }, triageCounts: triageCounts() });
    render(<IssueReportsDesk />);
    // New · 25 counts spam too, so the desk does not claim the list is whole.
    expect(await screen.findByText("25 reports")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });
});
