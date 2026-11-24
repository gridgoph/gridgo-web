/**
 * Shop Owner and Staff: the words, links and rules the supplier Team page,
 * the join page, Staff mode and Operations share (gridgo-api
 * docs/SHOP_TEAM_API.md). Pure, so it is tested without React.
 */

import type {
  OrderAction,
  OrderActor,
  ShopInvite,
  ShopInviteKind,
  ShopMember,
  ShopMemberStatus,
  ShopPinStaff,
  ShopRole,
  ShopSummary,
  ShopTeamMemberStats,
  ShopTeamMission,
  ShopTeamStats,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

/** Where an invite opens. The shop app reads the same link (gridgo-supplier). */
export const JOIN_TEAM_PATH = "/join-team";

/**
 * The link an Owner shares and the QR encodes:
 * `https://gridgo-dash.talasora.com/join-team#token=<token>`. The token rides
 * in the fragment so it never reaches a server log.
 */
export function joinTeamUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${JOIN_TEAM_PATH}#token=${encodeURIComponent(token)}`;
}

/**
 * Where "Messenger" sends a join link. On a phone, the Messenger app's share
 * link opens a new message with the link filled in. A computer has no such
 * link without a Facebook app id, so it opens Messenger and the Owner pastes
 * the link, which the button has already copied.
 */
export function messengerShareTarget(
  url: string,
  userAgent: string,
): { href: string; prefilled: boolean } {
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
    ? { href: `fb-messenger://share/?link=${encodeURIComponent(url)}`, prefilled: true }
    : { href: "https://www.messenger.com/", prefilled: false };
}

/** The API's tokens are 43 base64url characters; anything else is not one. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The invite token in a join link's fragment, or null. */
export function joinTokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("token")?.trim() ?? "";
  return TOKEN.test(token) ? token : null;
}

export const SHOP_ROLE_LABEL: Record<ShopRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export function shopRoleLabel(role: string | null | undefined): string {
  return role === "owner" || role === "manager" || role === "staff"
    ? SHOP_ROLE_LABEL[role]
    : "Member";
}

/**
 * Not the Owner: no Money, no payout, no Owner settings. Absent `shop` means
 * the Owner account. A Manager is "staff" here because the API strips money
 * from them exactly as it does for Staff.
 */
export function isShopStaff(shop: Pick<ShopSummary, "role"> | null | undefined): boolean {
  return shop?.role === "staff" || shop?.role === "manager";
}

/**
 * What a shop role may do, the same split as the phone app and the API's
 * allowlists (gridgo-api docs/SHOP_TEAM_API.md, EXPRESS_API.md):
 *
 * - Owner: everything, and alone sees Money, payout and the shop's status
 *   switches (the API lets only Owners write `/me/shop-status` this release).
 * - Manager: also changes hours, products and Staff; never Money.
 * - Staff: work, plus a read-only My shop and the positive team view.
 *
 * Hiding is a courtesy: the API refuses every route on its own.
 */
export type ShopCapabilities = {
  money: boolean;
  editStatus: boolean;
  editHours: boolean;
  editProducts: boolean;
  manageTeam: boolean;
  /** Grant or take back Manager, hide the ranking: the Owner's alone. */
  ownerSettings: boolean;
  /** Per-person counts and speed: Owners and Managers. */
  personStats: boolean;
};

export function shopCapabilities(role: ShopRole | null | undefined): ShopCapabilities {
  const owner = role !== "staff" && role !== "manager";
  const runsShop = owner || role === "manager";
  return {
    money: owner,
    editStatus: owner,
    editHours: runsShop,
    editProducts: runsShop,
    manageTeam: runsShop,
    ownerSettings: owner,
    personStats: runsShop,
  };
}

// ---- Team list --------------------------------------------------------------

const ROLE_ORDER: Record<ShopRole, number> = { owner: 0, manager: 1, staff: 2 };

/** Waiting people first (they need the Owner), then Owners, then Staff, by name. */
export function teamRows(members: readonly ShopMember[]): {
  pending: ShopMember[];
  active: ShopMember[];
} {
  const byName = (a: ShopMember, b: ShopMember) => a.name.localeCompare(b.name);
  return {
    pending: members.filter((m) => m.status === "pending").sort(byName),
    active: members
      .filter((m) => m.status === "active")
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || byName(a, b)),
  };
}

