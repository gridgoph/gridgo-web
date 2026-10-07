"use client";

import { useId } from "react";
import type { Order } from "@/lib/api/types";
import { qaChecksFor } from "@/lib/file-check";
import { formatDateTime } from "@/lib/format";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";

export function QaChecklistFields({
  order,
  checked,
  onCheck,
  disabled,
}: {
  order: Order;
  checked: Record<string, boolean>;
  onCheck: (next: Record<string, boolean>) => void;
  disabled: boolean;
}) {
  const prefix = useId();
  return (
    <FieldSet disabled={disabled}>
      <FieldLegend>What you checked</FieldLegend>
      <FieldDescription>
        Tick only the items you verified. Your checks are saved with your decision.
      </FieldDescription>
      <FieldGroup>
        {qaChecksFor(order).map((check) => (
          <Field key={check.id} orientation="horizontal">
            <input
              id={`${prefix}-${check.id}`}
              type="checkbox"
              className="mt-1"
              checked={Boolean(checked[check.id])}
              disabled={disabled}
              onChange={(event) =>
                onCheck({ ...checked, [check.id]: event.target.checked })
              }
            />
            <FieldLabel
              htmlFor={`${prefix}-${check.id}`}
              className="min-h-11 items-start"
            >
              {check.label}
            </FieldLabel>
          </Field>
        ))}
      </FieldGroup>
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
