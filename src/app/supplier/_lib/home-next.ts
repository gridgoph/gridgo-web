import type { Order } from "@/lib/api/types";
import {
  primaryAction,
  shopLetJobGo,
  shopWorkStopped,
  supplierWaitingOn,
  type SupplierActionKind,
} from "@/lib/supplier-actions";
import { shopRelease } from "@/lib/supplier-recovery";

export type NextObligation = {
  id: string;
  title: string;
  detail: string;
  href: string;
  rank: number;
};

const DECIDE: SupplierActionKind[] = ["accept", "decline"];

/** Proof, then a decision, then production, then a pickup. */
export function nextObligations(jobs: Order[], now: Date = new Date()): NextObligation[] {
  const rows: NextObligation[] = [];
  for (const job of jobs) {
    if (shopRelease(job) || shopLetJobGo(job) || shopWorkStopped(job, now)) continue;
    const href = `/supplier/jobs/${job.id}`;
    const action = primaryAction(job, now);
    if (action?.blockedReason) continue;
    if (action?.kind === "add_proof") {
      rows.push({
        id: `${job.id}:proof`,
        title: job.title,
        detail: action.label,
        href,
        rank: 0,
      });
      continue;
    }
    if (action && DECIDE.includes(action.kind)) {
      rows.push({
        id: `${job.id}:decide`,
        title: job.title,
        detail: action.label,
        href,
        rank: 1,
      });
      continue;
    }
    if (action) {
      rows.push({
        id: `${job.id}:produce`,
        title: job.title,
        detail: action.label,
        href,
        rank: 2,
      });
      continue;
    }
    if (
      (job.state === "ready_for_dispatch" || job.state === "rider_assigned") &&
      job.pickupChecklist?.status !== "failed_escalated"
    ) {
      rows.push({
        id: `${job.id}:pickup`,
        title: job.title,
        detail: supplierWaitingOn(job.state, job) ?? "Prepare for pickup",
        href,
        rank: 3,
      });
    }
  }
  return rows.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

const SETUP_HREF: Record<string, string> = {
  edit_profile: "/supplier/shop",
  view_approval: "/supplier/documents",
  edit_services: "/supplier/services",
  edit_service: "/supplier/services",
  edit_service_formats: "/supplier/services",
  view_service: "/supplier/services",
  edit_listings: "/supplier/catalogue",
  edit_listing: "/supplier/catalogue",
  upload_listing_photo: "/supplier/catalogue",
  edit_listing_formats: "/supplier/catalogue",
  edit_listing_options: "/supplier/catalogue",
  view_listing_review: "/supplier/catalogue",
  activate_listing: "/supplier/catalogue",
  open_shop: "/supplier/shop-hours",
  review_schedule: "/supplier/capacity",
  contact_operations: "/supplier/chat",
};

/** A setup step the portal can open, or null when the portal has no screen for it. */
export function setupHref(action: string): string | null {
  return SETUP_HREF[action] ?? null;
}

export type SetupStep = { message: string; href: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stepsOf(raw: unknown): { message: string; action: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (
      !isRecord(row) ||
      typeof row.message !== "string" ||
      typeof row.action !== "string"
    )
      return [];
    return [{ message: row.message, action: row.action }];
  });
}

/** The next setup step a shop can open here. Steps with no portal screen are skipped. */
export function nextSetupStep(body: unknown): SetupStep | null {
  if (!isRecord(body)) return null;
  const operational = isRecord(body.operational) ? body.operational : null;
  const profile = isRecord(body.profileCompletion) ? body.profileCompletion : null;
  const steps = [...stepsOf(operational?.missing), ...stepsOf(profile?.missing)];
  for (const step of steps) {
    const href = setupHref(step.action);
    if (href) return { message: step.message, href };
  }
  return null;
}

export function shopIsReady(body: unknown): boolean {
  return isRecord(body) && isRecord(body.operational) && body.operational.ready === true;
}
