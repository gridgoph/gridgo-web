/**
 * Suspended accounts: who is out, why, since when, and what reinstating them
 * brings back.
 *
 * Pure on purpose (no React, no fetching) so the banner wording and the
 * reinstate choices are testable. The approvals queue (`SignupApprovals`) and
 * the Roles directory both read from here, so a suspension reads the same on
 * each surface.
 */

import type {
  ApprovalCaseDetail,
  ApprovalCaseQueueItem,
  SuspendedServiceLine,
  User,
} from "@/lib/api/types";
import { formatDate } from "@/lib/format";

export type SuspendedKind = "supplier" | "rider" | "business_client";

/**
 * One suspended account as the queue shows it. `caseId` is null only for a
 * legacy suspension with no approval case behind it; that account can still be
 * reinstated, but only through the old verification route, account only.
 */
export type SuspendedAccount = {
  key: string;
  userId: string;
  caseId: string | null;
  caseVersion: number | null;
  kind: SuspendedKind;
  title: string;
  caption: string;
  reason: string | null;
  suspendedAt: string | null;
  suspendedBy: string | null;
  user: User | null;
};

/** The shop's queue view. `all` keeps every section on one page. */
export type QueueView = "all" | "waiting" | "suspended" | "decided";

export const QUEUE_VIEWS: readonly QueueView[] = [
  "all",
  "waiting",
  "suspended",
  "decided",
];

/** `?show=suspended` deep-links from Roles; anything unknown is the whole queue. */
export function queueView(value: string | null | undefined): QueueView {
  return QUEUE_VIEWS.includes(value as QueueView) ? (value as QueueView) : "all";
}

export const QUEUE_VIEW_LABEL: Record<QueueView, string> = {
  all: "Everything",
  waiting: "Waiting",
  suspended: "Suspended",
  decided: "Decided",
};

const KIND_LABEL: Record<SuspendedKind, string> = {
  supplier: "Supplier",
  rider: "Rider",
  business_client: "Business client",
};

/** Where this deep link lands for the signed-in desk. */
export function suspendedQueueHref(tree: "ops" | "admin"): string {
  return tree === "ops"
    ? "/ops/approvals?tab=signups&show=suspended"
    : "/admin/verification?tab=signups&show=suspended";
}

/**
 * The legacy route stores the fallback words "Verification suspended" when no
 * reason was typed. That is not a reason; say plainly that none was given.
 */
export function suspensionReasonText(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim();
  if (!trimmed || trimmed === "Verification suspended") return null;
  return trimmed;
}

/** "Suspended on 18 Sep 2026 by Ana Reyes: Unpaid rent on the shop" */
export function suspensionHeadline(
  account: Pick<SuspendedAccount, "suspendedAt" | "suspendedBy">,
): string {
  const when = account.suspendedAt ? ` on ${formatDate(account.suspendedAt)}` : "";
  const who = account.suspendedBy ? ` by ${account.suspendedBy}` : "";
  return `Suspended${when}${who}`;
}

export function suspensionBannerText(account: SuspendedAccount): string {
  const reason = suspensionReasonText(account.reason);
  return `${suspensionHeadline(account)}: ${reason ?? "no reason was recorded"}`;
}

/**
 * The deciding actor's display name. Newer APIs send it; older ones send only
 * the id, which the directory (when this desk may read it) can turn into a name.
 */
export function actorName(
  item: { decidedBy?: string | null; decidedByName?: string | null },
  directory: ReadonlyMap<string, string>,
): string | null {
  if (item.decidedByName?.trim()) return item.decidedByName.trim();
  if (item.decidedBy) return directory.get(item.decidedBy) ?? null;
  return null;
}

function personTitle(user: User): string {
  return user.supplierName || user.name;
}

