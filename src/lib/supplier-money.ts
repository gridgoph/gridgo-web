import { formatPhp } from "@/lib/format";

/**
 * The shop Owner's two running balances with GRIDGO, and the words for them
 * (gridgo-api `docs/SHOP_MONEY_API.md`, issue report 4EF1D71D). A port of the
 * supplier app's `lib/shopMoney.ts` (gridgo-supplier#283): change both
 * together so the phone and the web say the same thing.
 *
 * "GRIDGO owes you" is shop pay earned and not yet sent; "You owe GRIDGO" is
 * GRIDGO's share of money the shop collected itself. The net is what the 4 PM
 * business-day run works from: positive, GRIDGO sends it to the shop's payout
 * QR once it reaches the minimum; negative, the shop pays it with Pay GRIDGO
 * before the deadline or new orders pause.
 *
 * Every amount, time, rate and cap here is GRIDGO's: the read and
 * `GET /settings` `shopMoney`. Nothing is assumed: a read without a field draws
 * nothing for it, and an API without the route (404/405) is `null`, so the
 * screens look as they did before.
 *
 * The payout figure is never promised. Work not yet released stays in "GRIDGO
 * owes you" without being in the day's transfer, so the next-payout line names
 * the time and the rule, not an amount.
 */

export type ClientPaymentMethod = "in_app_qr" | "cash_to_rider" | "voucher" | "counter_cash";

export const CLIENT_PAYMENT_METHODS: readonly ClientPaymentMethod[] = [
  "in_app_qr",
  "cash_to_rider",
  "voucher",
  "counter_cash",
];

export type ClientPayment = {
  methods: ClientPaymentMethod[];
  /** Express is paid daily; a Regular job releases in stages. */
  settlement: "daily" | "staged" | null;
};

/** A job's launch-week bonus, as GRIDGO snapshotted it when the job was taken. */
export type LaunchBonus = {
  amountMinor: number;
  firstOrderAt: string | null;
  days: number | null;
  rateBps: number | null;
  capMinor: number | null;
};

export type ShopMoneyBalances = {
  owedMinor: number;
  owingMinor: number;
  netMinor: number;
  paidMinor: number;
  overdue: boolean;
  paused: boolean;
  nextPayoutAt: string | null;
};

export type ShopMoneyJob = {
  orderId: string;
  createdAt: string;
  clientPayment: ClientPayment;
  shopPayMinor: number | null;
  bonus: LaunchBonus | null;
};

export type ShopMoneyEntry = {
  id: string;
  kind: string;
  orderId: string | null;
  at: string;
  owedDeltaMinor: number;
  owingDeltaMinor: number;
  reference: string | null;
};

export type PayGridgo = {
  requestId: string;
  amountMinor: number;
  reference: string;
  deadlineAt: string | null;
  /** A path on the API (`/public/payment-qr?v=…`), or null when GRIDGO has no QR on file. */
  qrImageUrl: string | null;
};

export type ShopMoneyRead = {
  balances: ShopMoneyBalances;
  jobs: ShopMoneyJob[];
  history: ShopMoneyEntry[];
  /** Manila day → shop pay earned that day, oldest first. */
  earningsByDay: { day: string; amountMinor: number }[];
  /** Jobs per client payment method. A mixed voucher/QR job counts in both. */
  paymentMethods: Partial<Record<ClientPaymentMethod, number>>;
  payGridgo: PayGridgo | null;
};

/** `GET /settings` → `shopMoney`: the schedule and the launch bonus terms. */
export type ShopMoneySchedule = {
  payoutTime: string;
  minimumMinor: number;
  payDeadline: string;
  reminderTime: string | null;
  bonusRateBps: number;
  bonusDays: number;
  bonusCapMinor: number;
};

export type MoneyPeriod = "week" | "month";

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
  value != null && typeof value === "object" && !Array.isArray(value);
const int = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;
const clock = (value: unknown): string | null =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;

function readMethods(value: unknown): ClientPaymentMethod[] {
  if (!Array.isArray(value)) return [];
  return CLIENT_PAYMENT_METHODS.filter((method) => value.includes(method));
}

