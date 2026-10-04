// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  contextItem,
  decisionItem,
  markdownOnlyItem,
  questionsItem,
} from "@/app/admin/tracker/__tests__/fixtures";
import { DecisionPanel } from "@/app/admin/tracker/_components/DecisionPanel";
import type { TrackerItem } from "@/lib/api/types";

vi.stubGlobal("React", React);

// Base UI radios dispatch a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

const api = vi.hoisted(() => ({
  uploadTrackerAttachment: vi.fn(),
  recordTrackerDecision: vi.fn(),
  getTrackerAttachmentUrl: vi.fn(),
}));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...api,
}));

function renderPanel(item: TrackerItem) {
  const onSaved = vi.fn();
  render(<DecisionPanel item={item} open onOpenChange={() => {}} onSaved={onSaved} />);
  const form = screen.getByRole("form", { name: `Record a decision for ${item.ref}` });
  return { form, onSaved };
}

function question(form: HTMLElement, name: RegExp) {
  return within(form).getByRole("radiogroup", { name });
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

afterEach(() => cleanup());

describe("Decision options", () => {
  it("shows each question as a labelled radio group with its letters and the recommendation", () => {
    const { form } = renderPanel(questionsItem);
    const q1 = question(form, /Q1.*What should "remove an account" do\?/);
    const radios = within(q1).getAllByRole("radio");
    expect(radios.map((radio) => radio.textContent)).toEqual(["A", "B", "C", ""]);
    expect(
      within(q1).getByRole("radio", {
        name: /^A\. Hard delete only when the account has no orders; otherwise anonymise it\.\s*, Recommended$/,
      }),
    ).toHaveAccessibleDescription(/Accounts with no history disappear completely/);
    expect(within(q1).getByRole("radio", { name: "Something else" })).toBeInTheDocument();
    expect(within(q1.parentElement as HTMLElement).getByText("Recommended: A").parentElement).toHaveTextContent(
      'Recommended: A. It matches "gone from the list" without breaking order and money records.',
    );
    expect(question(form, /Q2.*Who may suspend or remove\?/)).toBeInTheDocument();
    expect(within(form).getByLabelText("Your decision")).toHaveValue("");
  });

  it("writes the chosen options into Your decision, which stays editable", async () => {
    const user = userEvent.setup();
    const { form } = renderPanel(questionsItem);
    const text = within(form).getByLabelText("Your decision");

    await user.click(within(question(form, /Q1/)).getByRole("radio", { name: /^A\./ }));
    expect(text).toHaveValue(
      "Q1: A, Hard delete only when the account has no orders; otherwise anonymise it.",
    );
    await user.click(within(question(form, /Q2/)).getByText("Operations can suspend; only Super Admin can remove."));
    expect(text).toHaveValue(
      "Q1: A, Hard delete only when the account has no orders; otherwise anonymise it.\n" +
        "Q2: B, Operations can suspend; only Super Admin can remove.",
    );

    // Notes typed after the answers survive a change of answer.
    await user.type(text, "{Enter}{Enter}Start with Super Admin.");
    await user.click(within(question(form, /Q1/)).getByRole("radio", { name: /^B\./ }));
    expect(text).toHaveValue(
      "Q1: B, Always anonymise and hide.\n" +
        "Q2: B, Operations can suspend; only Super Admin can remove.\n\nStart with Super Admin.",
    );
  });

  it("reveals a text box for Something else and writes its words in", async () => {
    const user = userEvent.setup();
    const { form } = renderPanel(questionsItem);
    const q1 = question(form, /Q1/);
    expect(within(form).queryByLabelText("Your answer to Q1")).toBeNull();

    await user.click(within(q1).getByRole("radio", { name: "Something else" }));
    const other = within(form).getByLabelText("Your answer to Q1");
    await user.type(other, "Archive for a year, then delete.");
    expect(within(form).getByLabelText("Your decision")).toHaveValue(
      "Q1: Something else, Archive for a year, then delete.",
    );

    await user.click(within(q1).getByRole("radio", { name: /^C\./ }));
    expect(within(form).queryByLabelText("Your answer to Q1")).toBeNull();
    expect(within(form).getByLabelText("Your decision")).toHaveValue("Q1: C, Always hard delete.");
  });

  it("never overwrites answer lines edited by hand, until asked", async () => {
    const user = userEvent.setup();
    const { form } = renderPanel(questionsItem);
    const text = within(form).getByLabelText("Your decision");
    await user.click(within(question(form, /Q2/)).getByRole("radio", { name: /^A\./ }));
    await user.clear(text);
    await user.type(text, "Q2: A, but Operations may suspend for a day.");
    await user.click(within(question(form, /Q1/)).getByRole("radio", { name: /^A\./ }));
    expect(text).toHaveValue("Q2: A, but Operations may suspend for a day.");
    expect(within(form).getByRole("status")).toHaveTextContent(
      "You edited the answer lines, so new choices are not written in.",
    );

    await user.click(within(form).getByRole("button", { name: "Replace the text with my choices" }));
    expect(text).toHaveValue(
      "Q1: A, Hard delete only when the account has no orders; otherwise anonymise it.\nQ2: A, Super Admin only.",
    );
  });

  it("saves the composed decision through the usual flow", async () => {
    const user = userEvent.setup();
    api.recordTrackerDecision.mockResolvedValue({ ...questionsItem, status: "open" });
    const { form, onSaved } = renderPanel(questionsItem);
    await user.click(within(question(form, /Q1/)).getByRole("radio", { name: /^A\./ }));
    await user.click(within(question(form, /Q2/)).getByRole("radio", { name: /^B\./ }));
    await user.click(within(form).getByRole("button", { name: "Save decision" }));
    await waitFor(() =>
      expect(api.recordTrackerDecision).toHaveBeenCalledWith(questionsItem, {
        text:
          "Q1: A, Hard delete only when the account has no orders; otherwise anonymise it.\n" +
          "Q2: B, Operations can suspend; only Super Admin can remove.",
        attachmentIds: [],
        status: "open",
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("shows the raw section read-only when the questions did not parse", () => {
    const { form } = renderPanel(markdownOnlyItem);
    expect(within(form).queryByRole("radiogroup")).toBeNull();
    const section = within(form).getByRole("region", { name: "Waiting on a decision" });
    expect(section).toHaveTextContent("Should refunds wait for the shop's agreement?");
    expect(within(section).getAllByRole("listitem")).toHaveLength(2);
    expect(within(section).getByText("Yes:").tagName).toBe("STRONG");
    expect(within(section).queryByRole("textbox")).toBeNull();
    expect(within(form).getByLabelText("Your decision")).toHaveValue("");
  });

  it("leaves the panel as it was with neither questions nor the section", () => {
    const { form } = renderPanel(decisionItem);
    expect(within(form).queryByRole("radiogroup")).toBeNull();
    expect(within(form).queryByRole("region")).toBeNull();
    expect(within(form).getByLabelText("Your decision")).toHaveAttribute(
      "placeholder",
      "What should the team build, and anything they must not do",
    );
  });
});

describe("Question context", () => {
  it("reads the context as the group's description, lists included", () => {
    const { form } = renderPanel(contextItem);
    expect(within(form).getAllByRole("radiogroup")).toHaveLength(3);
    const q2 = question(form, /Q2.*road distance/);
    expect(q2).toHaveAccessibleDescription(/With the current fees.*a drop-off 9 km away/);
    const context = document.getElementById(q2.getAttribute("aria-describedby")!)!;
    expect(within(context).getAllByRole("listitem")).toHaveLength(2);
    // An empty context string (#116) describes nothing.
    renderPanel(questionsItem);
    expect(screen.getAllByRole("radiogroup", { name: /Q1.*remove an account/ })[0]).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("joins a qualified recommendation into one sentence", () => {
    const { form } = renderPanel(contextItem);
    const q2 = question(form, /Q2/);
    expect(within(q2.parentElement as HTMLElement).getByText("Recommended: A").parentElement).toHaveTextContent(
      /^Recommended: A for the pilot\. The zones are wide enough/,
    );
  });
});
