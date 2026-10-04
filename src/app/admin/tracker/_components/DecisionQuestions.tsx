"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { Lightbulb, PenLine, ThumbsUp } from "lucide-react";
import { useId, type ReactNode } from "react";

import {
  type DecisionAnswer,
  type DecisionAnswers,
  OTHER_CHOICE,
  recommendationText,
} from "@/app/admin/_lib/tracker-decision";
import { Badge } from "@/components/ui/badge";
import { RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { TrackerDecisionQuestion } from "@/lib/api/types";

import { TrackerInline, TrackerMarkdown } from "./TrackerMarkdown";

const bold = { fontFamily: "var(--font-bold)" } as const;
const medium = { fontFamily: "var(--font-medium)" } as const;

/**
 * The issue's "Waiting on a decision" questions as radio groups. Choosing
 * only reports the answer; the form writes it into "Your decision".
 */
export function DecisionQuestions({
  questions,
  answers,
  disabled,
  onAnswer,
}: {
  questions: readonly TrackerDecisionQuestion[];
  answers: DecisionAnswers;
  disabled?: boolean;
  onAnswer: (number: number, answer: DecisionAnswer | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {questions.map((question) => (
        <QuestionCard
          key={question.number}
          question={question}
          answer={answers[question.number]}
          disabled={disabled}
          onAnswer={(answer) => onAnswer(question.number, answer)}
        />
      ))}
    </div>
  );
}

function QuestionCard({
  question,
  answer,
  disabled,
  onAnswer,
}: {
  question: TrackerDecisionQuestion;
  answer: DecisionAnswer | undefined;
  disabled?: boolean;
  onAnswer: (answer: DecisionAnswer | undefined) => void;
}) {
  const id = useId();
  const questionId = `${id}-question`;
  const contextId = `${id}-context`;
  const otherTextId = `${id}-other-text`;
  const context = question.context?.trim();
  const recommended = question.recommended;
  const recommendedOption = recommended
    ? question.options.find((option) => option.key === recommended.key)
    : undefined;
  const value = answer ? (answer.kind === "other" ? OTHER_CHOICE : answer.key) : null;
  const otherText = answer?.kind === "other" ? answer.text : "";

  return (
    <div
      data-testid={`decision-question-${question.number}`}
      className="flex min-w-0 flex-col gap-3 rounded-card border border-outline bg-surface p-3 sm:p-4"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p id={questionId} className="text-body text-text-primary m-0 break-words" style={bold}>
          {/* "Q1" is how the composed decision names this question. */}
          <span className="text-text-muted tabular-nums" style={medium}>
            Q{question.number}
          </span>
          <span aria-hidden> </span>
          <TrackerInline text={question.question} />
        </p>
        {context ? (
          <TrackerMarkdown id={contextId} markdown={context} className="text-caption text-text-secondary" />
        ) : null}
      </div>

      <RadioGroup
        aria-labelledby={questionId}
        aria-describedby={context ? contextId : undefined}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next === OTHER_CHOICE) onAnswer({ kind: "other", text: otherText });
          else if (typeof next === "string") onAnswer({ kind: "option", key: next });
        }}
        className="gap-2"
      >
        {question.options.map((option) => (
          <ChoiceCard
            key={option.key}
            value={option.key}
            mark={option.key}
            label={<TrackerInline text={option.label} />}
            detail={option.detail?.trim() ? <TrackerInline text={option.detail} /> : null}
            recommended={recommended?.key === option.key}
            disabled={disabled}
          />
        ))}
        {question.allowOther ? (
          <ChoiceCard
            value={OTHER_CHOICE}
            mark={<PenLine size={14} aria-hidden />}
            label="Something else"
            detail={value === OTHER_CHOICE ? null : "Write your own answer."}
            disabled={disabled}
          />
        ) : null}
      </RadioGroup>

      {value === OTHER_CHOICE ? (
        <div className="flex flex-col gap-1.5 pl-0 sm:pl-12">
          <label htmlFor={otherTextId} className="text-caption text-text-secondary" style={medium}>
            Your answer to Q{question.number}
          </label>
          <Textarea
            id={otherTextId}
            value={otherText}
            rows={2}
            disabled={disabled}
            onChange={(event) => onAnswer({ kind: "other", text: event.target.value })}
            placeholder="What you want instead"
            className="min-h-16 text-body"
          />
        </div>
      ) : null}

      {recommended && recommendedOption ? (
        <p className="text-caption text-text-secondary m-0 flex gap-2">
          <Lightbulb size={14} aria-hidden className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">
            <span className="text-text-primary" style={medium}>
              Recommended: {recommended.key}
            </span>
            <TrackerInline
              text={recommendationText(recommended).slice(`Recommended: ${recommended.key}`.length)}
            />
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * One answer. The letter tile is the radio itself, so arrow keys move through
 * the letters and the checked one turns solid; the card around it is its label.
 */
function ChoiceCard({
  value,
  mark,
  label,
  detail,
  recommended = false,
  disabled,
}: {
  value: string;
  mark: ReactNode;
  label: ReactNode;
  detail: ReactNode;
  recommended?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const detailId = `${id}-detail`;
  return (
    <label
      data-choice={value}
      className="group/choice flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline bg-transparent px-3 py-2.5 transition-colors hover:bg-overlay-hover has-[[data-checked]]:border-foreground has-[[data-checked]]:bg-surface-variant has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-60"
    >
      <RadioPrimitive.Root
        value={value}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={detail ? detailId : undefined}
        className="relative flex size-7 shrink-0 items-center justify-center rounded-sm border border-outline bg-surface text-caption text-text-secondary tabular-nums transition-colors after:absolute after:-inset-2 data-checked:border-foreground data-checked:bg-foreground data-checked:text-background"
        style={bold}
      >
        {mark}
      </RadioPrimitive.Root>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={labelId} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {typeof mark === "string" ? <span className="sr-only">{mark}. </span> : null}
          <span className="text-body text-text-primary min-w-0 break-words" style={medium}>
            {label}
          </span>
          {recommended ? (
            <Badge variant="outline" className="h-6 gap-1 px-2">
              <ThumbsUp aria-hidden />
              <span className="sr-only">, </span>
              <span className="text-caption text-text-secondary">Recommended</span>
            </Badge>
          ) : null}
        </span>
        {detail ? (
          <span id={detailId} className="text-caption text-text-muted break-words whitespace-pre-line">
            {detail}
          </span>
        ) : null}
      </span>
    </label>
  );
}
