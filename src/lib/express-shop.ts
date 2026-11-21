/**
 * Express document jobs, as the shop sees them on the web (gridgoph/gridgo-web#327,
 * contract `gridgo-api/docs/EXPRESS_API.md`). The phone app says the same words
 * in `gridgo-supplier/lib/todo.ts` and `lib/expressOrder.ts`: change both together.
 *
 * A client sends files to a nearby open shop, which has five minutes to answer.
 * Accept, print, It's ready, then the client's six-digit code at the counter
 * (pickup) or today's rider handoff (delivery). This is the only place
 * `orderType` and `expressOrder` are read. The older `express: true` tag
 * (`src/lib/express.ts`) is a scheduling promise on an ordinary order.
 */
import { ApiError } from "@/lib/api/client";
import type { Order, ShopFileAccess } from "@/lib/api/types";

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
const str = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;
const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;

type ExpressFields = Partial<
  Pick<Order, "orderType" | "expressOrder" | "fulfillmentMode" | "state" | "shopAcceptance">
>;

/** An order placed through Express's document flow. */
export function isExpressDocumentOrder(
  order: Partial<Pick<Order, "orderType">> | null | undefined,
): boolean {
  return order?.orderType === "express";
}

/** One file as the shop prints it. Every field is read defensively. */
export type ExpressPrint = {
  fileId: string | null;
  /** Pages printed from this file per copy; null when GRIDGO sent no count. */
  pages: number | null;
  /** "1-3, 5", or null for every page. */
  range: string | null;
  totalPages: number | null;
  copies: number;
  paper: string;
  colour: "bw" | "colour" | null;
  sides: "one" | "two" | null;
  layout: string | null;
  note: string;
};

export type ExpressView = {
  status: string;
  /** When the five minutes run out; null once answered. */
  acceptBy: string | null;
  fulfillment: "pickup" | "delivery";
  prints: ExpressPrint[];
  /** Printed pages across every file and copy, or null when a count is missing. */
  totalPages: number | null;
  pickedUp: boolean;
};

function readPrint(raw: unknown): ExpressPrint | null {
  const row = obj(raw);
  if (!row) return null;
  const pages = obj(row.pages);
  return {
    fileId: str(row.fileId),
    pages: count(pages?.printed),
    range: str(pages?.range),
    totalPages: count(pages?.total),
    copies: count(row.copies) ?? 1,
    paper: str(row.paper) ?? "",
    colour: row.colour === "bw" || row.colour === "colour" ? row.colour : null,
    sides: row.sides === "one" || row.sides === "two" ? row.sides : null,
    layout: str(row.layout),
    note: typeof row.note === "string" ? row.note.trim() : "",
  };
}

/** The Express side of an order, or null for every other order. */
export function expressView(order: ExpressFields | null | undefined): ExpressView | null {
  if (!order || !isExpressDocumentOrder(order)) return null;
  const raw = obj(order.expressOrder) ?? {};
  const prints = (Array.isArray(raw.printSettings) ? raw.printSettings : [])
    .map(readPrint)
    .filter((row): row is ExpressPrint => row != null);
  const known = prints.length > 0 && prints.every((print) => print.pages != null);
  // An offer's clock: the Express record's own, else the shop's acceptance window.
  const pending = order.shopAcceptance?.status === "pending";
  return {
    status: str(raw.status) ?? "sending",
    acceptBy: str(raw.acceptBy) ?? (pending ? (order.shopAcceptance?.deadlineAt ?? null) : null),
    fulfillment: order.fulfillmentMode === "delivery" ? "delivery" : "pickup",
    prints,
    totalPages: known
      ? prints.reduce((sum, print) => sum + (print.pages ?? 0) * print.copies, 0)
      : null,
    pickedUp: raw.status === "picked_up",
  };
}

/* -------------------------------------------------------------------------- */
/* Where the job stands                                                        */

