/**
 * Organization accounts as Operations and Super Admin read them
 * (gridgoph/gridgo-client#164 and #165; contract gridgo-api
 * docs/ORGANIZATION_ACCOUNTS_API.md).
 *
 * Every three months the organization is asked to confirm its officer is
 * still the same person. The API keeps that schedule; this file only words it.
 *
 * Pure: no React, no fetch.
 */

import type { OrganizationAccount } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import { formatDate } from "@/lib/format";

/** `POST /ops/organizations/:userId/notice` limits. */
export const NOTICE_TITLE_MAX = 160;
export const NOTICE_BODY_MAX = 2000;

export function noticeProblems(input: { title: string; body: string }): {
  title: string | null;
  body: string | null;
} {
  const title = input.title.trim();
  const body = input.body.trim();
  return {
    title: !title
      ? "Give the notice a title."
      : title.length > NOTICE_TITLE_MAX
        ? `Keep the title to ${NOTICE_TITLE_MAX} characters.`
        : null,
    body: !body
      ? "Write the message."
      : body.length > NOTICE_BODY_MAX
        ? `Keep the message to ${NOTICE_BODY_MAX} characters.`
        : null,
  };
}

export type Standing = { label: string; tone: StatusTone; icon: StatusIconName };

/** The one chip on the organization page: whether someone answers for it. */
export function organizationStanding(organization: OrganizationAccount): Standing {
  const status = organization.approvalCase?.status;
  if (status === "suspended")
    return { label: "Suspended", tone: "error", icon: "triangle-alert" };
  if (!organization.currentOfficer) {
    return status === "pending"
      ? { label: "First officer waiting for review", tone: "warning", icon: "clock" }
      : { label: "No verified officer", tone: "neutral", icon: "circle-help" };
  }
  if (status === "pending")
    return { label: "Handover waiting for review", tone: "warning", icon: "clock" };
  if (organization.confirmationRequestedAt)
    return { label: "Officer confirmation due", tone: "warning", icon: "clock" };
  return { label: "Officer verified", tone: "success", icon: "circle-check" };
}

/** Where the quarterly confirm-the-officer reminder stands, in one sentence. */
export function confirmationLine(organization: OrganizationAccount): string {
  if (!organization.currentOfficer) {
    return "Quarterly officer reminders start once a first officer is verified.";
  }
  const officer = organization.currentOfficer.fullName;
  if (organization.confirmationRequestedAt) {
    return `Reminder sent ${formatDate(organization.confirmationRequestedAt)}. Waiting for the organization to confirm ${officer} is still the officer, or start a handover.`;
  }
  const last = organization.confirmedAt
    ? `Last confirmed ${formatDate(organization.confirmedAt)}. `
    : "";
  return organization.nextConfirmationAt
    ? `${last}Next reminder to confirm ${officer} on ${formatDate(organization.nextConfirmationAt)}.`
    : `${last}No reminder is scheduled.`;
}
