"use client";

import { ChevronDown, Zap } from "lucide-react";
import { useState } from "react";

import { ChipPicker, TextField, TickRow } from "@/components/supplier-signup/controls";
import { StepFrame, StepProblem, type StepAction } from "@/components/supplier-signup/StepFrame";
import {
  COLOURS,
  DEFAULT_PRINTS,
  FINISHING,
  groupLabel,
  hasPrintsProblems,
  missionProgress,
  orderedGroups,
  pagePriceLine,
  PAPERS,
  printsDraftFrom,
  printsProblems,
  printsValue,
  type Colour,
  type Finishing,
  type Paper,
  type PrintsDraft,
  type SignupSteps,
  type SignupTerms,
} from "@/lib/guided-signup";

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}

/**
 * Step 3: what the shop prints (the shop app's `signup/prints`).
 *
 * Ticks, not typing. Documents come first and are already ticked, because
 * that is the shop this sign-up is for; the other groups are interests that
 * can wait. The per-side price is GRIDGO's own schedule, shown and never
 * edited here; only A3 and the optional finishing carry the shop's own price.
 */
export function PrintsStep({
  saved,
  terms,
  onSave,
  back,
}: {
  saved: SignupSteps["prints"] | undefined;
  terms: SignupTerms;
  onSave: (value: Record<string, unknown>) => Promise<string | null>;
  back?: StepAction | null;
}) {
  const [draft, setDraft] = useState<PrintsDraft>(() => printsDraftFrom(saved));
  const [showProblems, setShowProblems] = useState(false);
  const [finishingOpen, setFinishingOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = printsProblems(draft);
  const shown = showProblems ? problems : {};
  const documents = draft.groups.includes("documents");
  const groups = orderedGroups(terms.printGroups.length ? terms.printGroups : DEFAULT_PRINTS.groups);
  const hasFinishing = FINISHING.some((item) => draft.finishing[item.value].trim());
  const ticked = COLOURS.filter((colour) => draft.colours.includes(colour.value));

  function edit(next: Partial<PrintsDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function save() {
    setError(null);
    if (hasPrintsProblems(problems)) {
      setShowProblems(true);
      if (problems.finishing) setFinishingOpen(true);
      return;
    }
    setBusy(true);
    const refused = await onSave(printsValue(draft));
    setBusy(false);
    if (refused) setError(refused);
  }

  return (
    <StepFrame
      progress={missionProgress("prints").label}
      title="What you print"
      lede="Tick what you can do. No typing."
      problem={
        error ? (
          <StepProblem>{error}</StepProblem>
        ) : showProblems && hasPrintsProblems(problems) ? (
          <StepProblem>Fix the marked answers above.</StepProblem>
        ) : null
      }
      back={back}
      next={{ label: busy ? "Saving…" : "Save and continue", hint: "I-save", onClick: () => void save(), disabled: busy }}
    >
      <div className="flex flex-col gap-2">
        <ChipPicker
          label="Your shop prints"
          options={groups.map((code) => ({ value: code, ...groupLabel(code) }))}
          selected={draft.groups}
          onToggle={(code) => edit({ groups: toggle(draft.groups, code) })}
          error={shown.groups}
        />
        <p className="text-caption m-0 text-text-muted">
          Documents start today. Other kinds can wait; add them later from Products.
        </p>
      </div>

      {documents ? (
        <div className="flex flex-col gap-6 border-t border-outline-subtle pt-6">
          <h3 className="text-h3 m-0 text-text-primary">Documents</h3>
          <div className="grid gap-6 min-[1280px]:grid-cols-2">
            <ChipPicker
              label="Paper"
              options={PAPERS}
              selected={draft.papers}
              onToggle={(paper) => edit({ papers: toggle(draft.papers, paper as Paper) })}
              error={shown.papers}
            />
            <ChipPicker
              label="Colour"
              options={COLOURS}
              selected={draft.colours}
              onToggle={(colour) => edit({ colours: toggle(draft.colours, colour as Colour) })}
              error={shown.colours}
            />
          </div>
          <TickRow
            checked={draft.duplex}
            onChange={(duplex) => edit({ duplex })}
            label="Back-to-back"
            hint="Print on both sides of the page."
          />

          {ticked.length ? (
            <div className="gg-panel flex flex-col gap-2" data-testid="gridgo-page-price">
              <p className="text-body m-0 text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                GRIDGO&apos;s price
              </p>
              {ticked.map((colour) => (
                <div key={colour.value} className="flex items-center justify-between gap-3">
                  <span className="text-body text-text-secondary">{colour.label}</span>
                  <span className="text-body tabular-nums text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                    {pagePriceLine(terms, colour.value)}
                  </span>
                </div>
              ))}
              <p className="text-caption m-0 text-text-muted">
                Same for every shop, for Short, A4 and Long. Back-to-back counts each side once.
              </p>
            </div>
          ) : null}

          {draft.papers.includes("a3") ? (
            <div className="flex flex-col gap-4" data-testid="a3-prices">
              <div className="flex flex-col gap-1">
                <p className="text-body m-0 text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                  Your A3 price
                </p>
                <p className="text-caption m-0 text-text-muted">
                  You set A3. For an A3 Express job, the client pays after you accept.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {ticked.map((colour) => (
                  <TextField
                    key={colour.value}
                    label={`A3 ${colour.label.toLowerCase()}, per side`}
                    value={draft.a3Prices[colour.value]}
                    onChange={(value) => edit({ a3Prices: { ...draft.a3Prices, [colour.value]: value } })}
                    prefix="₱"
                    inputMode="decimal"
                    placeholder="0.00"
                    error={shown.a3?.[colour.value]}
                    testId={`a3-${colour.value}`}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-start gap-3 rounded-card border border-outline bg-surface p-4">
            <Zap aria-hidden className="mt-0.5 size-5 shrink-0 text-text-primary" />
            <div className="flex flex-col">
              <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                Express is on
              </span>
              <span className="text-caption text-text-muted">
                Rush document jobs reach you first. You can turn it off later.
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setFinishingOpen((open) => !open)}
              aria-expanded={finishingOpen}
              className="flex min-h-11 items-center justify-between gap-3 text-left"
            >
              <span className="flex flex-col">
                <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                  Stapling, binding, photo paper
                </span>
                <span className="text-caption text-text-muted">
                  {hasFinishing ? "Your prices are set." : "Optional, at your own price."}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className={`size-5 text-text-muted transition-transform motion-reduce:transition-none ${finishingOpen ? "rotate-180" : ""}`}
              />
            </button>
            {finishingOpen ? (
              <div className="grid gap-4 md:grid-cols-3">
                {FINISHING.map((item) => (
                  <TextField
                    key={item.value}
                    label={`${item.label}, ${item.unit}`}
                    value={draft.finishing[item.value]}
                    onChange={(value) =>
                      edit({ finishing: { ...draft.finishing, [item.value as Finishing]: value } })
                    }
                    prefix="₱"
                    inputMode="decimal"
                    placeholder="0.00"
                    hint="Leave empty if you do not offer it."
                    error={shown.finishing?.[item.value]}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </StepFrame>
  );
}