export function activeOwnerCount(members: readonly ShopMember[]): number {
  return members.filter((m) => m.role === "owner" && m.status === "active").length;
}

/** The API refuses to leave a shop without an active Owner (`409 last_shop_owner`). */
export function isLastOwner(member: ShopMember, members: readonly ShopMember[]): boolean {
  return member.role === "owner" && member.status === "active" && activeOwnerCount(members) <= 1;
}

export function openInvites(invites: readonly ShopInvite[], now = Date.now()): ShopInvite[] {
  return invites
    .filter((invite) => invite.status === "open" && Date.parse(invite.expiresAt) > now)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const INVITE_KIND_LABEL: Record<ShopInviteKind, string> = {
  email: "Email",
  phone: "Phone",
  qr: "QR code",
  link: "Link",
  owner: "Owner claim",
};

/** What an open invite row says: who it is for, or how it was shared. */
export function inviteTitle(invite: ShopInvite): string {
  return invite.identity?.trim() || `${INVITE_KIND_LABEL[invite.kind]} invite`;
}

/** "Expires in 47 h" / "in 12 min": how long the invite still works. */
export function inviteExpiresIn(expiresAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((Date.parse(expiresAt) - now) / 60_000));
  if (minutes <= 0) return "Expired";
  if (minutes < 60) return `Expires in ${minutes} min`;
  return `Expires in ${Math.floor(minutes / 60)} h`;
}

// ---- Invite input -----------------------------------------------------------

/** Lowercased email, or null when it is not one. Mirrors the API's check. */
export function normalizeInviteEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/**
 * A phone in E.164, as the API needs it. A Philippine mobile typed the local
 * way (0917 123 4567 or 917 123 4567) becomes +639171234567.
 */
export function normalizeInvitePhone(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, "");
  let phone = compact;
  if (/^09\d{9}$/.test(compact)) phone = `+63${compact.slice(1)}`;
  else if (/^9\d{9}$/.test(compact)) phone = `+63${compact}`;
  else if (/^63\d{10}$/.test(compact)) phone = `+${compact}`;
  return /^\+[1-9][0-9]{7,14}$/.test(phone) ? phone : null;
}

/** Email when it has an @, otherwise phone. One field takes either. */
export function parseInviteIdentity(
  value: string,
): { kind: "email" | "phone"; identity: string } | null {
  if (value.includes("@")) {
    const email = normalizeInviteEmail(value);
    return email ? { kind: "email", identity: email } : null;
  }
  const phone = normalizeInvitePhone(value);
  return phone ? { kind: "phone", identity: phone } : null;
}

// ---- Errors -----------------------------------------------------------------

const TEAM_ERROR_COPY: Record<string, string> = {
  last_shop_owner: "A shop needs at least one Owner. Make someone else Owner first.",
  shop_approval_required: "Approve this person before changing their role.",
  shop_invite_required: "This person was removed. Send them a new invite.",
  shop_member_not_found: "This person is no longer on the team.",
  shop_invite_not_found: "This invite no longer exists.",
  shop_invite_used: "This invite was already used.",
  shop_invite_revoked: "This invite was cancelled.",
  shop_invite_expired: "This invite expired.",
  invalid_invite_identity: "Enter a valid email or mobile number.",
  shop_owner_required: "Only an Owner can do this.",
  shop_member_exists: "You are already on this shop's team.",
  shop_invite_identity_mismatch:
    "This invite is for a different email or number. Sign in with that one.",
  email_already_registered:
    "Your email belongs to another GRIDGO account. Sign in with that account.",
  clerk_unavailable: "We could not check your sign-in. Try again.",
  invalid_shop_invite_claim: "This invite link is not complete. Ask for a new one.",
  shop_access_removed: "Your access to this shop was removed.",
  shop_approval_pending: "The Owner has not approved you yet.",
  invalid_shop_pin: "A PIN is exactly 4 numbers.",
  invalid_shop_member_name: "Enter a name of up to 100 letters.",
  invalid_shop_member_update: "Check the name and try again.",
  invalid_shop_team_settings: "That setting did not save. Try again.",
};

