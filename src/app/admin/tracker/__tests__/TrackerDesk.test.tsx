// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  blockedItem,
  decisionItem,
  liveItem,
  openItem,
  trackerBoard,
} from "@/app/admin/tracker/__tests__/fixtures";
import { TrackerDesk } from "@/app/admin/tracker/_components/TrackerDesk";
import { ApiError } from "@/lib/api/client";
import type { TrackerItem } from "@/lib/api/types";

vi.stubGlobal("React", React);

const api = vi.hoisted(() => ({
  getTracker: vi.fn(),
  setTrackerStatus: vi.fn(),
  uploadTrackerAttachment: vi.fn(),
  recordTrackerDecision: vi.fn(),
  getTrackerAttachmentUrl: vi.fn(),
}));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...api,
}));

function mockMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function file(name: string, type: string, size = 2048): File {
  const blob = new File(["x"], name, { type });
  Object.defineProperty(blob, "size", { value: size });
  return blob;
}

function row(ref: string): HTMLElement {
  const cell = screen.getAllByRole("cell").find((candidate) => candidate.textContent === ref);
  if (!cell) throw new Error(`no row ${ref}`);
  return cell.closest("tr") as HTMLElement;
}

async function openDecision(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: `Decide 4.0 ${decisionItem.requirement}` }));
  return screen.findByRole("form", { name: "Record a decision for 4.0" });
}

