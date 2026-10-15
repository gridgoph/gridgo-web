"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Order } from "@/lib/api/types";
import { qaChecksFor } from "@/lib/file-check";
import { formatDateTime } from "@/lib/format";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** A tick stays off until its panel has loaded. A failed load stays untickable. */
export type QaPanelStatus = "loading" | "ready" | "failed";

export function QaChecklistFields({
  order,
  checked,
  onCheck,
  disabled,
  panels,
  before,
}: {
  order: Order;
  checked: Record<string, boolean>;
  onCheck: (next: Record<string, boolean>) => void;
  disabled: boolean;
  /** Omitted: every tick is available, as on the queue before a panel is shown. */
  panels?: Partial<Record<string, QaPanelStatus>>;
  before?: (check: { id: string; label: string }) => ReactNode;
}) {
  const prefix = useId();
  const checks = qaChecksFor(order);
  if (before) {
    return (
      <QaChecklistSteps
        checks={checks}
        checked={checked}
        onCheck={onCheck}
        disabled={disabled}
        panels={panels}
        before={before}
        prefix={prefix}
      />
    );
  }
  return (
    <FieldSet disabled={disabled}>
      <FieldLegend>What you checked</FieldLegend>
      <FieldDescription>
        Tick only the items you verified. A check stays off until its panel has loaded.
      </FieldDescription>
      <FieldGroup>
        {checks.map((check) => {
          const status: QaPanelStatus = panels ? panels[check.id] ?? "loading" : "ready";
          const blocked = status !== "ready";
          return (
            <Field key={check.id} orientation="horizontal">
              <input
                id={`${prefix}-${check.id}`}
                type="checkbox"
                className="mt-1"
                checked={Boolean(checked[check.id])}
                disabled={disabled || blocked}
                onChange={(event) =>
                  onCheck({ ...checked, [check.id]: event.target.checked })
                }
              />
              <FieldLabel
                htmlFor={`${prefix}-${check.id}`}
                className="min-h-11 items-start"
              >
                {check.label}
                {status === "failed" ? (
                  <span className="text-caption text-error block">
                    Could not load this check, so it cannot be ticked.
                  </span>
                ) : null}
              </FieldLabel>
            </Field>
          );
        })}
      </FieldGroup>
    </FieldSet>
  );
}

function stepStatus(status: QaPanelStatus, ticked: boolean): string {
  if (status === "failed") return "Unavailable";
  if (status === "loading") return "Loading";
  if (ticked) return "Checked";
  return "To check";
}

function QaChecklistSteps({
  checks,
  checked,
  onCheck,
  disabled,
  panels,
  before,
  prefix,
}: {
  checks: { id: string; label: string }[];
  checked: Record<string, boolean>;
  onCheck: (next: Record<string, boolean>) => void;
  disabled: boolean;
  panels?: Partial<Record<string, QaPanelStatus>>;
  before: (check: { id: string; label: string }) => ReactNode;
  prefix: string;
}) {
  const [open, setOpen] = useState<string[]>(() => (checks[0] ? [checks[0].id] : []));
  const progress = checks.map((check) => (checked[check.id] ? "1" : "0")).join("");
  const previous = useRef(progress);

  useEffect(() => {
    const prior = previous.current;
    previous.current = progress;
    if (prior === progress) return;
    const index = checks.findIndex((check, place) => checked[check.id] && prior[place] !== "1");
    if (index < 0) return;
    const following = checks.slice(index + 1).find((check) => !checked[check.id]);
    if (following) setOpen([following.id]);
  }, [progress, checks, checked]);

  return (
    <FieldSet>
      <FieldLegend>What you checked</FieldLegend>
      <FieldDescription>
        Open a step, read it, then tick it. The next step opens. A check stays off until its panel has loaded.
      </FieldDescription>
      <Accordion
        value={open}
        onValueChange={(value) => setOpen(value)}
        className="overflow-hidden rounded-card border border-outline-subtle"
      >
        {checks.map((check, index) => {
          const status: QaPanelStatus = panels ? panels[check.id] ?? "loading" : "ready";
          const blocked = status !== "ready";
          const ticked = Boolean(checked[check.id]);
          const shown = open.includes(check.id);
          const labelId = `${prefix}-${check.id}-label`;
          return (
            <AccordionItem key={check.id} value={check.id}>
              <AccordionHeader className="items-stretch">
                <div className={cn("flex items-start py-3 pl-4", shown && "bg-surface-variant/40")}>
                  <input
                    id={`${prefix}-${check.id}`}
                    type="checkbox"
                    className="mt-1"
                    aria-labelledby={labelId}
                    checked={ticked}
                    disabled={disabled || blocked}
                    onChange={(event) =>
                      onCheck({ ...checked, [check.id]: event.target.checked })
                    }
                  />
                </div>
                <AccordionTrigger
                  aria-label={`${shown ? "Hide" : "Show"} step ${index + 1}: ${check.label}`}
                  className={cn(shown && "bg-surface-variant/40")}
                >
                  <span className="text-overline text-text-muted mt-1 w-4 shrink-0 tabular-nums" aria-hidden>
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span id={labelId} className="text-body text-text-primary">{check.label}</span>
                    {status === "failed" ? (
                      <span className="text-caption text-error">
                        Could not load this check, so it cannot be ticked.
                      </span>
                    ) : (
                      <span className="text-caption text-text-muted">{stepStatus(status, ticked)}</span>
                    )}
                  </span>
                </AccordionTrigger>
              </AccordionHeader>
              <AccordionContent>
                {before(check)}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </FieldSet>
  );
}

export function QaChecklistRecord({
  order,
  names,
}: {
  order: Order;
  names: Record<string, string>;
}) {
  const review = order.fileCheck;
  const checks = review?.checklist?.version === 1 ? review.checklist.checks : null;
  const reviewer = review?.reviewedBy ? names[review.reviewedBy] : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0">
        {review?.reviewedAt
          ? `${reviewer ? `Reviewed by ${reviewer}` : review.reviewedBy ? "Reviewer unavailable" : "Reviewer not recorded"} · ${formatDateTime(review.reviewedAt)}`
          : "Reviewer and review time not recorded."}
      </p>
      <ul
        className="m-0 flex list-none flex-col gap-3 p-0"
        aria-label="Recorded quality checks"
      >
        {qaChecksFor(order).map((check) => {
          const result = checks?.[check.id];
          return (
            <li
              key={check.id}
              className="flex flex-wrap items-start justify-between gap-2"
            >
              <span className="text-body text-text-secondary min-w-0 flex-1 basis-48">
                {check.label}
              </span>
              <StatusChip
                label={
                  result === true
                    ? "Checked"
                    : result === false
                      ? "Not checked"
                      : "Not recorded"
                }
                icon={result === true ? "circle-check" : "circle-dashed"}
                tone={result === true ? "success" : "neutral"}
              />
            </li>
          );
        })}
      </ul>
      {!checks ? (
        <p className="text-caption text-text-muted m-0">
          Individual checklist results were not recorded for this review.
        </p>
      ) : null}
      {review?.reason ? (
        <p className="text-body text-text-secondary m-0 whitespace-pre-wrap">
          {review.reason}
        </p>
      ) : null}
    </div>
  );
}
