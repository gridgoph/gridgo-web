"use client";

import { CircleCheck, CircleX } from "lucide-react";

import type { Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { supplierCounterCheck, type SupplierCountRow } from "@/lib/supplier-counter";

/**
 * The rider's counter check, read back. No rider button and no staff button:
 * a failed check stays with the shop until Operations clears it.
 */
export function SupplierCounterRead({ order }: { order: Order }) {
  const check = supplierCounterCheck(order);
  if (!check) return null;
  const earlier = check.stage === "recheck";

  return (
    <section
      aria-label="Counter check"
      className={
        check.stage === "blocked"
          ? "border-error bg-surface flex flex-col gap-3 rounded-field border p-3"
          : "border-outline-subtle bg-surface flex flex-col gap-3 rounded-field border p-3"
      }
    >
      {check.checkedAt ? (
        <p className="text-caption text-text-muted m-0">
          {earlier ? "Rider last checked it" : "Rider checked it"}{" "}
          {formatDateTime(check.checkedAt)}
        </p>
      ) : null}
      <h3 className="text-h3 text-text-primary m-0">{check.headline}</h3>
      <p className="text-body text-text-secondary m-0 max-w-prose">{check.detail}</p>

      {check.operationsNote ? (
        <Note label="What Operations said" text={check.operationsNote} />
      ) : null}
      {check.riderNote ? (
        <Note
          label={earlier ? "What the rider wrote last time" : "What the rider wrote"}
          text={check.riderNote}
        />
      ) : null}

      {check.failed.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          <li className="text-caption text-text-muted">
            {earlier ? "Did not pass last time" : "Did not pass"}
          </li>
          {check.failed.map((label) => (
            <li key={label} className="flex items-center gap-2">
              <CircleX className="text-error size-4 shrink-0" aria-hidden />
              <span className="text-body text-text-primary">{label}</span>
            </li>
          ))}
          {check.passed.length ? (
            <li className="text-caption text-text-muted flex items-start gap-2 pt-1">
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Passed: {check.passed.join(", ")}</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      <CountLedger counts={check.counts} label={earlier ? "Last count" : "The count"} />
      {check.signedBy && check.stage === "passed" ? (
        <p className="text-caption text-text-muted m-0">Signed by {check.signedBy}</p>
      ) : null}
    </section>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <div className="bg-surface-variant flex flex-col gap-1 rounded-field px-3 py-2">
      <p className="text-caption text-text-muted m-0">{label}</p>
      <p className="text-body text-text-primary m-0">“{text}”</p>
    </div>
  );
}

function CountLedger({
  counts,
  label,
}: {
  counts: SupplierCountRow[] | null;
  label: string;
}) {
  if (!counts) {
    return (
      <div>
        <p className="text-caption text-text-muted m-0">{label}</p>
        <p className="text-body text-text-secondary m-0">Not recorded</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-caption text-text-muted m-0">{label}</p>
      <ul className="m-0 list-none p-0">
        {counts.map((row) => (
          <li
            key={row.key}
            className="border-outline-subtle flex flex-wrap items-end justify-between gap-3 border-t py-2"
          >
            <span className="text-body text-text-primary">{row.name}</span>
            <span className="text-caption text-text-secondary">
              Ordered {row.expected.toLocaleString("en-PH")} · Counted{" "}
              {row.counted.toLocaleString("en-PH")} · {row.difference}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