beforeEach(() => {
  mockMatchMedia();
  Object.defineProperty(window, "innerWidth", { writable: true, value: 1280 });
  let preview = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${++preview}`);
  URL.revokeObjectURL = vi.fn();
  for (const fn of Object.values(api)) fn.mockReset();
  api.getTracker.mockResolvedValue(trackerBoard());
});

afterEach(() => cleanup());

describe("Tracker sheet", () => {
  it("groups items under the sheet's section titles, in report order", async () => {
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });
    const sections = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent)
      .filter((text) => text !== "1 of 4 live on production");
    expect(sections).toEqual([
      "GENERAL & ADMIN / SYSTEM-WIDE",
      "GRIDGO SUPPLIER",
      "STEP 01 — ONBOARDING",
      "STEP 08 — ISSUE WINDOW, FINANCE & PAYOUTS",
    ]);
    expect(
      within(screen.getAllByRole("table")[0]!)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "ID",
      "Module / Step",
      "Developer",
      "Requirement / Issue Description",
      "Category",
      "Status",
      "GitHub",
    ]);
    expect(screen.getByText("1 item, 1 needs a decision")).toBeInTheDocument();
  });

  it("keeps every column but Status as plain read-only text", async () => {
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });

    const live = row("1.0");
    const cells = within(live).getAllByRole("cell");
    expect(cells.slice(0, 5).map((cell) => cell.textContent)).toEqual([
      "1.0",
      "Dashboard, API",
      "Mark",
      "Real-time order updates in Operations without a manual refresh",
      "Bug/Issue/Concern",
    ]);
    for (const cell of cells.slice(0, 5)) {
      expect(cell.querySelector("input, textarea, select, button, [contenteditable]")).toBeNull();
    }
    // One control per row: the status. The only text field on the page is search.
    expect(within(live).getAllByRole("combobox")).toHaveLength(1);
    expect(within(live).getByRole("combobox", { name: `Status of 1.0 ${liveItem.requirement}, Live (prod)` })).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(within(live).getByRole("link", { name: "Open gridgo-web#50 on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/gridgoph/gridgo-web/issues/50",
    );
  });

  it("says plainly when the tracker is not connected yet", async () => {
    api.getTracker.mockRejectedValue(
      new ApiError(503, { error: "tracker_not_configured", message: "GitHub token missing" }),
    );
    const user = userEvent.setup();
    render(<TrackerDesk />);
    expect(await screen.findByRole("heading", { name: "Tracker is not connected yet" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();

    api.getTracker.mockResolvedValue(trackerBoard());
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("heading", { name: "1 of 4 live on production" })).toBeInTheDocument();
    expect(api.getTracker).toHaveBeenLastCalledWith({ refresh: true });
  });

  it("shows a plain error with a retry when the read fails", async () => {
    api.getTracker.mockRejectedValue(new ApiError(500, { error: "internal" }));
    render(<TrackerDesk />);
    expect(await screen.findByRole("heading", { name: "The tracker did not load" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("filters by status, developer and search, with counts per status", async () => {
    const user = userEvent.setup();
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });

    await user.click(screen.getByRole("button", { name: "Needs decision, 1" }));
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByText(decisionItem.requirement)).toBeInTheDocument();
    expect(screen.queryByText(liveItem.requirement)).toBeNull();

    await user.click(screen.getByRole("button", { name: "All statuses, 4" }));
    await user.click(screen.getByRole("combobox", { name: "Filter by developer" }));
    await user.click(await screen.findByRole("option", { name: "Ven" }));
    expect(screen.getByText(decisionItem.requirement)).toBeInTheDocument();
    expect(screen.getByText(blockedItem.requirement)).toBeInTheDocument();
    expect(screen.queryByText(openItem.requirement)).toBeNull();
    // Counts follow the developer filter.
    expect(screen.getByRole("button", { name: "Live (prod), 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Blocked, 1" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.type(screen.getByRole("searchbox", { name: "Search the tracker" }), "payouts");
    expect(screen.getByText(openItem.requirement)).toBeInTheDocument();
    expect(screen.getAllByRole("table")).toHaveLength(1);

    await user.clear(screen.getByRole("searchbox", { name: "Search the tracker" }));
    await user.type(screen.getByRole("searchbox", { name: "Search the tracker" }), "nothing like this");
    expect(screen.getByRole("heading", { name: "Nothing matches these filters" })).toBeInTheDocument();
  });
});

describe("Changing a status", () => {
  it("asks first, then sends the new status with the optional note", async () => {
    const updated: TrackerItem = { ...openItem, status: "in-review", statusSource: "explicit" };
    api.setTrackerStatus.mockResolvedValue(updated);
    const user = userEvent.setup();
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });

    await user.click(screen.getByRole("combobox", { name: `Status of 31.0 ${openItem.requirement}, Open` }));
    await user.click(await screen.findByRole("option", { name: "In review" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Move 31.0 to In review?")).toBeInTheDocument();
    expect(within(dialog).getByText("The GitHub issue is reopened if it was closed.")).toBeInTheDocument();
    expect(api.setTrackerStatus).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Note (optional)"), "PR #88 is up");
    await user.click(within(dialog).getByRole("button", { name: "Move to In review" }));

    await waitFor(() =>
      expect(api.setTrackerStatus).toHaveBeenCalledWith(openItem, {
        status: "in-review",
        note: "PR #88 is up",
      }),
    );
    expect(
      await screen.findByRole("combobox", { name: `Status of 31.0 ${openItem.requirement}, In review` }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("warns that Live closes the GitHub issue, and changes nothing on cancel", async () => {
    const user = userEvent.setup();
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });

    await user.click(screen.getByRole("combobox", { name: `Status of 31.0 ${openItem.requirement}, Open` }));
    await user.click(await screen.findByRole("option", { name: "Live (prod)" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("The GitHub issue is closed as completed.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Keep Open" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.setTrackerStatus).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: `Status of 31.0 ${openItem.requirement}, Open` })).toBeInTheDocument();
  });

  it("keeps the dialog open with plain words when GitHub refuses", async () => {
    api.setTrackerStatus.mockRejectedValue(new ApiError(502, { error: "github_unavailable" }));
    const user = userEvent.setup();
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });

    await user.click(screen.getByRole("combobox", { name: `Status of 31.0 ${openItem.requirement}, Open` }));
    await user.click(await screen.findByRole("option", { name: "Blocked" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Move to Blocked" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "GitHub did not answer in time. Nothing was changed; try again in a minute.",
    );
    // The page behind the modal is hidden from assistive tech while it is open.
    expect(
      screen.getByRole("combobox", { name: `Status of 31.0 ${openItem.requirement}, Open`, hidden: true }),
    ).toBeInTheDocument();
  });
});

describe("Decision panel", () => {
  it("opens only for Needs decision items, with past decisions", async () => {
    const user = userEvent.setup();
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });

    expect(within(row("1.0")).queryByRole("button", { name: /Decide/ })).toBeNull();
    expect(within(row("31.0")).queryByRole("button", { name: /Decide/ })).toBeNull();

    await openDecision(user);
    expect(screen.getByRole("heading", { name: "Decision for 4.0" })).toBeInTheDocument();
    expect(screen.getByText("Captain Reyes")).toBeInTheDocument();
    expect(
      screen.getByText("Ask for the TIN only when they request an official receipt."),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Then set status to" })).toHaveTextContent("Open");
  });

  it("requires the decision text and caps it at 5,000 characters", async () => {
    const user = userEvent.setup();
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });
    const form = await openDecision(user);

    await user.click(within(form).getByRole("button", { name: "Save decision" }));
    expect(await within(form).findByText("Write the decision before saving it.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Your decision")).toHaveAttribute("aria-invalid", "true");

    const text = within(form).getByLabelText("Your decision");
    await user.click(text);
    await user.paste("a".repeat(5001));
    await user.click(within(form).getByRole("button", { name: "Save decision" }));
    expect(
      await within(form).findByText("Keep the decision to 5,000 characters; it is 5,001 now."),
    ).toBeInTheDocument();
    expect(api.uploadTrackerAttachment).not.toHaveBeenCalled();
    expect(api.recordTrackerDecision).not.toHaveBeenCalled();
  });

  it("refuses the wrong file types, files over 10 MB, and a seventh file", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });
    const form = await openDecision(user);
    const input = within(form).getByLabelText("Images or PDF (optional)");

    await user.upload(input, [
      file("clip.gif", "image/gif"),
      file("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      file("scan.pdf", "application/pdf", 11 * 1024 * 1024),
    ]);
    const problems = within(form).getByRole("alert");
    expect(problems).toHaveTextContent("clip.gif is not a PNG, JPEG, WebP or PDF.");
    expect(problems).toHaveTextContent("notes.docx is not a PNG, JPEG, WebP or PDF.");
    expect(problems).toHaveTextContent("scan.pdf is larger than 10 MB (11.0 MB).");
    expect(within(form).queryByRole("list", { name: "Files to attach" })).toBeNull();

    await user.upload(
      input,
      Array.from({ length: 7 }, (_, i) => file(`shot-${i + 1}.png`, "image/png")),
    );
    expect(within(form).getAllByRole("img", { name: /Preview of shot-/ })).toHaveLength(6);
    expect(within(form).getByRole("alert")).toHaveTextContent(
      "A decision holds 6 files at most, so 1 was left out.",
    );
    expect(within(form).getByRole("button", { name: "Add images or PDF" })).toBeDisabled();
  });

  it("previews, removes, uploads the rest, then saves with the chosen status", async () => {
    api.uploadTrackerAttachment.mockImplementation(async (picked: File) => ({
      fileId: `file_${picked.name}`,
    }));
    const saved: TrackerItem = {
      ...decisionItem,
      status: "blocked",
      decisions: [
        {
          id: "dec_2",
          text: "Wait for the BIR answer.",
          attachments: [{ id: "file_mock.png", name: "mock.png", contentType: "image/png", size: 2048 }],
          decidedBy: { id: "user_captain", name: "Captain Reyes" },
          decidedAt: "2026-09-25T06:00:00.000Z",
        },
        ...decisionItem.decisions,
      ],
    };
    api.recordTrackerDecision.mockResolvedValue(saved);
    const user = userEvent.setup();
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });
    const form = await openDecision(user);

    await user.upload(within(form).getByLabelText("Images or PDF (optional)"), [
      file("mock.png", "image/png"),
      file("contract.pdf", "application/pdf", 3 * 1024 * 1024),
    ]);
    const attached = within(form).getByRole("list", { name: "Files to attach" });
    expect(within(attached).getByRole("img", { name: "Preview of mock.png" })).toHaveAttribute(
      "src",
      "blob:preview-1",
    );
    expect(within(attached).getByText("contract.pdf")).toBeInTheDocument();
    expect(within(attached).getByText("PDF, 3.0 MB")).toBeInTheDocument();

    await user.click(within(attached).getByRole("button", { name: "Remove contract.pdf" }));
    expect(within(form).queryByText("contract.pdf")).toBeNull();

    await user.type(within(form).getByLabelText("Your decision"), "  Wait for the BIR answer.  ");
    await user.click(within(form).getByRole("combobox", { name: "Then set status to" }));
    expect(screen.queryByRole("option", { name: "Needs decision" })).toBeNull();
    await user.click(await screen.findByRole("option", { name: "Blocked" }));
    await user.click(within(form).getByRole("button", { name: "Save decision" }));

    await waitFor(() =>
      expect(api.recordTrackerDecision).toHaveBeenCalledWith(decisionItem, {
        text: "Wait for the BIR answer.",
        attachmentIds: ["file_mock.png"],
        status: "blocked",
      }),
    );
    expect(api.uploadTrackerAttachment).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Decision saved.")).toBeInTheDocument();
    expect(screen.getByText(/Firstmate has been told/)).toHaveTextContent("4.0 is now Blocked");
    expect(screen.queryByRole("form", { name: "Record a decision for 4.0" })).toBeNull();
    expect(screen.getByText("Wait for the BIR answer.")).toBeInTheDocument();
  });

  it("stops before saving when an upload fails, and does not re-upload on retry", async () => {
    api.uploadTrackerAttachment
      .mockResolvedValueOnce({ fileId: "file_a" })
      .mockRejectedValueOnce(new ApiError(413, { error: "file_too_large" }))
      .mockResolvedValueOnce({ fileId: "file_b" });
    api.recordTrackerDecision.mockResolvedValue({ ...decisionItem, status: "open" });
    const user = userEvent.setup();
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });
    const form = await openDecision(user);

    await user.upload(within(form).getByLabelText("Images or PDF (optional)"), [
      file("a.png", "image/png"),
      file("b.pdf", "application/pdf"),
    ]);
    await user.type(within(form).getByLabelText("Your decision"), "Go with option B.");
    await user.click(within(form).getByRole("button", { name: "Save decision" }));

    expect(await within(form).findByText(/^b\.pdf: The file did not upload/)).toBeInTheDocument();
    expect(api.recordTrackerDecision).not.toHaveBeenCalled();

    await user.click(within(form).getByRole("button", { name: "Save decision" }));
    await waitFor(() =>
      expect(api.recordTrackerDecision).toHaveBeenCalledWith(decisionItem, {
        text: "Go with option B.",
        attachmentIds: ["file_a", "file_b"],
        status: "open",
      }),
    );
    expect(api.uploadTrackerAttachment).toHaveBeenCalledTimes(3);
  });

  it("explains a decision refused because the item moved on", async () => {
    api.recordTrackerDecision.mockRejectedValue(new ApiError(409, { error: "not_needs_decision" }));
    const user = userEvent.setup();
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });
    const form = await openDecision(user);

    await user.type(within(form).getByLabelText("Your decision"), "Ship it.");
    await user.click(within(form).getByRole("button", { name: "Save decision" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "This item is no longer waiting on a decision. Refresh to see its current status.",
    );
  });

  it("fetches a signed link only when an attachment is opened", async () => {
    const tab = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    api.getTrackerAttachmentUrl.mockResolvedValue("https://files.example/signed/bir-rules.pdf?sig=1");
    const user = userEvent.setup();
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });
    await openDecision(user);
    expect(api.getTrackerAttachmentUrl).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open bir-rules.pdf" }));
    await waitFor(() =>
      expect(tab.location.href).toBe("https://files.example/signed/bir-rules.pdf?sig=1"),
    );
    expect(api.getTrackerAttachmentUrl).toHaveBeenCalledWith("dec_1", "file_old_pdf");
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
    open.mockRestore();
  });

  it("says so when a signed link cannot be fetched", async () => {
    const tab = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    api.getTrackerAttachmentUrl.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    const user = userEvent.setup();
    render(<TrackerDesk />);
    await screen.findByRole("heading", { name: "1 of 4 live on production" });
    await openDecision(user);

    await user.click(screen.getByRole("button", { name: "Open receipt-sample.png" }));
    expect(await screen.findByText(/That file is no longer stored/)).toBeInTheDocument();
    expect(tab.close).toHaveBeenCalled();
    open.mockRestore();
  });
});
