"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDateTime } from "@/lib/format";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import {
  needsOperations,
  otherRequirements,
  requirementTitle,
  stepRequirement,
  type PackagingCheck,
  type PackagingStepKind,
  type Requirement,
} from "@/lib/packaging-readiness";
import { photoCount, type ShopFinishedStep } from "@/lib/shop-handover";

type RowState =
  "done" | "needed" | "sent_back" | "waiting" | "upcoming" | "blocked" | "optional";

const STATE_CHIP: Record<
  RowState,
  { tone: StatusTone; label: string; icon: StatusIconName }
> = {
  done: { tone: "success", label: "Done", icon: "circle-check" },
  needed: { tone: "warning", label: "Needed", icon: "clock" },
  sent_back: { tone: "warning", label: "Sent back", icon: "triangle-alert" },
  waiting: { tone: "info", label: "With GRIDGO", icon: "clock" },
  upcoming: { tone: "neutral", label: "Not yet", icon: "circle-dashed" },
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
 *
 * A rider-packs job is not packed at the shop, so its list is the two steps
 * before a rider is called: the shop's photos of the finished, unpacked work,
 * then GRIDGO's review of them. A send-back puts GRIDGO's reason on the
 * photos row, word for word.
 */
export function PackagingChecklist({
  check,
  finished = null,
}: {
  check: PackagingCheck;
  /** Where the finished work stands, on a rider-packs job. */
  finished?: ShopFinishedStep | null;
}) {
  const others = otherRequirements(check);
  const riderPacks = check.flow === "rider_packs";
  const done = check.steps.filter((step) => step.done).length;
  const summary = riderPacks
    ? riderPacksSummary(finished)
    : done === check.steps.length
      ? "Both photos are on the job."
      : `${done} of ${check.steps.length} photos on the job.`;

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
          {riderPacks ? "Before a rider is called" : "Before it can be packaged"}
        </h3>
        <p className="text-body text-text-secondary m-0">
          {check.allowed
            ? riderPacks
              ? "GRIDGO approved the finished work. Mark it ready for rider pickup once your packing materials are ready."
              : "Everything GRIDGO needs is on the job. You can package it for pickup."
            : `${summary}${others.length ? " Something else is holding it too." : ""}`}
        </p>
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {check.steps.map((step) =>
          riderPacks ? (
            <RiderPacksRow
              key={step.kind}
              kind={step.kind}
              check={check}
              finished={finished}
            />
          ) : (
            <Row
              key={step.kind}
              state={stepRequirement(check, step.kind) ? "needed" : "done"}
              title={requirementTitle(step.kind)}
              detail={stepRequirement(check, step.kind)?.message ?? "On the job."}
            />
          ),
        )}
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
              : riderPacks
                ? "Not needed. It never holds up pickup."
                : "Not needed. It never holds up packing."
          }
        />
      </ul>
    </section>
  );
}

function riderPacksSummary(finished: ShopFinishedStep | null): string {
  switch (finished?.stage) {
    case "in_review":
      return "Your photos are with GRIDGO. Nothing for you to do until it answers.";
    case "approved":
      return "GRIDGO approved the finished work.";
    case "with_gridgo":
      return "The GRIDGO Team takes the next step on this job.";
    default:
      return finished?.sendBack
        ? "GRIDGO sent the finished work back. Fix it, then send new photos."
        : "Send photos of the finished, unpacked work. GRIDGO reviews them, then you call a rider.";
  }
}

/** One of the two rider-packs steps, in the shop's words for where it stands. */
function RiderPacksRow({
  kind,
  check,
  finished,
}: {
  kind: PackagingStepKind;
  check: PackagingCheck;
  finished: ShopFinishedStep | null;
}) {
  const title = requirementTitle(kind);
  const owed = stepRequirement(check, kind);
  if (kind === "finished_photos") {
    if (finished?.stage === "in_review" || finished?.stage === "approved") {
      const { submission } = finished;
      return (
        <Row
          state="done"
          title={title}
          detail={`Sent ${formatDateTime(submission.at)}, ${photoCount(submission.photoFileIds.length)}.`}
        />
      );
    }
    if (finished?.stage === "to_send" && finished.sendBack) {
      return (
        <Row
          state="sent_back"
          title={title}
          detail="Fix it, then send new photos. GRIDGO cannot take the photos it already saw."
          quote={finished.sendBack.note || "No reason was written. Message the GRIDGO Team to ask."}
        />
      );
    }
    return owed ? (
      <Row
        state="needed"
        title={title}
        detail="Photograph every finished piece, unpacked, and send the photos for GRIDGO's review. Do not pack yet."
      />
    ) : (
      <Row state="done" title={title} detail="On the job." />
    );
  }
  if (finished?.stage === "approved") {
    return (
      <Row
        state="done"
        title={title}
        detail={`Approved ${formatDateTime(finished.review.at)}.`}
      />
    );
  }
  if (finished?.stage === "in_review") {
    return (
      <Row
        state="waiting"
        title={title}
        detail="GRIDGO is checking them now."
      />
    );
  }
  return owed ? (
    <Row
      state="upcoming"
      title={title}
      detail="GRIDGO checks your photos before a rider is called."
    />
  ) : (
    <Row state="done" title={title} detail="Approved." />
  );
}

function Row({
  state,
  title,
  detail,
  detailId,
  action,
  quote,
}: {
  state: RowState;
  title: string;
  detail: string;
  detailId?: string;
  action?: ReactNode;
  /** GRIDGO's own words, shown as written above the detail. */
  quote?: string;
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
      {quote ? (
        <blockquote className="border-outline text-body text-text-primary m-0 max-w-prose border-l-2 pl-3">
          {quote}
        </blockquote>
      ) : null}
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