/**
 * The card's stage: an offer, accepted and on the press, ready and waiting
 * for the client's code at the counter, or ready for the rider.
 */
export type ExpressStage = "offer" | "working" | "counter" | "rider";

const WORKING = new Set(["supplier_accepted", "payment_authorized", "production", "supplier_self_qc"]);

export function expressStage(order: Order): ExpressStage | null {
  const view = expressView(order);
  if (!view) return null;
  if (order.state === "supplier_assigned") {
    const status = order.shopAcceptance?.status;
    // Declined, timed out or moved on: no longer this shop's offer.
    return status && status !== "pending" ? null : "offer";
  }
  if (WORKING.has(order.state)) return "working";
  if (order.state === "ready_for_dispatch" && !view.pickedUp) {
    return view.fulfillment === "pickup" ? "counter" : "rider";
  }
  return null;
}

/** A pickup order ready at the counter, waiting for the client's code. */
export function awaitsCounterCode(order: Order): boolean {
  return expressStage(order) === "counter";
}

/** Seconds left on an offer, never below zero; null when no clock runs. */
export function offerSecondsLeft(order: Order, now: Date): number | null {
  const at = Date.parse(expressView(order)?.acceptBy ?? "");
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - now.getTime()) / 1000));
}

/** "4:12" */
export function formatOfferClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The five minutes, for the ring's fraction. */
export const EXPRESS_ACCEPT_SECONDS = 5 * 60;

/* -------------------------------------------------------------------------- */
/* Words on the card                                                           */

export type PaymentKind = "in_app" | "cash" | "voucher";

/**
 * How the client paid. GRIDGO's bounded classification first, then the method
 * on the first payment. A method this portal does not know reads as nothing.
 */
export function paymentKind(
  order: Partial<Pick<Order, "paymentClassification" | "paymentMethod" | "payments">>,
): PaymentKind | null {
  const classified = order.paymentClassification;
  if (classified === "in_app" || classified === "cash" || classified === "voucher") {
    return classified;
  }
  const method = order.payments?.downpayment?.method ?? order.paymentMethod ?? null;
  if (method === "cash") return "cash";
  if (method === "gridgo_voucher") return "voucher";
  if (method === "qr_manual") return "in_app";
  return null;
}

const PAYMENT_LINE: Record<PaymentKind, string> = {
  in_app: "Paid in app",
  cash: "Cash to the rider",
  voucher: "Paid by voucher",
};

export function paymentLine(
  order: Partial<Pick<Order, "paymentClassification" | "paymentMethod" | "payments">>,
): string | null {
  const kind = paymentKind(order);
  return kind ? PAYMENT_LINE[kind] : null;
}

/**
 * Nothing to collect at the counter: only when GRIDGO says the client paid in
 * the app or by voucher. A missing method says nothing, because "Don't collect
 * cash" on a guess could cost the shop the job's money.
 */
export function alreadyPaidAtCounter(
  order: Partial<Pick<Order, "paymentClassification" | "paymentMethod" | "payments">>,
): boolean {
  const kind = paymentKind(order);
  return kind === "in_app" || kind === "voucher";
}

export const ALREADY_PAID = "Already paid. Don't collect cash.";

export function fulfilmentLine(order: ExpressFields): string {
  return order.fulfillmentMode === "delivery" ? "Rider delivers" : "Client picks up";
}

/** "24 pages · B&W"; the job's own title when the pages are unknown. */
export function workLine(order: ExpressFields & Pick<Order, "title">): string {
  const view = expressView(order);
  if (!view) return order.title;
  const pages =
    view.totalPages == null
      ? null
      : view.totalPages === 1
        ? "1 page"
        : `${view.totalPages} pages`;
  const colours = new Set(view.prints.map((print) => print.colour).filter(Boolean));
  const colour =
    colours.size === 1
      ? colours.has("bw")
        ? "B&W"
        : "Colour"
      : colours.size > 1
        ? "B&W and colour"
        : null;
  return [pages, colour].filter(Boolean).join(" · ") || order.title;
}

