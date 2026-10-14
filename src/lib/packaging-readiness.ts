/**
 * What still stands between a job and packaging, as the API counts it.
 *
 * Contract: `gridgo-api/docs/SUPPLIER_JOB_READINESS_API.md` (report 6C695C15,
 * gridgo-api#228). Shops pressed the packaging step and were told only that
 * it did not work. The API now sends, on every read of the job, everything it
 * would refuse the step for (both photos, an open claim, a stopped job), each
 * in its own sentence, and a refused step answers with the same list. This
 * module is the only place that reads either, so the list a shop sees before
 * pressing is the list the API checks after. The supplier app reads it the
 * same way (`gridgo-supplier/lib/packagingReadiness.ts`).
 *
 * It is a snapshot, not a promise: the step is checked again when pressed. A
 * job read from an older API has no list, and the screens keep their older
 * photo gates. A receipt scan is optional and never in the list.
 *
 * Pure functions: no React, no fetch.
 */

import { ApiError } from "@/lib/api/client";
import type { Order, TransitionReadiness } from "@/lib/api/types";

/** What a shop can do about one requirement, in its own vocabulary. */
export type RequirementKind =
  "production_photo" | "packing_photo" | "claim" | "job_stopped" | "moved_on" | "other";

export type Requirement = { kind: RequirementKind; code: string; message: string };

const REQUIREMENT_KINDS: Record<string, RequirementKind> = {
  production_photo_required: "production_photo",
  packing_photo_required: "packing_photo",
  claim_hold_active: "claim",
  refund_fulfillment_stopped: "job_stopped",
  reschedule_fulfillment_stopped: "job_stopped",
  shop_recovery_pending: "job_stopped",
  transition_not_allowed: "moved_on",
};

/** This portal's sentence for a code, when the API sent none a shop can read. */
const FALLBACK_SENTENCES: Record<string, string> = {
  production_photo_required:
    "Add a progress photo before packing this job. A start-of-production photo counts; a PDF does not.",
  packing_photo_required:
    "Add a photo of the finished prints packed and ready before marking Ready for dispatch.",
  claim_hold_active:
    "A claim is holding payouts on this order. Operations must clear the claim before you package it for pickup.",
  refund_fulfillment_stopped:
    "A refund request has stopped work on this job. Operations will tell you whether to carry on.",
  reschedule_fulfillment_stopped:
    "A deadline change is waiting on the client, so work on this job is paused until they answer.",
  shop_recovery_pending:
    "Operations is deciding who finishes this job, so it is paused for now.",
  transition_not_allowed:
    "That step is no longer available for this job. Refresh to see where it stands.",
};

const UNKNOWN_SENTENCE =
  "GRIDGO needs something else on this job first. Ask Operations what it is.";

/**
 * The API's own sentence, when it is one a shop can read. One that is only a
 * code, or carries a code in it, is not shown; this portal's sentence for
 * that code is used instead, so no snake_case reaches a screen.
 */
function plainSentence(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || !/\s/.test(text) || /\b[a-z0-9]+_[a-z0-9_]+\b/.test(text)) return null;
  return text;
}

function requirementOf(raw: unknown): Requirement | null {
  if (typeof raw !== "object" || raw === null) return null;
  const code =
    typeof (raw as { code?: unknown }).code === "string"
      ? (raw as { code: string }).code
      : "";
  const message =
    plainSentence((raw as { message?: unknown }).message) ?? FALLBACK_SENTENCES[code];
  if (!code && !message) return null;
  return {
    kind: REQUIREMENT_KINDS[code] ?? "other",
    code,
    message: message ?? UNKNOWN_SENTENCE,
  };
}

/** Everything listed as still missing, in the API's order. */
export function readRequirements(value: unknown): Requirement[] {
  if (!Array.isArray(value)) return [];
  return value.map(requirementOf).filter((item): item is Requirement => item !== null);
}

export type PackagingCheck = {
  /** The API would take "Ready for dispatch" as of this read. */
  allowed: boolean;
  /** Still needed, in the API's order. */
  missing: Requirement[];
  /** Both photos, ticked or not, so a shop sees what is done as well as what is not. */
  photos: { kind: "production_photo" | "packing_photo"; done: boolean }[];
  /** True once a receipt scan is on the job. It never holds the step. */
  receiptAttached: boolean;
};

type ReadinessOrder = Pick<Order, "state"> & Partial<Pick<Order, "transitionReadiness">>;

/** The check for the job's packaging step, or null where there is none to show. */
export function packagingCheck(order: ReadinessOrder): PackagingCheck | null {
  if (order.state !== "production" && order.state !== "supplier_self_qc") return null;
  const raw: TransitionReadiness | undefined =
    order.transitionReadiness?.ready_for_dispatch;
  if (!raw || typeof raw !== "object") return null;
  const missing = readRequirements(raw.missing);
  const owes = (kind: RequirementKind) => missing.some((item) => item.kind === kind);
  return {
    allowed: raw.allowed === true && missing.length === 0,
    missing,
    photos: [
      { kind: "production_photo", done: !owes("production_photo") },
      { kind: "packing_photo", done: !owes("packing_photo") },
    ],
    receiptAttached: raw.receiptScan?.attached === true,
  };
}

export function isPhotoRequirement(kind: RequirementKind): boolean {
  return kind === "production_photo" || kind === "packing_photo";
}

/** Requirements the shop cannot meet itself: a claim, a stopped job, a job that moved on. */
export function otherRequirements(check: PackagingCheck): Requirement[] {
  return check.missing.filter((item) => !isPhotoRequirement(item.kind));
}

/**
 * The first thing holding packaging that only someone else can lift. While
 * one stands, the step would only be refused, so it is shown disabled with
 * this sentence.
 */
export function packagingHold(check: PackagingCheck | null): Requirement | null {
  return check ? (otherRequirements(check)[0] ?? null) : null;
}

/** The API's sentence for a photo it still needs, if it needs it. */
export function photoRequirement(
  check: PackagingCheck,
  kind: RequirementKind,
): Requirement | null {
  return check.missing.find((item) => item.kind === kind) ?? null;
}

/** Operations is the way forward: a claim, or something this portal does not know. */
export function needsOperations(kind: RequirementKind): boolean {
  return kind === "claim" || kind === "other";
}

/** A row's name, in the shop's words. */
export function requirementTitle(kind: RequirementKind): string {
  switch (kind) {
    case "production_photo":
      return "Production photo";
    case "packing_photo":
      return "Packing photo";
    case "claim":
      return "Client claim open";
    case "job_stopped":
      return "Job paused";
    case "moved_on":
      return "Job has moved on";
    default:
      return "Something else first";
  }
}

/**
 * A step the API refused, in its own words: the sentence it answered with,
 * and every requirement still missing, not only the first. Null for anything
 * that is not a refusal (no connection, a server fault), which keeps its own
 * recovery copy.
 */
export function stepRefusal(
  error: unknown,
): { code: string; message: string; missing: Requirement[] } | null {
  if (!(error instanceof ApiError) || ![400, 403, 409].includes(error.status))
    return null;
  const body =
    typeof error.body === "object" && error.body !== null
      ? (error.body as Record<string, unknown>)
      : {};
  const message = plainSentence(body.message) ?? FALLBACK_SENTENCES[error.code];
  if (!message) return null;
  return { code: error.code, message, missing: readRequirements(body.missing) };
}