function personCaption(
  kind: SuspendedKind,
  user: User | null,
  fallback?: string,
): string {
  return [
    KIND_LABEL[kind],
    user?.supplierName ? user.name : null,
    user?.email ?? fallback,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Every suspended account in one list, newest suspension first.
 *
 * Supplier and rider suspensions arrive twice — as a suspended approval case
 * and as `verificationStatus: "suspended"` on the person. The case wins
 * because only a case can bring service lines back; a suspended person with
 * no case (an old legacy suspension) still shows, so nobody falls through.
 */
export function collectSuspendedAccounts({
  cases,
  people,
  business,
  directory,
}: {
  cases: readonly ApprovalCaseQueueItem[];
  people: readonly User[];
  business: readonly ApprovalCaseDetail[];
  directory: ReadonlyMap<string, string>;
}): SuspendedAccount[] {
  const accounts: SuspendedAccount[] = [];
  const seenUsers = new Set<string>();
  const peopleById = new Map(people.map((person) => [person.id, person]));

  for (const item of cases) {
    if (item.status !== "suspended") continue;
    if (item.kind === "business_client") continue; // from `business`, below
    const userId = item.applicant?.id;
    if (!userId) continue;
    const user = peopleById.get(userId) ?? null;
    seenUsers.add(`${item.kind}:${userId}`);
    accounts.push({
      key: item.id,
      userId,
      caseId: item.id,
      caseVersion: item.version,
      kind: item.kind,
      title: user ? personTitle(user) : item.applicant?.name || "Suspended account",
      caption: personCaption(item.kind, user, item.applicant?.email),
      reason: item.suspensionReason ?? user?.verificationNote ?? null,
      suspendedAt: item.decidedAt ?? item.updatedAt ?? null,
      suspendedBy: actorName(item, directory),
      user,
    });
  }

  for (const detail of business) {
    const item = detail.approvalCase;
    if (item.status !== "suspended") continue;
    accounts.push({
      key: item.id,
      userId: detail.applicant?.id ?? item.id,
      caseId: item.id,
      caseVersion: item.version,
      kind: "business_client",
      title:
        detail.application?.businessName ||
        detail.clientProfile?.businessName ||
        detail.applicant?.name ||
        "Business client",
      caption: [
        detail.application?.accountType === "organization"
          ? "Organization client"
          : "Business client",
        detail.applicant?.name,
        detail.applicant?.email,
      ]
        .filter(Boolean)
        .join(" · "),
      reason: item.suspensionReason,
      suspendedAt: item.decidedAt ?? item.updatedAt ?? null,
      suspendedBy: actorName(item, directory),
      user: null,
    });
  }

  for (const person of people) {
    if (person.verificationStatus !== "suspended") continue;
    const kind: SuspendedKind = person.role === "rider" ? "rider" : "supplier";
    if (seenUsers.has(`${kind}:${person.id}`)) continue;
    accounts.push({
      key: `user:${person.id}`,
      userId: person.id,
      caseId: null,
      caseVersion: null,
      kind,
      title: personTitle(person),
      caption: personCaption(kind, person),
      reason: person.verificationNote ?? null,
      suspendedAt: person.verifiedAt ?? null,
      suspendedBy: actorName({ decidedBy: person.verifiedBy }, directory),
      user: person,
    });
  }

  return accounts.sort((a, b) =>
    (b.suspendedAt ?? "").localeCompare(a.suspendedAt ?? ""),
  );
}

/** Lines that went down with the account start ticked; the rest never can be. */
export function preselectedServiceIds(lines: readonly SuspendedServiceLine[]): string[] {
  return lines.filter((line) => line.suspendedWithAccount).map((line) => line.id);
}

function lineCount(count: number): string {
  return `${count} service ${count === 1 ? "line" : "lines"}`;
}

/**
 * The one sentence the reinstate dialog says before anyone presses the button.
 * `lines` is null when this API cannot list (or restore) service lines.
 */
export function reinstateConsequence({
  name,
  kind,
  lines,
  selected,
}: {
  name: string;
  kind: SuspendedKind;
  lines: readonly SuspendedServiceLine[] | null;
  selected: readonly string[];
}): string {
  if (kind === "business_client") {
    return `${name} can place business orders again.`;
  }
  if (kind === "rider") {
    return `${name} starts receiving dispatch offers again.`;
  }
  if (lines === null) {
    return `${name} can be matched to new work again, but every suspended service line stays suspended until someone verifies it on the Service lines tab.`;
  }
  const kept = lines.length - selected.length;
  if (!lines.length) {
    return `${name} can be matched to new work again. No service lines are suspended.`;
  }
  if (!selected.length) {
    return `${name} can be matched to new work again, but all ${lineCount(lines.length)} stay suspended until someone verifies them on the Service lines tab.`;
  }
  const back = `${name} can be matched to new work again and ${lineCount(selected.length)} go${selected.length === 1 ? "es" : ""} back live`;
  return kept
    ? `${back}; the other ${kept === 1 ? "one stays" : `${kept} stay`} suspended.`
    : `${back}.`;
}

/** What the queue says once the reinstate landed, naming the lines that came back. */
export function reinstateOutcome({
  name,
  lines,
  requested,
  restoredServiceIds,
}: {
  name: string;
  lines: readonly SuspendedServiceLine[] | null;
  requested: readonly string[];
  restoredServiceIds: readonly string[] | undefined;
}): { headline: string; restored: string[]; stillSuspended: string[] } {
  const all = lines ?? [];
  const byId = new Map(all.map((line) => [line.id, line.name]));
  // An older API ignores the list it was sent. Only what the server says it
  // restored counts as restored.
  const restoredIds = new Set(restoredServiceIds ?? []);
  const restored = [...restoredIds].map((id) => byId.get(id) ?? "A service line");
  const stillSuspended = all
    .filter((line) => !restoredIds.has(line.id))
    .map((line) => line.name);
  const headline =
    requested.length && restoredServiceIds === undefined
      ? `${name} is reinstated. The server did not confirm any service lines, so check the Service lines tab.`
      : `${name} is reinstated.`;
  return { headline, restored, stillSuspended };
}

/** What the Roles directory needs to say about one suspended person. */
export type UserSuspension = Pick<
  SuspendedAccount,
  "reason" | "suspendedAt" | "suspendedBy"
> & { kinds: SuspendedKind[] };

/**
 * Suspensions by user id, for surfaces that list people rather than cases.
 * A person can hold more than one suspended membership (a shop owner who is
 * also a business client); the latest suspension speaks for them.
 */
export function suspensionsByUser({
  cases,
  users,
  directory,
}: {
  cases: readonly ApprovalCaseQueueItem[];
  users: readonly User[];
  directory: ReadonlyMap<string, string>;
}): Map<string, UserSuspension> {
  const index = new Map<string, UserSuspension>();
  const add = (
    userId: string,
    kind: SuspendedKind,
    entry: Omit<UserSuspension, "kinds">,
  ) => {
    const prev = index.get(userId);
    if (!prev) {
      index.set(userId, { ...entry, kinds: [kind] });
      return;
    }
    const kinds = prev.kinds.includes(kind) ? prev.kinds : [...prev.kinds, kind];
    const newer = (entry.suspendedAt ?? "") > (prev.suspendedAt ?? "");
    index.set(userId, { ...(newer ? entry : prev), kinds });
  };
  for (const item of cases) {
    if (item.status !== "suspended" || !item.applicant?.id) continue;
    add(item.applicant.id, item.kind, {
      reason: item.suspensionReason,
      suspendedAt: item.decidedAt ?? item.updatedAt ?? null,
      suspendedBy: actorName(item, directory),
    });
  }
  for (const user of users) {
    if (user.verificationStatus !== "suspended" || index.has(user.id)) continue;
    add(user.id, user.role === "rider" ? "rider" : "supplier", {
      reason: user.verificationNote ?? null,
      suspendedAt: user.verifiedAt ?? null,
      suspendedBy: actorName({ decidedBy: user.verifiedBy }, directory),
    });
  }
  return index;
}
