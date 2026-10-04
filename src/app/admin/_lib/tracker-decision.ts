/**
 * The decision panel's structured questions: what each answer writes into
 * "Your decision", and how a new choice reaches text the captain may have
 * edited. Pure on purpose — no React, no fetching.
 *
 * Contract: `decisionQuestions` / `decisionMarkdown` on a tracker item,
 * gridgo-api docs/TRACKER_API.md.
 */

import type { TrackerDecisionQuestion, TrackerItem } from "@/lib/api/types";

/** The radio value of the "Something else" choice; option keys are letters. */
export const OTHER_CHOICE = "other";

/** One question's answer: an option's key, or "Something else" with its words. */
export type DecisionAnswer = { kind: "option"; key: string } | { kind: "other"; text: string };

export type DecisionAnswers = Readonly<Record<number, DecisionAnswer | undefined>>;

/** The item's questions, or none (older API, or a section that did not parse). */
export function decisionQuestionsOf(item: Pick<TrackerItem, "decisionQuestions">): TrackerDecisionQuestion[] {
  return (item.decisionQuestions ?? []).filter((question) => question.options.length > 0);
}

/** The raw section to show read-only when there are no questions to answer. */
export function decisionMarkdownFallback(
  item: Pick<TrackerItem, "decisionQuestions" | "decisionMarkdown">,
): string | null {
  if (decisionQuestionsOf(item).length) return null;
  const markdown = item.decisionMarkdown?.trim();
  return markdown ? markdown : null;
}

/** Ends a sentence once, whatever punctuation the issue's label already had. */
function sentence(text: string): string {
  const trimmed = text.trim().replace(/[\s.;:,]+$/, "");
  return trimmed ? `${trimmed}.` : "";
}

/** One line per answered question, e.g. `Q1: A, Hard delete only when … orders.` */
export function answerLine(question: TrackerDecisionQuestion, answer: DecisionAnswer | undefined): string | null {
  if (!answer) return null;
  if (answer.kind === "other") {
    const text = answer.text.trim();
    return text ? `Q${question.number}: Something else, ${text}` : null;
  }
  const option = question.options.find((candidate) => candidate.key === answer.key);
  if (!option) return null;
  return `Q${question.number}: ${option.key}, ${sentence(option.label)}`;
}

/** The decision text the choices write, questions in issue order; unanswered ones are left out. */
export function composeDecisionText(
  questions: readonly TrackerDecisionQuestion[],
  answers: DecisionAnswers,
): string {
  return questions
    .map((question) => answerLine(question, answers[question.number]))
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * The text after a new choice. Choices own the part of "Your decision" they
 * last wrote; anything typed before or after it is kept. Null when the
 * captain has edited that part itself, so a click never overwrites their words.
 */
export function mergeComposedText(current: string, previous: string, next: string): string | null {
  if (current.trim() === "" || current === previous) return next;
  if (previous === "") {
    // Nothing composed yet: the choices go first, the captain's notes after.
    return next ? `${next}\n\n${current.replace(/^\s+/, "")}` : current;
  }
  const at = current.indexOf(previous);
  if (at === -1) return null;
  const before = current.slice(0, at);
  let after = current.slice(at + previous.length);
  // Removing every answer also removes the gap that separated it from the notes.
  if (!next) after = after.replace(/^\s+/, "");
  return `${before}${next}${after}`;
}

/**
 * The recommendation as one sentence. The API keeps a qualifier in the
 * reason ("for the pilot. …", ", starting at A. …"), so it joins the key
 * without a full stop between them.
 */
export function recommendationText(recommended: { key: string; reason?: string | null }): string {
  const reason = recommended.reason?.trim() ?? "";
  if (!reason) return `Recommended: ${recommended.key}.`;
  if (reason.startsWith(",")) return `Recommended: ${recommended.key}${reason}`;
  if (/^\p{Ll}/u.test(reason)) return `Recommended: ${recommended.key} ${reason}`;
  return `Recommended: ${recommended.key}. ${reason}`;
}

/** Questions still without an answer, for the quiet hint by the form. */
export function unansweredNumbers(
  questions: readonly TrackerDecisionQuestion[],
  answers: DecisionAnswers,
): number[] {
  return questions
    .filter((question) => answerLine(question, answers[question.number]) === null)
    .map((question) => question.number);
}

// ---- Read-only markdown ----

export type MarkdownInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: MarkdownInline[] }
  | { kind: "em"; children: MarkdownInline[] }
  | { kind: "code"; text: string };

export type MarkdownBlock =
  | { kind: "paragraph"; lines: MarkdownInline[][] }
  | { kind: "list"; ordered: boolean; items: MarkdownInline[][] };

const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

/**
 * The few inline marks the tracker's issues use: **bold**, *italic* or
 * _italic_, and `code`. Anything else stays as written.
 */
export function parseInline(text: string): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*\s][^*]*?\*)|(\b_[^_\s][^_]*?_\b)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ kind: "text", text: text.slice(last, index) });
    const token = match[0];
    if (match[1]) out.push({ kind: "code", text: token.slice(1, -1) });
    else if (match[2]) out.push({ kind: "strong", children: parseInline(token.slice(2, -2)) });
    else out.push({ kind: "em", children: parseInline(token.slice(1, -1)) });
    last = index + token.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** Paragraphs and lists; a run of list lines inside a paragraph becomes its own list. */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", lines: paragraph.map(parseInline) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flushParagraph();
      const ordered = Boolean(item[2]);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item[3]!);
      continue;
    }
    if (list && /^\s{2,}/.test(raw)) {
      // A wrapped list item continues on an indented line.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    paragraph.push(line.replace(/^#{1,6}\s+/, "").trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}