export function readClientPayment(value: unknown): ClientPayment | null {
  if (!isObject(value)) return null;
  const methods = readMethods(value.methods);
  const settlement =
    value.settlement === "daily" || value.settlement === "staged" ? value.settlement : null;
  if (!methods.length && !settlement) return null;
  return { methods, settlement };
}

export function readLaunchBonus(value: unknown): LaunchBonus | null {
  if (!isObject(value)) return null;
  const amountMinor = int(value.amountMinor);
  if (amountMinor == null || amountMinor < 0) return null;
  return {
    amountMinor,
    firstOrderAt: text(value.firstOrderAt),
    days: int(value.days),
    rateBps: int(value.rateBps),
    capMinor: int(value.capMinor),
  };
}

function readBalances(value: unknown): ShopMoneyBalances | null {
  if (!isObject(value)) return null;
  const owedMinor = int(value.owedMinor);
  const owingMinor = int(value.owingMinor);
  if (owedMinor == null || owingMinor == null) return null;
  return {
    owedMinor,
    owingMinor,
    netMinor: int(value.netMinor) ?? owedMinor - owingMinor,
    paidMinor: int(value.paidMinor) ?? 0,
    overdue: value.overdue === true,
    paused: value.paused === true,
    nextPayoutAt: text(value.nextPayoutAt),
  };
}

function readEntry(value: unknown, index: number): ShopMoneyEntry | null {
  if (!isObject(value)) return null;
  const at = text(value.at);
  const kind = text(value.kind);
  if (!at || !kind) return null;
  const data = isObject(value.data) ? value.data : {};
  return {
    id: text(value.id) ?? text(value.key) ?? `${kind}-${at}-${index}`,
    kind,
    orderId: text(value.orderId),
    at,
    owedDeltaMinor: int(value.owedDeltaMinor) ?? 0,
    owingDeltaMinor: int(value.owingDeltaMinor) ?? 0,
    reference: text(data.reference),
  };
}

function readJob(value: unknown): ShopMoneyJob | null {
  if (!isObject(value)) return null;
  const orderId = text(value.orderId);
  const createdAt = text(value.createdAt);
  if (!orderId || !createdAt) return null;
  return {
    orderId,
    createdAt,
    clientPayment: readClientPayment(value.clientPayment) ?? { methods: [], settlement: null },
    shopPayMinor: int(value.shopPayMinor),
    bonus: readLaunchBonus(value.bonus),
  };
}

function readPayGridgo(value: unknown): PayGridgo | null {
  if (!isObject(value)) return null;
  const requestId = text(value.requestId);
  const amountMinor = int(value.amountMinor);
  const reference = text(value.reference);
  // A request GRIDGO has already covered (recovered from a payout) reads as
  // ₱0: there is nothing to pay, so there is no sheet to open.
  if (!requestId || amountMinor == null || amountMinor <= 0 || !reference) return null;
  return {
    requestId,
    amountMinor,
    reference,
    deadlineAt: text(value.deadlineAt),
    qrImageUrl: text(value.qrImageUrl),
  };
}

