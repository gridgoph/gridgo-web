import type { RescheduleRequest, RescheduleResolution } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/**
 * The shop's one request for a later ready-by (gridgo-api `docs/ORDER_RESCHEDULE_API.md`).
 *
 * Nothing about the promise moves until the client accepts. A decline, or a
 * request Operations is holding, stops the work. This is the shop's reading
 * of that request — not the Operations desk.
 */

export type ShopReschedule = Pick<
  RescheduleRequest,
  "status" | "resolution" | "workHeld" | "originalReadyBy" | "proposedReadyBy" | "expiresAt"
>;

export type RescheduleNotice = {
  chip: { label: string; tone: StatusTone; icon: StatusIconName };
  title: string;
  body: string;
  /** True while the client's answer has stopped the job. */
  stopped: boolean;
};

function when(value: string | null | undefined): string {
  return formatDateTime(value);
}

/** Where a request stands, in the shop's words. */
export function rescheduleNotice(request: ShopReschedule): RescheduleNotice {
  const original = when(request.originalReadyBy);
  const proposed = when(request.proposedReadyBy);
  switch (request.status) {
    case "pending":
      return {
        chip: { label: "Waiting for the client", tone: "info", icon: "clock" },
        title: `You asked for ${proposed}`,
        body: `The client has until ${when(request.expiresAt)} to answer. Until then your ready-by stays ${original} — keep working to it.`,
        stopped: false,
      };
    case "accepted":
      return {
        chip: { label: "Accepted", tone: "success", icon: "circle-check" },
        title: "The client agreed to the new deadline",
        body: `Your ready-by is now ${proposed}. Late production is measured against it.`,
        stopped: false,
      };
    case "expired":
      return {
        chip: { label: "Not answered", tone: "neutral", icon: "clock" },
        title: "The client did not answer in time",
        body: `Your ready-by stays ${original}. Operations has been told and will follow up with you.`,
        stopped: false,
      };
    case "operations_required":
      return {
        chip: { label: "With Operations", tone: "info", icon: "clock" },
        title: "Operations is deciding this one",
        body: request.workHeld
          ? "A late-production deduction already applies to this job, so Operations decides what happens next. Pause work until they contact you."
          : "A late-production deduction already applies to this job, so Operations decides what happens next. Your dates stay as they are until then.",
        stopped: request.workHeld,
      };
    case "declined":
      return declinedNotice(request, original);
    default:
      return declinedNotice(request, original);
  }
}

function declinedNotice(request: ShopReschedule, original: string): RescheduleNotice {
  const chip = { label: "Declined", tone: "warning" as const, icon: "circle-x" as const };
  const resolution: RescheduleResolution | null = request.resolution;
  switch (resolution) {
    case "resolved":
      return {
        chip: { label: "Resolved", tone: "neutral", icon: "circle-check" },
        title: "Continue under your original deadline",
        body: `Operations agreed with the client that the job carries on. Your ready-by stays ${original}.`,
        stopped: false,
      };
    case "refund_requested":
      return {
        chip,
        title: "The client chose a refund",
        body: "The client declined the new deadline and asked for a full refund. Stop work on this job; nothing more is needed from you.",
        stopped: true,
      };
    case "rematched":
      return {
        chip,
        title: "The job moved to another shop",
        body: "The client declined the new deadline and accepted another shop. Nothing more is needed from you.",
        stopped: true,
      };
    case "operations_required":
      return {
        chip,
        title: "The client declined the new deadline",
        body: "Part of this job's money already reached you, so Operations decides what happens next. Pause work until they contact you.",
        stopped: true,
      };
    default:
      return {
        chip,
        title: "The client declined the new deadline",
        body: "Pause work on this job. GRIDGO is offering the client another shop or a full refund, and Operations will tell you what happens next.",
        stopped: true,
      };
  }
}

/** True when this request has stopped the shop's work. */
export function rescheduleStopped(request: ShopReschedule | null | undefined): boolean {
  return Boolean(request && rescheduleNotice(request).stopped);
}
