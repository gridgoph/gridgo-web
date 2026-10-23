/**
 * Shop routes for the rider collecting one job.
 *
 * The same paths gridgo-supplier `lib/api.ts` already calls:
 * `GET/POST /orders/:id/pickup-chat`, `GET /dispatch/:id/location`, and
 * `/orders/:id/calls`. These are the shop's own job, not an operations desk.
 */

import { apiRequest as shopRequest } from "@/lib/api/client";
import type { StoredFile } from "@/lib/api/types";
import {
  parseCall,
  parseCalls,
  type OrderCall,
} from "@/lib/order-call";
import {
  pickupChatOf,
  PICKUP_CHAT_IMAGE_PURPOSE,
  type PickupChatMessage,
  type PickupChatSummary,
} from "@/lib/pickup-chat";
import { parseRiderApproach, type RiderApproach } from "@/lib/rider-approach";

export async function getRiderApproach(orderId: string): Promise<RiderApproach> {
  return parseRiderApproach(await shopRequest<unknown>(`/dispatch/${encodeURIComponent(orderId)}/location`));
}

export async function getPickupChat(
  orderId: string,
): Promise<{ chat: PickupChatSummary | null; messages: PickupChatMessage[] }> {
  const result = await shopRequest<{ chat?: unknown; messages?: PickupChatMessage[] }>(
    `/orders/${encodeURIComponent(orderId)}/pickup-chat`,
  );
  return {
    chat: pickupChatOf({ pickupChat: result.chat }),
    messages: Array.isArray(result.messages) ? result.messages : [],
  };
}

export async function sendPickupMessage(
  orderId: string,
  body: string,
  options?: { attachmentFileIds?: string[] },
): Promise<{ chat: PickupChatSummary | null; message: PickupChatMessage }> {
  const result = await shopRequest<{ chat?: unknown; message: PickupChatMessage }>(
    `/orders/${encodeURIComponent(orderId)}/pickup-chat/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        body,
        ...(options?.attachmentFileIds?.length ? { attachmentFileIds: options.attachmentFileIds } : {}),
      }),
    },
  );
  return { chat: pickupChatOf({ pickupChat: result.chat }), message: result.message };
}

export async function uploadPickupChatImage(file: File): Promise<StoredFile> {
  const body = new FormData();
  body.append("purpose", PICKUP_CHAT_IMAGE_PURPOSE);
  body.append("file", file);
  const uploaded = await shopRequest<{ file: StoredFile }>("/files", { method: "POST", body });
  return uploaded.file;
}

function callsPath(orderId: string, callId?: string, action?: string): string {
  return `/orders/${encodeURIComponent(orderId)}/calls${callId ? `/${encodeURIComponent(callId)}` : ""}${action ? `/${action}` : ""}`;
}

function callOf(raw: { call?: unknown } | null | undefined): OrderCall {
  const call = parseCall(raw?.call);
  if (!call) throw new Error("GRIDGO sent a call this app cannot read.");
  return call;
}

export async function startCall(orderId: string, pair: string): Promise<OrderCall> {
  return callOf(await shopRequest<{ call?: unknown }>(callsPath(orderId), { method: "POST", body: JSON.stringify({ pair }) }));
}

export async function listCalls(orderId: string): Promise<OrderCall[]> {
  const result = await shopRequest<{ calls?: unknown }>(callsPath(orderId));
  return parseCalls(result?.calls);
}

export async function getCall(orderId: string, callId: string): Promise<OrderCall> {
  return callOf(await shopRequest<{ call?: unknown }>(callsPath(orderId, callId)));
}

export type CallAction = "accept" | "decline" | "cancel" | "end" | "heartbeat";

export async function callAction(orderId: string, callId: string, action: CallAction): Promise<OrderCall> {
  return callOf(
    await shopRequest<{ call?: unknown }>(callsPath(orderId, callId, action), { method: "POST", body: "{}" }),
  );
}

export type CallSignalBody =
  | { clientId: string; kind: "offer" | "answer"; sdp: string }
  | { clientId: string; kind: "ice"; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

export type CallSignal = CallSignalBody & { id: number };

export async function sendCallSignal(orderId: string, callId: string, signal: CallSignalBody): Promise<void> {
  await shopRequest(callsPath(orderId, callId, "signals"), { method: "POST", body: JSON.stringify(signal) });
}

export async function getCallSignals(
  orderId: string,
  callId: string,
  after: number,
): Promise<{ signals: CallSignal[]; cursor: number; call: OrderCall | null }> {
  const result = await shopRequest<{ signals?: unknown; cursor?: unknown; call?: unknown }>(
    `${callsPath(orderId, callId, "signals")}?after=${after}`,
  );
  const signals = Array.isArray(result?.signals)
    ? (result.signals as CallSignal[]).filter((row) => row && typeof row.id === "number" && typeof row.kind === "string")
    : [];
  const cursor = typeof result?.cursor === "number" ? result.cursor : after;
  return { signals, cursor, call: parseCall(result?.call) };
}

export type IceServer = { urls: string[] | string; username?: string; credential?: string };

export async function getCallIceServers(orderId: string, callId: string): Promise<IceServer[]> {
  const result = await shopRequest<{ iceServers?: unknown }>(callsPath(orderId, callId, "ice"));
  if (!Array.isArray(result?.iceServers)) return [];
  return (result.iceServers as IceServer[])
    .filter((server) => server && (typeof server.urls === "string" || Array.isArray(server.urls)))
    .map(({ urls, username, credential }) => ({
      urls,
      ...(typeof username === "string" ? { username } : {}),
      ...(typeof credential === "string" ? { credential } : {}),
    }));
}