/** Plain words for a team API refusal; the API's `message` is never shown. */
export function shopTeamErrorCopy(code: string | null | undefined): string {
  return (code && TEAM_ERROR_COPY[code]) || "That did not go through. Try again.";
}

// ---- Who did it -------------------------------------------------------------

/** "Sam Santos · Staff", "Operations", "GRIDGO": who did an order action. */
export function actorLine(actor: OrderActor | null | undefined): string {
  if (!actor) return "";
  if (actor.role === "system" || (!actor.userId && actor.name === "System")) return "GRIDGO";
  const role =
    actor.role === "owner" || actor.role === "staff" || actor.role === "manager"
      ? SHOP_ROLE_LABEL[actor.role]
      : PLATFORM_ROLE_LABEL[actor.role];
  const name = actor.name?.trim();
  if (!name) return role ?? "";
  return role ? `${name} · ${role}` : name;
}

const PLATFORM_ROLE_LABEL: Record<string, string> = {
  ops_admin: "Operations",
  super_admin: "Super Admin",
  client: "Client",
  rider: "Rider",
  supplier: "Owner",
  staff: "GRIDGO staff",
};

const ACTION_LABEL: Record<string, string> = {
  "order.created": "Placed the order",
  "order.transition": "Moved the order on",
  "order.updated": "Updated the order",
  "order.special_instructions_acknowledged": "Read the special instructions",
  "order.arrived_packed": "Marked it packed",
  "order.rider_packing_photo": "Added a packing photo",
  "order.rider_assigned": "Assigned a rider",
  "order.file_check": "Checked the files",
  "order.production_override": "Moved it to ready",
  "order.supplier_assigned": "Assigned the shop",
  "order.supplier_changed": "Changed the shop",
  "order.artwork_download": "Downloaded the artwork",
  "order.artwork_download_all": "Downloaded all artwork",
  "order.qa_tick": "Ticked a quality check",
  "order.qa_request_file": "Asked for a new file",
  "order.confirm_delivery": "Confirmed delivery",
  "order.rated": "Rated the order",
  "order.physical_invoice_requested": "Asked for a paper invoice",
  "order.physical_invoice_promised": "Promised the paper invoice",
  "order.delivery_pin_requested": "Asked for the delivery PIN",
  "order.approval_recorded": "Recorded an approval",
  "order.transition_refused": "Tried a step that was refused",
  "dispatch.milestone": "Updated the delivery",
  "file.saved": "Added a file",
  "pickup_chat.message_sent": "Messaged the rider",
  "client_shop_chat.message_sent": "Messaged the client",
  "pickup_checklist.inspected": "Rider checked the order",
  "pickup_checklist.handoff_signed": "Signed the handover",
  "pickup_checklist.escalate": "Raised a pickup problem",
  "pickup_escalation.resolve": "Resolved a pickup problem",
  "handover.escalated": "Raised a handover problem",
  "claim.raise": "Opened a claim",
  "claim.hold": "Held payouts for a claim",
  "claim.release": "Released a claim hold",
  "order.remove": "Removed the order",
};

/** A recorded action in a few words. Unknown codes read as an update, never raw. */
export function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  if (action.startsWith("order.change")) return "Handled a change request";
  if (action.startsWith("order.reschedule")) return "Handled a deadline request";
  if (action.startsWith("order.shop_")) return "Changed the shop's part";
  if (action.startsWith("order.delivery_pin")) return "Handled the delivery PIN";
  if (action.startsWith("payment.")) return "Updated the payment";
  if (action.startsWith("refund.")) return "Updated a refund";
  if (action.startsWith("file.")) return "Updated a file";
  return "Updated the order";
}

/** Newest first, for "who did what" under an order. */
export function orderActionRows(actions: readonly OrderAction[] | undefined): Array<{
  id: string;
  what: string;
  who: string;
  when: string;
  at: string;
}> {
  return [...(actions ?? [])]
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .map((row) => ({
      id: row.id,
      what: actionLabel(row.action),
      who: actorLine(row.actor),
      when: formatDateTime(row.at),
      at: row.at,
    }));
}

