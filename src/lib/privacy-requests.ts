/**
 * Privacy requests (contract "Privacy requests" in `gridgo-api/docs/LEGAL_API.md`).
 *
 * A manual queue: "See my data", "Correct my data" and "Delete my account" in
 * the apps each create a request here. Nothing is exported, edited or deleted
 * automatically; staff do it by hand and write down what they did.
 */

import { isApiError } from "@/lib/api/client";
import type {
  PrivacyRequest,
  PrivacyRequestKind,
  PrivacyRequestStatus,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

export const PRIVACY_TEXT_LIMIT = 4_000;

/** The words the apps put on the button that made the request. */
export const PRIVACY_KIND_LABEL: Record<PrivacyRequestKind, string> = {
  access: "See my data",
  correction: "Correct my data",
  deletion: "Delete my account",
};

/** What staff do for each kind, by hand. */
export const PRIVACY_KIND_TASK: Record<PrivacyRequestKind, string> = {
  access:
    "Confirm it is really them, then send a copy of the personal data GRIDGO holds about them.",
  correction:
    "Confirm it is really them, then correct the details they asked about.",
  deletion:
    "Confirm it is really them, then delete the account and personal data by hand. Keep records the law requires, such as invoices, and tell them which were kept and why.",
};

export const PRIVACY_STATUSES: readonly PrivacyRequestStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "rejected",
];

type Chip = { tone: StatusTone; icon: StatusIconName; label: string };

const STATUS_CHIP: Record<PrivacyRequestStatus, Chip> = {
  pending: { tone: "info", icon: "circle-dot", label: "New" },
  in_progress: { tone: "neutral", icon: "square-pen", label: "In progress" },
  completed: { tone: "success", icon: "circle-check", label: "Completed" },
  rejected: { tone: "neutral", icon: "ban", label: "Declined" },
};

export function privacyStatusChip(status: PrivacyRequestStatus): Chip {
  return STATUS_CHIP[status];
}

export function privacyStatusLabel(status: PrivacyRequestStatus): string {
  return STATUS_CHIP[status].label;
}

export function isOpenPrivacyRequest(request: Pick<PrivacyRequest, "status">): boolean {
  return request.status === "pending" || request.status === "in_progress";
}

/** A finished request needs a written resolution the requester can read. */
export function needsResolution(status: PrivacyRequestStatus): boolean {
  return status === "completed" || status === "rejected";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole Manila calendar days from `now` to `iso` (negative when past). */
export function daysUntil(iso: string, now: number): number {
  const day = (ms: number) => Math.floor((ms + 8 * 60 * 60 * 1000) / DAY_MS);
  return day(Date.parse(iso)) - day(now);
}

/**
 * How close an open request is to its due date. Words carry the meaning; the
 * colour only repeats it.
 */
export function dueChip(request: Pick<PrivacyRequest, "status" | "dueAt">, now: number): Chip | null {
  if (!isOpenPrivacyRequest(request)) return null;
  const days = daysUntil(request.dueAt, now);
  if (Number.isNaN(days)) return null;
  if (days < 0) {
    const late = -days;
    return { tone: "error", icon: "triangle-alert", label: `Overdue by ${late} ${late === 1 ? "day" : "days"}` };
  }
  if (days === 0) return { tone: "warning", icon: "clock", label: "Due today" };
  if (days <= 3) return { tone: "warning", icon: "clock", label: `Due in ${days} ${days === 1 ? "day" : "days"}` };
  return { tone: "neutral", icon: "clock", label: `Due in ${days} days` };
}

/** `YYYY-MM-DD` in Manila for a date input. */
export function isoToManilaDay(iso: string): string {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return "";
  return new Date(value + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** End of that Manila day (23:59), so "due on the 20th" means all of the 20th. */
export function manilaDayToDueIso(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const value = Date.parse(`${day}T23:59:00+08:00`);
  return Number.isNaN(value) ? "" : new Date(value).toISOString();
}

export type PrivacyFilter = "open" | PrivacyRequestStatus | "all";

export const PRIVACY_FILTERS: readonly { value: PrivacyFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Declined" },
  { value: "all", label: "All" },
];

/** Open requests first by due date, then the rest newest first. */
export function sortPrivacyRequests(rows: readonly PrivacyRequest[]): PrivacyRequest[] {
  return [...rows].sort((a, b) => {
    const openA = isOpenPrivacyRequest(a);
    const openB = isOpenPrivacyRequest(b);
    if (openA !== openB) return openA ? -1 : 1;
    if (openA) return Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.id.localeCompare(b.id);
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id);
  });
}

const PRIVACY_ERROR_COPY: Record<string, string> = {
  privacy_request_changed:
    "Someone else updated this request since you opened it. The latest is loaded; check it and save again.",
  resolution_required:
    "Write what was done before completing or declining. The requester reads it.",
  invalid_privacy_handler:
    "That person cannot handle privacy requests. Choose someone with Operations or Super Admin access.",
  invalid_privacy_request:
    "Something in the update is not valid. Check the due date and the resolution length.",
};

export function privacyErrorMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    const copy = PRIVACY_ERROR_COPY[err.code];
    if (copy) return copy;
    if (err.kind === "forbidden") return "Only Operations and Super Admin can work this queue.";
    if (err.kind === "unauthorized") return "Your session expired. Sign in again.";
    if (err.kind === "not_found") return "That request no longer exists. Refresh the queue.";
  }
  return fallback;
}
