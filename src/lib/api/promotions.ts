/**
 * Launch promotions: the Founding 30 voucher, the Friend Pass and the ₱15
 * rewards (contract "Launch promotions" in gridgo-api, the 27 Oct sprint).
 * `GET /admin/promotions` is Super Admin's, readable by Operations;
 * `PATCH /admin/promotions` is Super Admin only and carries `expectedVersion`
 * like `PATCH /settings`, so a stale one is `409 settings_version_conflict`.
 *
 * This is the only file that knows the API's field names. Everything raw is
 * read through `readAdminPromotions` into the shapes below, so a rename on the
 * API side is a change here and nowhere else. Money is centavos throughout.
 */

import { apiRequest } from "@/lib/api/client";

export type FoundingSettings = {
  amountMinor: number;
  slots: number;
  /** ISO instants; the screen shows and edits them in Philippine time. */
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

export type FriendPassSettings = {
  amountMinor: number;
  /** Friends each Founder may name. */
  perFounder: number;
  total: number;
  /** From here unclaimed Founding slots lift Friend Passes to the Founding amount. */
  upgradeAt: string;
  enabled: boolean;
};

export type RewardSettings = {
  surveyMinor: number;
  missionMinor: number;
  /** Paid to each side of an invite. */
  inviteMinor: number;
};

export type PromotionSettings = {
  founding: FoundingSettings;
  friendPass: FriendPassSettings;
  budgetCapMinor: number;
  rewards: RewardSettings;
};

/** `available` is claimed and unused; `reserved` sits on a checkout. */
export type PromotionVoucherStatus = "available" | "reserved" | "used" | "expired" | "void";

export type FoundingClaim = {
  voucherId: string;
  clientId: string;
  name: string | null;
  email: string | null;
  claimedAt: string | null;
  /** What this voucher is worth, fixed when it was claimed (or upgraded). */
  valueMinor: number;
  status: PromotionVoucherStatus | (string & {});
  /** A Friend Pass that took a Founding slot when it was upgraded. */
  viaFriendPass: boolean;
  upgradedAt: string | null;
  orderIds: string[];
};

export type FriendPassInviteStatus =
  | "invited"
  | "claimed"
  | "used"
  | "expired"
  | "void"
  | "skipped_already_founder";

export type PromotionPerson = { id: string; name: string | null; email: string | null };

export type FriendPassInvite = {
  id: string;
  founder: PromotionPerson;
  friendEmail: string;
  /** The client account the email matched, once there is exactly one. */
  friendClientId: string | null;
  status: FriendPassInviteStatus | (string & {});
  /** Null until the friend claims it. */
  valueMinor: number | null;
  invitedAt: string | null;
  claimedAt: string | null;
  upgradedAt: string | null;
};

export type PromotionBudget = {
  capMinor: number;
  /** Face value of every live Founding and Friend Pass voucher, upgrades included. */
  committedMinor: number;
  /** Actually taken off orders. */
  redeemedMinor: number;
  remainingMinor: number;
};

export type AdminPromotions = {
  version: number;
  serverTime: string | null;
  settings: PromotionSettings;
  founding: {
    slots: number;
    /** Live claims: unused and in date, or used. */
    claimed: number;
    /** Slots still open to claim. */
    available: number;
    used: number;
    /** Claimed, never used, and past their date: their slots went back. */
    expiredUnused: number;
    claims: FoundingClaim[];
  };
  friendPass: { total: number; issued: number; invites: FriendPassInvite[] };
  budget: PromotionBudget;
};

/** Only the fields that changed; sections are merged by the API. */
export type PromotionSettingsPatch = {
  founding?: Partial<FoundingSettings>;
  friendPass?: Partial<FriendPassSettings>;
  budgetCapMinor?: number;
  rewards?: Partial<RewardSettings>;
};

// ---------------------------------------------------------------------------
// Reading the API's JSON
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function int(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function list(value: unknown): Raw[] {
  return Array.isArray(value) ? value.map(obj) : [];
}

/** The response is not a promotions record this screen can trust. */
export class PromotionsShapeError extends Error {
  constructor() {
    super("promotions_unreadable");
  }
}

function readSettings(raw: unknown): PromotionSettings {
  const settings = obj(raw);
  const founding = obj(settings.founding);
  const friendPass = obj(settings.friendPass);
  const rewards = obj(settings.rewards);
  if (
    typeof founding.amountMinor !== "number" ||
    typeof friendPass.amountMinor !== "number" ||
    typeof settings.budgetCapMinor !== "number"
  ) {
    throw new PromotionsShapeError();
  }
  return {
    founding: {
      amountMinor: int(founding.amountMinor),
      slots: int(founding.slots),
      startsAt: text(founding.startsAt) ?? "",
      endsAt: text(founding.endsAt) ?? "",
      enabled: founding.enabled === true,
    },
    friendPass: {
      amountMinor: int(friendPass.amountMinor),
      perFounder: int(friendPass.perFounder, 1),
      total: int(friendPass.total),
      upgradeAt: text(friendPass.upgradeAt) ?? "",
      enabled: friendPass.enabled === true,
    },
    budgetCapMinor: int(settings.budgetCapMinor),
    rewards: {
      surveyMinor: int(rewards.surveyMinor),
      missionMinor: int(rewards.missionMinor),
      inviteMinor: int(rewards.inviteMinor),
    },
  };
}

function readClaim(raw: Raw): FoundingClaim {
  const orderIds = Array.isArray(raw.orderIds)
    ? raw.orderIds.filter((id): id is string => typeof id === "string")
    : text(raw.orderId)
      ? [raw.orderId as string]
      : [];
  return {
    voucherId: text(raw.voucherId) ?? text(raw.id) ?? "",
    clientId: text(raw.clientId) ?? text(raw.id) ?? "",
    name: text(raw.name),
    email: text(raw.email),
    claimedAt: text(raw.claimedAt),
    valueMinor: int(raw.valueMinor),
    status: text(raw.status) ?? "available",
    viaFriendPass: raw.promotionKind === "friend_pass",
    upgradedAt: text(raw.upgradedAt),
    orderIds,
  };
}

function readPerson(raw: unknown): PromotionPerson {
  const person = obj(raw);
  return { id: text(person.id) ?? "", name: text(person.name), email: text(person.email) };
}

function readInvite(raw: Raw): FriendPassInvite {
  return {
    id: text(raw.id) ?? "",
    founder: readPerson(raw.founder),
    friendEmail: text(raw.friendEmail) ?? text(raw.email) ?? "",
    friendClientId: text(raw.friendClientId) ?? text(raw.clientId),
    status: text(raw.status) ?? "invited",
    valueMinor: typeof raw.valueMinor === "number" ? raw.valueMinor : null,
    invitedAt: text(raw.invitedAt) ?? text(raw.createdAt),
    claimedAt: text(raw.claimedAt),
    upgradedAt: text(raw.upgradedAt),
  };
}

/** Raw `GET /admin/promotions` JSON → the screen's shape. Throws when it cannot. */
export function readAdminPromotions(raw: unknown): AdminPromotions {
  const body = obj(raw);
  if (typeof body.version !== "number") throw new PromotionsShapeError();
  const settings = readSettings(body.settings);
  const founding = obj(body.founding);
  const friendPass = obj(body.friendPass);
  const budget = obj(body.budget);
  return {
    version: body.version,
    serverTime: text(body.serverTime),
    settings,
    founding: {
      slots: int(founding.slots, settings.founding.slots),
      claimed: int(founding.claimed),
      available: int(founding.available),
      used: int(founding.used),
      expiredUnused: int(founding.expiredUnused),
      claims: list(founding.claims).map(readClaim),
    },
    friendPass: {
      total: int(friendPass.total, settings.friendPass.total),
      issued: int(friendPass.issued),
      invites: list(friendPass.invites).map(readInvite),
    },
    budget: {
      capMinor: int(budget.capMinor, settings.budgetCapMinor),
      committedMinor: int(budget.committedMinor),
      redeemedMinor: int(budget.redeemedMinor),
      remainingMinor: int(budget.remainingMinor),
    },
  };
}

function hasCounts(raw: unknown): boolean {
  const body = obj(raw);
  return "founding" in body && "budget" in body;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function getAdminPromotions(): Promise<AdminPromotions> {
  return readAdminPromotions(await apiRequest<unknown>("/admin/promotions"));
}

/**
 * Super Admin. Sends only what changed, with the version it was read at and an
 * audit reason. Changes apply to new claims; vouchers already out keep their
 * value. When the answer carries settings alone, the counts are read again.
 */
export async function updateAdminPromotions(
  patch: PromotionSettingsPatch,
  expectedVersion: number,
  reason: string,
): Promise<AdminPromotions> {
  const saved = await apiRequest<unknown>("/admin/promotions", {
    method: "PATCH",
    body: JSON.stringify({ ...patch, expectedVersion, reason }),
  });
  return hasCounts(saved) ? readAdminPromotions(saved) : getAdminPromotions();
}