/** The Owner's `GET /me/shop-money` body, or null when it is not one. */
export function readShopMoney(body: unknown): ShopMoneyRead | null {
  if (!isObject(body)) return null;
  const balances = readBalances(body.balances);
  if (!balances) return null;
  const jobs = Array.isArray(body.jobs)
    ? body.jobs.map(readJob).filter((job): job is ShopMoneyJob => job != null)
    : [];
  const history = Array.isArray(body.history)
    ? body.history
        .map(readEntry)
        .filter((entry): entry is ShopMoneyEntry => entry != null)
    : [];
  const earningsByDay = isObject(body.earningsByDay)
    ? Object.entries(body.earningsByDay)
        .filter(([day, amount]) => /^\d{4}-\d\d-\d\d$/.test(day) && int(amount) != null)
        .map(([day, amount]) => ({ day, amountMinor: amount as number }))
        .sort((a, b) => a.day.localeCompare(b.day))
    : [];
  const paymentMethods: Partial<Record<ClientPaymentMethod, number>> = {};
  if (isObject(body.paymentMethods)) {
    for (const method of CLIENT_PAYMENT_METHODS) {
      const count = int(body.paymentMethods[method]);
      if (count != null && count > 0) paymentMethods[method] = count;
    }
  }
  return {
    balances,
    jobs: [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    history: [...history].sort((a, b) => b.at.localeCompare(a.at)),
    earningsByDay,
    paymentMethods,
    payGridgo: readPayGridgo(body.payGridgo),
  };
}

/** `GET /settings` → `shopMoney`, or null when GRIDGO does not offer it yet. */
export function readShopMoneySchedule(value: unknown): ShopMoneySchedule | null {
  if (!isObject(value)) return null;
  const payoutTime = clock(value.payoutTime);
  const payDeadline = clock(value.payDeadline);
  const minimumMinor = int(value.minimumMinor);
  const bonusRateBps = int(value.bonusRateBps);
  const bonusDays = int(value.bonusDays);
  const bonusCapMinor = int(value.bonusCapMinor);
  if (
    !payoutTime ||
    !payDeadline ||
    minimumMinor == null ||
    bonusRateBps == null ||
    bonusDays == null ||
    bonusCapMinor == null
  ) {
    return null;
  }
  return {
    payoutTime,
    minimumMinor,
    payDeadline,
    reminderTime: clock(value.reminderTime),
    bonusRateBps,
    bonusDays,
    bonusCapMinor,
  };
}

/* -------------------------------------------------------------------------- */
/* Times: always Manila time, the calendar the payouts run on                  */

const MANILA = "Asia/Manila";

function manilaDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MANILA }).format(at);
}

function manilaTime(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return clockLabel(`${hour.padStart(2, "0")}:${minute}`);
}

/** "4:00 PM" from GRIDGO's "16:00". */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const half = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${half}`;
}

/** "today, 4:00 PM", "tomorrow, 4:00 PM" or "Mon 24 Nov, 4:00 PM". */
export function whenLabel(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const day = manilaDay(at);
  const today = manilaDay(now);
  const tomorrow = manilaDay(new Date(now.getTime() + 86_400_000));
  const date =
    day === today
      ? "today"
      : day === tomorrow
        ? "tomorrow"
        : manilaDate(at);
  return `${date}, ${manilaTime(at)}`;
}

/** "Wed, 25 Nov", assembled from parts so every runtime's ICU says it alike. */
export function manilaDate(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("day")} ${part("month")}`;
}


/* -------------------------------------------------------------------------- */
/* The words                                                                   */

const METHOD_LABEL: Record<ClientPaymentMethod, string> = {
  in_app_qr: "Paid in app",
  cash_to_rider: "Cash to the rider",
  voucher: "Voucher",
  counter_cash: "Cash at your counter",
};

export function paymentMethodLabel(method: ClientPaymentMethod): string {
  return METHOD_LABEL[method];
}

/** "Paid in app", "Paid in app + voucher", "Cash to the rider". */
export function clientPaymentLine(payment: ClientPayment | null | undefined): string | null {
  if (!payment?.methods.length) return null;
  const [first, ...rest] = payment.methods;
  const lead = first === "voucher" ? "Paid by voucher" : METHOD_LABEL[first];
  return [lead, ...rest.map((m) => METHOD_LABEL[m].toLowerCase())].join(" + ");
}

/** The tag beside a job: Express is paid daily, Regular in parts. */
export function settlementLabel(payment: ClientPayment | null | undefined): string | null {
  if (payment?.settlement === "daily") return "Paid daily";
  if (payment?.settlement === "staged") return "Paid in parts";
  return null;
}

export type BalanceTone = "owed" | "owing" | "even";

/** How the net reads, and which way it points. */
export function netLine(balances: ShopMoneyBalances): { label: string; tone: BalanceTone } {
  if (balances.netMinor > 0) return { label: "GRIDGO pays you", tone: "owed" };
  if (balances.netMinor < 0) return { label: "You pay GRIDGO", tone: "owing" };
  return { label: "All square", tone: "even" };
}

/**
 * The line under the balances: when GRIDGO next pays, and the rule that
 * decides how much, never a promised figure, because unreleased work sits in
 * the owed balance without being in the transfer.
 */
