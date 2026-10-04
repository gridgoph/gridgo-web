import { describe, expect, it } from "vitest";

import {
  composeDecisionText,
  decisionMarkdownFallback,
  decisionQuestionsOf,
  mergeComposedText,
  parseInline,
  parseMarkdownBlocks,
  recommendationText,
  unansweredNumbers,
} from "@/app/admin/_lib/tracker-decision";
import { markdownOnlyItem, openItem, questionsItem } from "@/app/admin/tracker/__tests__/fixtures";

const questions = questionsItem.decisionQuestions!;

describe("composeDecisionText", () => {
  it("writes one line per answered question, in issue order, with the option's label", () => {
    expect(
      composeDecisionText(questions, {
        2: { kind: "option", key: "B" },
        1: { kind: "option", key: "A" },
      }),
    ).toBe(
      "Q1: A, Hard delete only when the account has no orders; otherwise anonymise it.\n" +
        "Q2: B, Operations can suspend; only Super Admin can remove.",
    );
  });

  it("ends a label once, whatever punctuation the issue gave it", () => {
    expect(composeDecisionText(questions, { 2: { kind: "option", key: "A" } })).toBe(
      "Q2: A, Super Admin only.",
    );
  });

  it("writes Something else with the captain's words, and nothing until there are words", () => {
    expect(composeDecisionText(questions, { 1: { kind: "other", text: "   " } })).toBe("");
    expect(
      composeDecisionText(questions, {
        1: { kind: "other", text: " Archive it for a year, then delete. " },
        2: { kind: "option", key: "C" },
      }),
    ).toBe("Q1: Something else, Archive it for a year, then delete.\nQ2: C, Both roles can do both.");
  });

  it("leaves out unanswered questions and unknown keys", () => {
    expect(composeDecisionText(questions, {})).toBe("");
    expect(composeDecisionText(questions, { 1: { kind: "option", key: "Z" } })).toBe("");
    expect(unansweredNumbers(questions, { 2: { kind: "option", key: "B" } })).toEqual([1]);
  });
});

describe("mergeComposedText", () => {
  const q1 = "Q1: A, Hard delete.";
  const both = "Q1: A, Hard delete.\nQ2: B, Ops suspend.";

  it("fills an empty box and follows untouched choices", () => {
    expect(mergeComposedText("", "", q1)).toBe(q1);
    expect(mergeComposedText(q1, q1, both)).toBe(both);
  });

  it("keeps what the captain typed around the choices", () => {
    expect(mergeComposedText(`${q1}\n\nShip it this week.`, q1, both)).toBe(
      `${both}\n\nShip it this week.`,
    );
    expect(mergeComposedText("Ship it this week.", "", q1)).toBe(`${q1}\n\nShip it this week.`);
    expect(mergeComposedText(`${q1}\n\nShip it.`, q1, "")).toBe("Ship it.");
  });

  it("refuses to overwrite answer lines the captain edited", () => {
    expect(mergeComposedText("Q1: A, Hard delete, but archive first.", q1, both)).toBeNull();
  });
});

describe("what the panel shows", () => {
  it("offers questions when the API parsed them", () => {
    expect(decisionQuestionsOf(questionsItem)).toHaveLength(2);
    expect(decisionMarkdownFallback(questionsItem)).toBeNull();
  });

  it("falls back to the raw section when there are no questions", () => {
    expect(decisionQuestionsOf(markdownOnlyItem)).toEqual([]);
    expect(decisionMarkdownFallback(markdownOnlyItem)).toMatch(/^Should refunds wait/);
  });

  it("shows neither for an older API or an item without the section", () => {
    expect(decisionQuestionsOf(openItem)).toEqual([]);
    expect(decisionMarkdownFallback(openItem)).toBeNull();
    expect(decisionMarkdownFallback({ decisionQuestions: [], decisionMarkdown: "  " })).toBeNull();
  });
});

describe("read-only markdown", () => {
  it("parses bold, italic and code, leaving the rest as text", () => {
    expect(parseInline("**A.** pick *this* `code` <b>x</b>")).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "A." }] },
      { kind: "text", text: " pick " },
      { kind: "em", children: [{ kind: "text", text: "this" }] },
      { kind: "text", text: " " },
      { kind: "code", text: "code" },
      { kind: "text", text: " <b>x</b>" },
    ]);
  });

  it("splits paragraphs and lists, including a list right under a line", () => {
    const blocks = parseMarkdownBlocks("With the fees:\n- one\n- two\n\nThe options:\n1. first");
    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "list", "paragraph", "list"]);
    expect(blocks[1]).toMatchObject({ kind: "list", ordered: false });
    expect(blocks[3]).toMatchObject({ kind: "list", ordered: true });
  });
});

describe("recommendationText", () => {
  it("reads as one sentence, keeping the API's qualifiers", () => {
    expect(recommendationText({ key: "B", reason: "Operations handles day-to-day problems." })).toBe(
      "Recommended: B. Operations handles day-to-day problems.",
    );
    expect(recommendationText({ key: "A", reason: "for the pilot. The zones are wide." })).toBe(
      "Recommended: A for the pilot. The zones are wide.",
    );
    expect(recommendationText({ key: "D", reason: ", starting at A. Cheapest first." })).toBe(
      "Recommended: D, starting at A. Cheapest first.",
    );
    expect(recommendationText({ key: "A", reason: "" })).toBe("Recommended: A.");
  });
});
