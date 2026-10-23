/**
 * Internet calls between the shop and the rider collecting a job.
 *
 * Wording and the window match gridgo-supplier `lib/orderCall.ts` and
 * gridgo-api `docs/CALLS_API.md`. Audio is WebRTC. Nothing is dialled.
 * The pair is `pickup`, and only while the rider is on the way to collect.
 *
 * A browser that cannot open a peer connection, or a site whose microphone
 * is blocked, tells the shop to use messages. It does not place a phone call.
 */

import { ApiError } from "@/lib/api/client";
import { pickupChatOf } from "@/lib/pickup-chat";

export type CallState = "ringing" | "accepted" | "declined" | "cancelled" | "missed" | "ended";
export type CallRole = "client" | "rider" | "supplier";

export type CallParty = { firstName: string; role: CallRole | string };

export type OrderCall = {
  id: string;
  orderId: string;
  pair: "pickup" | "delivery" | string;
  state: CallState;
  caller: CallParty;
  callee: CallParty;
  mine: boolean;
  createdAt: string;
  ringExpiresAt: string;
  acceptedAt: string | null;
  endedAt: string | null;
  leaseExpiresAt: string | null;
};

export const CALL_PAIR = "pickup";
export const CALL_POLL_MS = 2_000;
export const CALL_HEARTBEAT_MS = 20_000;
export const CALL_LEASE_MS = 90_000;
export const CALL_INCOMING_NOTICE = "order_call_incoming";
export const CALL_MISSED_NOTICE = "order_call_missed";
export const CALL_RING_MS = 30_000;

/** A browser without WebRTC. Messages stay available. */
export const CALLS_NEED_BROWSER = "This browser cannot place a call. Use messages instead.";
/** The site was refused the microphone. */
export const CALLS_MIC_BLOCKED = "The microphone is blocked for this site. Use messages instead.";

const STATES: readonly CallState[] = ["ringing", "accepted", "declined", "cancelled", "missed", "ended"];
const TERMINAL: readonly CallState[] = ["declined", "cancelled", "missed", "ended"];