// ---- Extended team: one roster of account and PIN people ----------------------

/** One person on the team, whether they sign in or work by PIN. */
export type TeamPerson = {
  /** `account:<userId>` or `pin:<id>`: unique across both kinds. */
  key: string;
  kind: "account" | "pin";
  id: string;
  name: string;
  role: ShopRole;
  status: ShopMemberStatus;
  jobAlerts: boolean;
  /** PIN people only: picked on a shop device right now. */
  onShift: boolean;
  createdAt?: string;
};

export function teamPeople(
  members: readonly ShopMember[],
  pinStaff: readonly ShopPinStaff[] | null,
): TeamPerson[] {
  return [
    ...members.map<TeamPerson>((m) => ({
      key: `account:${m.userId}`,
      kind: "account",
      id: m.userId,
      name: m.name,
      role: m.role,
      status: m.status,
      jobAlerts: m.jobAlerts !== false,
      onShift: false,
      createdAt: m.createdAt,
    })),
    ...(pinStaff ?? []).map<TeamPerson>((p) => ({
      key: `pin:${p.id}`,
      kind: "pin",
      id: p.id,
      name: p.name,
      role: p.role,
      status: p.status,
      jobAlerts: p.jobAlerts !== false,
      onShift: p.onShift === true,
      createdAt: p.createdAt,
    })),
  ];
}

/**
 * The team card's rows: Owners and Managers on the shop card, Staff in the
 * grid, each by name; pending people wait apart; removed people are gone.
 */
export function rosterOf(people: readonly TeamPerson[]): {
  leads: TeamPerson[];
  staff: TeamPerson[];
  pending: TeamPerson[];
} {
  const byName = (a: TeamPerson, b: TeamPerson) => a.name.localeCompare(b.name);
  const active = people.filter((p) => p.status === "active");
  return {
    leads: active
      .filter((p) => p.role !== "staff")
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || byName(a, b)),
    staff: active.filter((p) => p.role === "staff").sort(byName),
    pending: people.filter((p) => p.status === "pending").sort(byName),
  };
}

/** The stats row for a person, matched on their user or PIN id. */
export function statsFor(
  person: Pick<TeamPerson, "kind" | "id">,
  stats: ShopTeamStats | null,
): ShopTeamMemberStats | null {
  return (
    stats?.members?.find((row) =>
      person.kind === "pin" ? row.pinStaffId === person.id : row.userId === person.id,
    ) ?? null
  );
}

export function isFastest(
  person: Pick<TeamPerson, "kind" | "id">,
  stats: ShopTeamStats | null,
): boolean {
  const fastest = stats?.fastestThisWeek;
  if (!fastest) return false;
  return person.kind === "pin" ? fastest.pinStaffId === person.id : fastest.userId === person.id;
}

/** "38 sec", "2 min 5 sec": an average time to accept. Null when unmeasured. */
export function acceptTimeLabel(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest ? `${minutes} min ${rest} sec` : `${minutes} min`;
}

/** "4 of 10 jobs accepted within 5 minutes": the team's positive weekly goal. */
export function missionLine(mission: ShopTeamMission | null | undefined): string | null {
  if (!mission) return null;
  if (mission.completed) return `Done: ${mission.targetJobs} jobs accepted within 5 minutes this week`;
  return `${mission.quickAcceptedJobs} of ${mission.targetJobs} jobs accepted within 5 minutes`;
}

/** 0–100 for the mission bar. */
export function missionPercent(mission: ShopTeamMission | null | undefined): number {
  if (!mission || mission.targetJobs <= 0) return 0;
  return Math.min(100, Math.round((mission.quickAcceptedJobs / mission.targetJobs) * 100));
}

/** Under a face in the grid: on shift, how they work, or waiting. */
export function personLine(person: TeamPerson): string {
  if (person.status === "pending") return "Wants to join";
  const how = person.kind === "pin" ? "PIN" : "Own login";
  return person.onShift ? `On shift · ${how}` : how;
}