export function nextPayoutLine(
  balances: ShopMoneyBalances,
  schedule: ShopMoneySchedule | null,
  now: Date = new Date(),
): string | null {
  const when = whenLabel(balances.nextPayoutAt, now);
  if (!when) return null;
  const minimum = schedule ? formatPhp(schedule.minimumMinor) : null;
  if (balances.netMinor > 0 && balances.netMinor < (schedule?.minimumMinor ?? 0)) {
    return `Next payout ${when}. You are under the ${minimum} minimum, so this waits and is added to the next one.`;
  }
  if (balances.netMinor > 0) {
    return minimum
      ? `Next payout ${when}, to your payout QR: what is ready to release, if it is ${minimum} or more. GRIDGO pays the transfer fee.`
      : `Next payout ${when}, to your payout QR. GRIDGO pays the transfer fee.`;
  }
  if (balances.netMinor < 0 && schedule) {
    return `Still owed at ${clockLabel(schedule.payoutTime)}, it is due by ${clockLabel(schedule.payDeadline)} with Pay GRIDGO.`;
  }
  return `Next payout ${when}.`;
}

export type PayGridgoNotice = {
  tone: "warning" | "error";
  title: string;
  body: string;
  /** The yellow button's words. */
  action: string;
};

/**
 * Pay GRIDGO's notice. Due before the deadline; past it the shop is paused for
 * new orders until the team confirms the payment, said plainly, with what
 * still works (accepted jobs) first.
 */