export function isTerminal(state: CallState): boolean {
  return TERMINAL.includes(state);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function time(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function party(value: unknown, fallbackRole: CallRole): CallParty {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const role = text(raw.role) ?? fallbackRole;
  const name = text(raw.firstName)?.split(/\s+/)[0]?.slice(0, 40) ?? null;
  return { firstName: name ?? roleWord(role), role };
}

function roleWord(role: string): string {
  if (role === "rider") return "Rider";
  if (role === "client") return "Client";
  return "Shop";
}

export function parseCall(raw: unknown): OrderCall | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = text(value.id);
  const orderId = text(value.orderId);
  const state = value.state as CallState;
  const createdAt = time(value.createdAt);
  const ringExpiresAt = time(value.ringExpiresAt);
  if (!id || !orderId || !STATES.includes(state) || !createdAt || !ringExpiresAt) return null;
  return {
    id,
    orderId,
    pair: text(value.pair) ?? CALL_PAIR,
    state,
    caller: party(value.caller, "supplier"),
    callee: party(value.callee, "rider"),
    mine: value.mine === true,
    createdAt,
    ringExpiresAt,
    acceptedAt: time(value.acceptedAt),
    endedAt: time(value.endedAt),
    leaseExpiresAt: time(value.leaseExpiresAt),
  };
}

export function parseCalls(raw: unknown): OrderCall[] {
  return Array.isArray(raw) ? raw.map(parseCall).filter((call): call is OrderCall => call !== null) : [];
}

export function otherParty(call: OrderCall): CallParty {
  return call.mine ? call.callee : call.caller;
}

export function isRingingForMe(call: OrderCall, now: number = Date.now()): boolean {
  return call.state === "ringing" && !call.mine && Date.parse(call.ringExpiresAt) > now;
}

export function activeCall(calls: readonly OrderCall[], pair: string = CALL_PAIR): OrderCall | null {
  return calls.find((call) => call.pair === pair && (call.state === "ringing" || call.state === "accepted")) ?? null;
}

type CallableOrder = { state: string; riderId?: string | null; pickupChat?: unknown };

export type PickupCallAvailability =
  | { kind: "open"; riderFirstName: string | null }
  | { kind: "closed" };

export function pickupCallAvailability(order: CallableOrder | null | undefined): PickupCallAvailability {
  if (!order) return { kind: "closed" };
  const chat = pickupChatOf(order);
  if (!chat || chat.status !== "open" || order.state !== "rider_assigned") return { kind: "closed" };
  return { kind: "open", riderFirstName: chat.riderFirstName };
}

export type MissedCall = {
  callId: string;
  title: string;
  at: string;
  firstName: string;
};

export function latestMissedCall(calls: readonly OrderCall[], pair: string = CALL_PAIR): MissedCall | null {
  const latest = [...calls]
    .filter((call) => call.pair === pair)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (!latest || latest.mine) return null;
  if (latest.state !== "missed" && latest.state !== "cancelled" && latest.state !== "declined") return null;
  const name = latest.caller.firstName;
  return {
    callId: latest.id,
    title: latest.state === "declined" ? `You declined ${name}'s call` : `Missed call from ${name}`,
    at: latest.endedAt ?? latest.createdAt,
    firstName: name,
  };
}

export function missedAtLabel(at: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

export type CallPhase =
  | "permission"
  | "unsupported"
  | "calling"
  | "ringing"
  | "incoming"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended";

export type EndReason =
  | "declined"
  | "no_answer"
  | "missed"
  | "ended"
  | "cancelled"
  | "network_lost"
  | "not_available"
  | "too_many"
  | "failed";

export function endReasonFor(call: Pick<OrderCall, "state" | "mine">): EndReason {
  switch (call.state) {
    case "declined":
      return call.mine ? "declined" : "missed";
    case "missed":
      return call.mine ? "no_answer" : "missed";
    case "cancelled":
      return call.mine ? "cancelled" : "missed";
    default:
      return "ended";
  }
}

export function phaseLabel(phase: CallPhase): string {
  switch (phase) {
    case "calling":
      return "Calling…";
    case "ringing":
      return "Ringing…";
    case "incoming":
      return "Incoming call";
    case "connecting":
      return "Connecting…";
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting…";
    case "permission":
      return "Microphone needed";
    case "unsupported":
      return "Calls are not in this browser";
    case "ended":
      return "Call ended";
  }
}

export type EndCopy = { title: string; body: string; canCallAgain: boolean };

export function endCopy(reason: EndReason, name: string, byMe = false): EndCopy {
  switch (reason) {
    case "declined":
      return { title: "Call declined", body: `${name} could not take the call. Send a message instead, or try again in a minute.`, canCallAgain: true };
    case "no_answer":
      return { title: "Not answered", body: `${name} did not pick up. They will see that you called.`, canCallAgain: true };
    case "missed":
      return { title: `Missed call from ${name}`, body: "Call back while they are on the way to your shop.", canCallAgain: true };
    case "cancelled":
      return { title: "Call cancelled", body: `${name} will see that you tried to call.`, canCallAgain: true };
    case "ended":
      return { title: "Call ended", body: byMe ? "You ended the call." : "The rider ended the call.", canCallAgain: true };
    case "network_lost":
      return {
        title: "Connection lost",
        body: "The call cut off before either of you hung up. Check your connection, then call again.",
        canCallAgain: true,
      };
    case "not_available":
      return {
        title: "Calling has closed",
        body: "You can call the rider only while they are on the way to collect this job. Messages stay open.",
        canCallAgain: false,
      };
    case "too_many":
      return {
        title: "Too many calls",
        body: "You have called several times in a few minutes. Wait a moment, or send a message.",
        canCallAgain: false,
      };
    case "failed":
      return {
        title: "The call did not go through",
        body: "GRIDGO could not be reached. Check your connection, then call again.",
        canCallAgain: true,
      };
  }
}

export function formatCallDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const parts = [] as string[];
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}

export function pickupCallEntry(riderFirstName: string | null, supported: boolean) {
  const name = riderFirstName || "the rider";
  return {
    title: riderFirstName ? `Call ${riderFirstName}` : "Call the rider",
    detail: supported
      ? "No call charges. Uses your connection, and your number stays private."
      : CALLS_NEED_BROWSER,
    accessibilityLabel: `Call ${name} over the internet`,
  };
}

export function presentCallAlert(alert: { type?: string }): { title: string; body: string } | null {
  if (alert.type === CALL_MISSED_NOTICE) {
    return { title: "Missed call from the rider", body: "The rider collecting a job tried to call your shop. Open the job to call back." };
  }
  if (alert.type === CALL_INCOMING_NOTICE) {
    return { title: "The rider called", body: "The rider collecting a job called your shop. Open the job to call back if you missed it." };
  }
  return null;
}

export type CallRefusal = "not_available" | "too_many" | "already_active" | "not_active" | "gone";

export function callRefusal(error: unknown): CallRefusal | null {
  const code = error instanceof ApiError ? error.code : "";
  if (code === "call_not_available" || code === "forbidden" || code === "order_not_found") return "not_available";
  if (code === "too_many_requests") return "too_many";
  if (code === "call_already_active") return "already_active";
  if (code === "call_not_active" || code === "invalid_call_transition") return "not_active";
  if (code === "call_not_found" || code === "call_history_closed") return "gone";
  return null;
}

export function callsSupported(): boolean {
  return (
    typeof RTCPeerConnection === "function" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export function microphoneDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError" || error.name === "NotFoundError")
  );
}