const PAPER: Record<string, string> = { a4: "A4", short: "Short", long: "Long" };
const LAYOUT: Record<string, string> = {
  fit_to_paper: "Fit to page",
  actual_size_centered: "Actual size",
  actual_size_original_position: "Actual size, top-left",
};

/** Paper, sides and copies under the headline, when every file shares them. */
export function settingsLine(order: ExpressFields): string | null {
  const view = expressView(order);
  if (!view || !view.prints.length) return null;
  const prints = view.prints;
  const same = <T,>(pick: (print: ExpressPrint) => T): T | null => {
    const first = pick(prints[0]);
    return prints.every((print) => pick(print) === first) ? first : null;
  };
  const paper = same((print) => print.paper);
  const sides = same((print) => print.sides);
  const copies = same((print) => print.copies);
  return (
    [
      paper ? (PAPER[paper] ?? paper) : null,
      sides === "two" ? "2 sides" : sides === "one" ? "1 side" : null,
      copies != null ? (copies === 1 ? "1 copy" : `${copies} copies`) : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
}

/** The print settings for one file, in the order a printer sets them up. */
export function printChips(print: ExpressPrint): string[] {
  return [
    PAPER[print.paper] ?? (print.paper || null),
    print.colour === "bw" ? "B&W" : print.colour === "colour" ? "Colour" : null,
    print.sides === "two" ? "2 sides" : print.sides === "one" ? "1 side" : null,
    print.copies === 1 ? "1 copy" : `${print.copies} copies`,
    print.layout ? (LAYOUT[print.layout] ?? null) : null,
    print.range
      ? print.totalPages
        ? `Pages ${print.range} of ${print.totalPages}`
        : `Pages ${print.range}`
      : null,
  ].filter((chip): chip is string => Boolean(chip));
}

/** Things on To do, said as a count in the title. */
export function todoTitle(count: number): string {
  if (count === 0) return "All done for now";
  return count === 1 ? "1 thing to do" : `${count} things to do`;
}

/** One-tap reasons for Can't do it. GRIDGO takes free text; these are only words. */
export const EXPRESS_DECLINE_REASONS = [
  "Printer is down",
  "Out of paper or ink",
  "Too many jobs right now",
  "Closing soon",
] as const;

export const NO_PENALTY =
  "GRIDGO sends it to the next nearest shop. Nothing goes on your shop's record.";

/* -------------------------------------------------------------------------- */
/* It's ready                                                                  */

/**
 * The transitions behind It's ready. GRIDGO takes `ready_for_dispatch`
 * straight from accepted (gridgo-api#419); an API without that answers
 * `transition_not_allowed`, and the shop's two-step chain (press, then ready)
 * is tried instead.
 */
export function expressReadySteps(order: Order, direct: boolean): string[] {
  if (expressStage(order) !== "working") return [];
  if (direct) return ["ready_for_dispatch"];
  if (order.state === "payment_authorized" || order.state === "supplier_accepted") {
    return ["production", "ready_for_dispatch"];
  }
  return ["ready_for_dispatch"];
}

/** The refusal that means "this API does not take the one-step ready yet". */
export function readyNeedsTwoSteps(error: unknown): boolean {
  return error instanceof ApiError && error.code === "transition_not_allowed";
}

/** The note each step leaves on the client's timeline. */
export const EXPRESS_STEP_NOTE: Record<string, string> = {
  production: "Printing",
  ready_for_dispatch: "Ready",
};

/* -------------------------------------------------------------------------- */
/* The client's code                                                           */

export const COUNTER_CODE_LENGTH = 6;

/** Six digits, leading zeroes kept. */
export function counterCodeDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, COUNTER_CODE_LENGTH);
}