export function payGridgoNotice(
  pay: PayGridgo,
  balances: ShopMoneyBalances,
  now: Date = new Date(),
): PayGridgoNotice {
  const amount = formatPhp(pay.amountMinor);
  if (balances.paused) {
    return {
      tone: "error",
      title: "New orders are paused",
      body: `You owe GRIDGO ${amount}. Jobs you already accepted can still be finished. New orders come back once the GRIDGO team confirms your payment.`,
      action: `Pay ${amount}`,
    };
  }
  const deadline = whenLabel(pay.deadlineAt, now);
  return {
    tone: "warning",
    title: `Pay GRIDGO ${amount}`,
    body: deadline
      ? `Due ${deadline}. If it is not paid by then, new orders pause until it is.`
      : "If it is not paid by the deadline, new orders pause until it is.",
    action: `Pay ${amount}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Launch week                                                                 */

export type LaunchBonusSummary = {
  totalMinor: number;
  capMinor: number | null;
  rateBps: number | null;
  endsAt: string | null;
  active: boolean;
  atCap: boolean;
  jobCount: number;
};

/**
 * The launch-week bonus across the jobs in this read: what it has added and
 * whether the week or the cap has ended it. Null when no job carries one.
 */
export function launchBonusSummary(
  jobs: ShopMoneyJob[],
  now: Date = new Date(),
): LaunchBonusSummary | null {
  const awarded = jobs.filter((job) => job.bonus && job.bonus.amountMinor > 0);
  if (!awarded.length) return null;
  const sample = awarded[awarded.length - 1].bonus!;
  const totalMinor = awarded.reduce((sum, job) => sum + job.bonus!.amountMinor, 0);
  const start = sample.firstOrderAt ? Date.parse(sample.firstOrderAt) : NaN;
  const endsAt =
    Number.isFinite(start) && sample.days != null
      ? new Date(start + sample.days * 86_400_000).toISOString()
      : null;
  const atCap = sample.capMinor != null && totalMinor >= sample.capMinor;
  return {
    totalMinor,
    capMinor: sample.capMinor,
    rateBps: sample.rateBps,
    endsAt,
    active: !atCap && endsAt != null && Date.parse(endsAt) > now.getTime(),
    atCap,
    jobCount: awarded.length,
  };
}

/** "20%" from 2000 basis points. */
export function percentLabel(bps: number): string {
  const value = bps / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function launchBonusLine(summary: LaunchBonusSummary, now: Date = new Date()): string {
  const cap = summary.capMinor != null ? formatPhp(summary.capMinor) : null;
  if (summary.atCap) {
    return `You reached the ${cap} launch bonus cap. Jobs keep paying your usual shop pay.`;
  }
  if (summary.active) {
    const rate = summary.rateBps != null ? `+${percentLabel(summary.rateBps)}` : "A bonus";
    const ends = whenLabel(summary.endsAt, now);
    return `${rate} on your shop pay${ends ? ` until ${ends}` : ""}${cap ? `, up to ${cap} in all` : ""}.`;
  }
  return "Your launch week has ended. Jobs keep paying your usual shop pay.";
}

/* -------------------------------------------------------------------------- */
/* History                                                                     */

/** The ledger kinds GRIDGO writes, as a shop would name them. */
export function historyLabel(entry: ShopMoneyEntry): string {
  switch (entry.kind) {
    case "entitlement":
      return entry.owedDeltaMinor >= 0 ? "Shop pay earned" : "Shop pay changed";
    case "bonus_award":
      return "Launch bonus";
    case "bonus_void":
      return "Launch bonus removed";
    case "payout":
      return "Sent to your payout QR";
    case "bonus_payout":
      return "Launch bonus sent";
    case "recovery_due":
      return "Owed to GRIDGO";
    case "recovered":
      return "Settled with GRIDGO";
    default:
      return "Balance changed";
  }
}

/**
 * The figure on a history line, signed from the shop's side: money it earns
 * is "+", money sent to it reads as a transfer, and what it owes is said as
 * owing, never a bare minus that could read as a loss.
 */
export function historyAmount(entry: ShopMoneyEntry): { text: string; tone: BalanceTone } {
  if (entry.owingDeltaMinor !== 0) {
    return entry.owingDeltaMinor > 0
      ? { text: `You owe ${formatPhp(entry.owingDeltaMinor)}`, tone: "owing" }
      : { text: `−${formatPhp(-entry.owingDeltaMinor)} owed`, tone: "even" };
  }
  if (entry.kind === "payout" || entry.kind === "bonus_payout") {
    return { text: formatPhp(Math.abs(entry.owedDeltaMinor)), tone: "even" };
  }
  return entry.owedDeltaMinor >= 0
    ? { text: `+${formatPhp(entry.owedDeltaMinor)}`, tone: "owed" }
    : { text: `−${formatPhp(-entry.owedDeltaMinor)}`, tone: "even" };
}

export const HISTORY_FILTERS = [
  { value: "all", label: "All" },
  { value: "jobs", label: "Jobs" },
  { value: "payouts", label: "Payouts" },
  { value: "owed", label: "You owe" },
] as const;

export type HistoryFilter = (typeof HISTORY_FILTERS)[number]["value"];

export function matchesHistoryFilter(entry: ShopMoneyEntry, filter: HistoryFilter): boolean {
  switch (filter) {
    case "jobs":
      return ["entitlement", "bonus_award", "bonus_void"].includes(entry.kind);
    case "payouts":
      return entry.kind === "payout" || entry.kind === "bonus_payout";
    case "owed":
      return entry.owingDeltaMinor !== 0;
    default:
      return true;
  }
}

/* -------------------------------------------------------------------------- */
/* How you earn                                                                */

/**
 * The three lines a shop reads in sign-up and in Money. Built from GRIDGO's
 * own schedule, so a changed time, minimum or bonus changes the words; null
 * when GRIDGO does not offer daily payouts yet.
 */
export function howYouEarnLines(schedule: ShopMoneySchedule | null): string[] | null {
  if (!schedule) return null;
  const lines = [
    "You earn on every job you finish, any time of day. Express jobs are paid daily; other jobs pay in parts as they move.",
    `GRIDGO pays you at ${clockLabel(schedule.payoutTime)} on business days, to your payout QR. ${formatPhp(schedule.minimumMinor)} minimum: a smaller amount rolls over to the next day, and GRIDGO pays the transfer fee.`,
  ];
  if (schedule.bonusRateBps > 0 && schedule.bonusDays > 0 && schedule.bonusCapMinor > 0) {
    lines.push(
      `Launch week: +${percentLabel(schedule.bonusRateBps)} on your shop pay for ${schedule.bonusDays} days from your first order, up to ${formatPhp(schedule.bonusCapMinor)}.`,
    );
  }
  return lines;
}
