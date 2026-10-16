"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import {
  needsOperations,
  otherRequirements,
  photoRequirement,
  requirementTitle,
  type PackagingCheck,
  type Requirement,
} from "@/lib/packaging-readiness";

type RowState = "done" | "needed" | "blocked" | "optional";

const STATE_CHIP: Record<
  RowState,
  { tone: StatusTone; label: string; icon: StatusIconName }
> = {
  done: { tone: "success", label: "Done", icon: "circle-check" },
  needed: { tone: "warning", label: "Needed", icon: "clock" },
  blocked: { tone: "error", label: "Waiting on Operations", icon: "triangle-alert" },
  optional: { tone: "neutral", label: "Optional", icon: "circle-dashed" },
};

/**
 * What GRIDGO still needs before this job can be packaged, read before the
 * button rather than learned from a refusal (report 6C695C15).
 *
 * The two photos are listed whether or not they are done, so a shop sees the
 * one thing left rather than a list of faults. Each open row is the API's own
 * sentence. A photo is added from the job's action bar, so its row carries no
 * button; a claim is Operations' to clear, so its row is where to message
 * them from. The receipt scan is listed as optional and never holds the step.
 * Nothing here is yellow: the one yellow on the job is the step itself.
 */
export function PackagingChecklist({ check }: { check: PackagingCheck }) {
  const others = otherRequirements(check);
  const done = check.photos.filter((photo) => photo.done).length;
  const summary =
    done === check.photos.length
      ? "Both photos are on the job."
      : `${done} of ${check.photos.length} photos on the job.`;

  return (
    <section
      id="packaging-checklist"
      className="gg-card flex flex-col gap-3 p-3"
      aria-labelledby="packaging-checklist-heading"
    >
      <div className="flex flex-col gap-1">
        <h3
          id="packaging-checklist-heading"
          className="text-h3 text-text-primary m-0 flex items-center gap-2"
        >
          <PackageCheck size={18} strokeWidth={1.75} aria-hidden />
          Before it can be packaged
        </h3>
        <p className="text-body text-text-secondary m-0">
          {check.allowed
            ? "Everything GRIDGO needs is on the job. You can package it for pickup."
            : `${summary}${others.length ? " Something else is holding it too." : ""}`}
        </p>
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {check.photos.map((photo) => {
          const owed = photoRequirement(check, photo.kind);
          return (
            <Row
              key={photo.kind}
              state={owed ? "needed" : "done"}
              title={requirementTitle(photo.kind)}
              detail={owed ? owed.message : "On the job."}
            />
          );
        })}
        {others.map((item, index) => (
          <BlockerRow
            key={`${item.code}:${index}`}
            item={item}
            // The first hold describes the disabled Package for pickup button.
            detailId={index === 0 ? "packaging-hold-reason" : undefined}
          />
        ))}
        <Row
          state="optional"
          title="Receipt scan"
          detail={
            check.receiptAttached
              ? "On the job."
              : "Not needed. It never holds up packing."
          }
        />
      </ul>
    </section>
  );
}

function Row({
  state,
  title,
  detail,
  detailId,
  action,
}: {
  state: RowState;
  title: string;
  detail: string;
  detailId?: string;
  action?: ReactNode;
}) {
  const chip = STATE_CHIP[state];
  return (
    <li className="border-outline-subtle flex flex-col gap-1 border-t py-3 first:border-t-0 first:pt-1 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span
          className={
            state === "optional"
              ? "text-body text-text-secondary"
              : "text-body text-text-primary"
          }
          style={state === "optional" ? undefined : { fontFamily: "var(--font-medium)" }}
        >
          {title}
        </span>
        <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />
      </div>
      <p
        id={detailId}
        className={
          state === "optional"
            ? "text-caption text-text-muted m-0 max-w-prose"
            : "text-body text-text-secondary m-0 max-w-prose"
        }
      >
        {detail}
      </p>
      {action ? <div className="pt-1">{action}</div> : null}
    </li>
  );
}

/** A claim, a stop or a job that moved on: named, in GRIDGO's words, with the way forward. */
function BlockerRow({ item, detailId }: { item: Requirement; detailId?: string }) {
  const operations = needsOperations(item.kind);
  return (
    <Row
      state={operations ? "blocked" : "needed"}
      title={requirementTitle(item.kind)}
      detail={item.message}
      detailId={detailId}
      action={
        operations ? (
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href="/supplier/chat" />}
          >
            Message Operations
          </Button>
        ) : null
      }
    />
  );
}