export type CounterCodeOutcome =
  | { kind: "wrong" }
  | { kind: "locked"; until: Date | null }
  /** GRIDGO has not confirmed the client's payment: no handover yet. */
  | { kind: "unpaid" }
  | { kind: "other" };

/** What a refused code means, so the screen never reads an error code. */
export function counterCodeOutcome(error: unknown, now: Date = new Date()): CounterCodeOutcome {
  if (!(error instanceof ApiError)) return { kind: "other" };
  if (error.code === "express_pickup_code_mismatch") return { kind: "wrong" };
  if (error.code === "express_pickup_attempts_exceeded") {
    const at = Date.parse(error.detail<string>("retryAfter") ?? "");
    return { kind: "locked", until: Number.isFinite(at) && at > now.getTime() ? new Date(at) : null };
  }
  if (error.code === "payment_required") return { kind: "unpaid" };
  return { kind: "other" };
}

/* -------------------------------------------------------------------------- */
/* Files and the delete reminder                                               */

/**
 * Files this shop downloaded for the job, newest first, one per file. Only a
 * confirmed download counts: opening a file in the browser saves nothing on
 * the PC, and a signed link being issued is not proof the bytes arrived.
 */
export function downloadedFileIds(
  order: Pick<Order, "fileAccesses">,
  extra: readonly string[] = [],
): string[] {
  const rows = (order.fileAccesses ?? []).filter(
    (row): row is ShopFileAccess => row?.action === "downloaded" && typeof row.fileId === "string",
  );
  rows.sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));
  return [...new Set([...rows.map((row) => row.fileId), ...extra])];
}

/** The job id GRIDGO recorded for this shop's file reads, when it sent one. */
export function fileAccessJobId(order: Pick<Order, "fileAccesses">, fileId: string): string {
  const rows = order.fileAccesses ?? [];
  return (
    rows.find((row) => row.fileId === fileId && row.jobId)?.jobId ??
    rows.find((row) => row.jobId)?.jobId ??
    // The API reads an empty job id as "every job of this shop on the order".
    ""
  );
}

/** Formats the browser viewer can show and print without saving anything. */
export type ViewerKind = "pdf" | "image" | "download_only";

export function viewerKind(contentType: string | null | undefined): ViewerKind {
  // Only the type GRIDGO detected from the bytes decides; a file name or a
  // client-declared type never makes a file showable (the viewer draws it on
  // this site's own origin). SVG stays a download: it can carry script.
  const type = (contentType ?? "").toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (/^image\/(png|jpeg|webp|gif)$/.test(type)) return "image";
  return "download_only";
}

/** The type the viewer's blob is forced to, whatever the storage server said. */
export function viewerBlobType(kind: ViewerKind, contentType: string | null | undefined): string | null {
  if (kind === "pdf") return "application/pdf";
  if (kind === "image") return (contentType ?? "").toLowerCase();
  return null;
}

export const PRINT_HERE_NOTE = "The file opens in your browser. Nothing is saved on your PC.";
export const IF_YOU_DOWNLOAD_NOTE =
  "Delete it after the job. We'll remind you when you hand it over.";
export const GRIDGO_DELETES_NOTE =
  "GRIDGO deletes the client's files from its side after the job is done.";

/* -------------------------------------------------------------------------- */
/* Keyboard shortcuts                                                          */

/**
 * A shortcut key (A, R) acts only when the person is not typing: never in an
 * input, text area, select or editable region, and never with a modifier.
 */
export function shortcutAllowed(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
  target: EventTarget | null;
}): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return false;
  const target = event.target as (HTMLElement & { isContentEditable?: boolean }) | null;
  if (!target || typeof target !== "object" || !("tagName" in target)) return true;
  const tag = String(target.tagName).toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (target.isContentEditable) return false;
  // Inside an open dialog or sheet, the page's shortcuts stay quiet.
  if (typeof target.closest === "function" && target.closest("[role=dialog],[role=alertdialog]")) {
    return false;
  }
  return true;
}
