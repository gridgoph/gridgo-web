"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export type StepAction = {
  label: string;
  /** Bisaya, under the label (the shop app's PrimaryButton hint). */
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  /** Outlined, for a step whose own content already holds the yellow button. */
  quiet?: boolean;
};

/**
 * One step's content: where it sits ("Step 2 of 6 · 1 min"), its title, a
 * one-line reason, the fields, and the step's actions at the bottom. Back is
 * quiet and Next is the step's one yellow button.
 */
export function StepFrame({
  progress,
  title,
  lede,
  children,
  problem,
  back,
  next,
  aside,
}: {
  progress?: string;
  title: string;
  lede?: string;
  children: ReactNode;
  /** What stops Next, said above the buttons so it is read before pressing again. */
  problem?: ReactNode;
  back?: StepAction | null;
  next?: StepAction | null;
  /** Anything that belongs next to the actions (a secondary path). */
  aside?: ReactNode;
}) {
  return (
    <section aria-labelledby="signup-step-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        {progress ? (
          <p className="text-caption m-0 text-text-muted" data-testid="step-progress">
            {progress}
          </p>
        ) : null}
        <h2 id="signup-step-title" className="text-h2 m-0 text-text-primary" tabIndex={-1}>
          {title}
        </h2>
        {lede ? <p className="text-body-lg m-0 max-w-prose text-text-secondary">{lede}</p> : null}
      </header>
      <div className="flex flex-col gap-6">{children}</div>
      {problem || back || next || aside ? (
        <footer className="flex flex-col gap-3 border-t border-outline-subtle pt-4">
          {problem}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {back ? (
              <Button
                variant="ghost"
                size="lg"
                className="h-auto min-h-12 py-1.5 sm:w-auto"
                onClick={back.onClick}
                disabled={back.disabled}
                data-testid={back.testId ?? "step-back"}
              >
                <ArrowLeft aria-hidden />
                <ActionText label={back.label} hint={back.hint} />
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {aside}
              {next ? (
                <Button
                  variant={next.quiet ? "outline" : "primary"}
                  size="lg"
                  fullWidth
                  className="h-auto min-h-12 py-1.5 sm:w-auto sm:min-w-48"
                  onClick={next.onClick}
                  disabled={next.disabled}
                  data-testid={next.testId ?? "step-next"}
                >
                  <ActionText label={next.label} hint={next.hint} />
                </Button>
              ) : null}
            </div>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

function ActionText({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="flex flex-col items-center leading-tight">
      <span>{label}</span>
      {hint ? (
        <span className="text-caption opacity-75" lang="ceb">
          {hint}
        </span>
      ) : null}
    </span>
  );
}

/** A refusal or a missing answer, in one place above the buttons. */
export function StepProblem({ children }: { children: ReactNode }) {
  return (
    <p className="text-body m-0 text-error" role="alert">
      {children}
    </p>
  );
}
