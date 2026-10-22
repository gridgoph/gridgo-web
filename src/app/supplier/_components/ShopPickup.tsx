"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bike, ImagePlus, Lock, Mic, MicOff, Phone, PhoneOff, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusChip } from "@/components/ui/StatusChip";
import { getFileContent, ApiError } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import * as pickupApi from "@/lib/api/supplier-pickup";
import { CallSession, loadCallRuntime, type CallSnapshot } from "@/lib/call-session";
import { fetchRoute } from "@/lib/osrm";
import {
  CALL_POLL_MS,
  CALLS_MIC_BLOCKED,
  CALLS_NEED_BROWSER,
  callsSupported,
  endCopy,
  formatCallDuration,
  isRingingForMe,
  latestMissedCall,
  missedAtLabel,
  phaseLabel,
  pickupCallAvailability,
  pickupCallEntry,
  spokenDuration,
  type OrderCall,
} from "@/lib/order-call";
import {
  PICKUP_CHAT_IMAGE_MAX_COUNT,
  PICKUP_CHAT_POLL_MS,
  PICKUP_MESSAGE_MAX,
  messageTime,
  pickupChatEntry,
  pickupChatNotice,
  pickupChatOf,
  pickupChatUnavailable,
  pickupSendError,
  riderNameOf,
  senderLabel,
  validatePickupImage,
  type PickupChatMessage,
  type PickupChatSummary,
  type PickupChatUnavailable,
} from "@/lib/pickup-chat";
import {
  APPROACH_POLL_MS,
  approachReadout,
  approachWithdrawn,
  haversineMetres,
  type ApproachRoute,
  type RiderApproach,
} from "@/lib/rider-approach";

const REROUTE_METRES = 60;

type Props = {
  order: Order;
  stopped: boolean;
  onJobChanged: () => void;
};

/**
 * Rider messages, the shared approach, and an internet call, beside pickup.
 * The words match the shop app. The staff dispatch map is not used.
 */
export function ShopPickup({ order, stopped, onJobChanged }: Props) {
  const summaryOnJob = pickupChatOf(order);
  const onTheWay = order.state === "rider_assigned" && !stopped;
  const callable = !stopped && pickupCallAvailability(order).kind === "open";

  if (!summaryOnJob && !onTheWay) return null;

  return (
    <ShopPickupLive
      orderId={order.id}
      summaryOnJob={summaryOnJob}
      onTheWay={onTheWay}
      callable={callable}
      riderFirstName={summaryOnJob?.riderFirstName ?? null}
      shopPin={order.pickup ?? null}
      onJobChanged={onJobChanged}
    />
  );
}

function ShopPickupLive({
  orderId,
  summaryOnJob,
  onTheWay,
  callable,
  riderFirstName,
  shopPin,
  onJobChanged,
}: {
  orderId: string;
  summaryOnJob: PickupChatSummary | null;
  onTheWay: boolean;
  callable: boolean;
  riderFirstName: string | null;
  shopPin: { lat: number; lng: number } | null;
  onJobChanged: () => void;
}) {
  return (
    <section id="pickup-chat" className="flex flex-col gap-4 border-t border-outline-subtle pt-4" aria-label="Pickup">
      {onTheWay ? (
        <ApproachCard orderId={orderId} riderFirstName={riderFirstName} shopPin={shopPin} onPickedUp={onJobChanged} />
      ) : null}
      {summaryOnJob ? <PickupConversation orderId={orderId} fallback={summaryOnJob} /> : null}
      {callable ? <PickupCall orderId={orderId} riderFirstName={riderFirstName} /> : null}
    </section>
  );
}

function ApproachCard({
  orderId,
  riderFirstName,
  shopPin,
  onPickedUp,
}: {
  orderId: string;
  riderFirstName: string | null;
  shopPin: { lat: number; lng: number } | null;
  onPickedUp: () => void;
}) {
  const [approach, setApproach] = useState<RiderApproach | null>(null);
  const [route, setRoute] = useState<ApproachRoute | null>(null);
  const [failed, setFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const routedFrom = useRef<{ lat: number; lng: number } | null>(null);
  const pickedUp = useRef(onPickedUp);
  pickedUp.current = onPickedUp;

  useEffect(() => {
    let gone = false;
    const load = async () => {
      try {
        const next = await pickupApi.getRiderApproach(orderId);
        if (gone) return;
        setApproach(next);
        setFailed(false);
        setUnavailable(false);
        if (next.hidden === "picked_up") pickedUp.current();
      } catch (error) {
        if (gone) return;
        if (error instanceof ApiError && [403, 404, 405].includes(error.status)) setUnavailable(true);
        else setFailed(true);
      }
    };
    void load();
    const timer = setInterval(() => void load(), APPROACH_POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      gone = true;
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [orderId]);

  const ping = approach?.ping ?? null;
  const shop = approach?.shop ?? null;
  useEffect(() => {
    if (!ping || !shop) return;
    const last = routedFrom.current;
    if (last && haversineMetres(last, ping) < REROUTE_METRES) return;
    routedFrom.current = { lat: ping.lat, lng: ping.lng };
    let gone = false;
    void fetchRoute(ping, shop).then((answer) => {
      if (gone) return;
      setRoute({
        routed: answer.routed && answer.durationSeconds != null,
        distanceMetres: answer.distanceMetres,
        durationSeconds: answer.durationSeconds ?? 0,
        coordinates: answer.coordinates,
      });
    });
    return () => {
      gone = true;
    };
  }, [ping, shop]);

  if (approachWithdrawn(approach, unavailable)) return null;

  const shown = approach
    ? { ...approach, shop: approach.shop ?? (shopPin && Number.isFinite(shopPin.lat) ? shopPin : null) }
    : null;
  const readout = shown
    ? approachReadout({
        approach: shown,
        route: ping && shop ? route : null,
        riderName: riderFirstName,
        now,
      })
    : null;
  const mapLabel = riderFirstName ? `Where ${riderFirstName} is on the way to your shop` : "Where the rider is on the way to your shop";

  return (
    <div className="flex flex-col gap-2" data-testid="rider-approach" aria-live="polite">
      <h2 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
        On the way
      </h2>
      {readout ? (
        <div className="flex flex-col gap-2" aria-label={mapLabel}>
          <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
            {readout.headline}
          </p>
          {readout.distance ? <p className="text-body text-text-secondary m-0">{readout.distance} from your shop</p> : null}
          <div>
            <StatusChip tone={readout.freshness.tone} label={readout.freshness.label} icon={readout.freshness.icon} />
          </div>
          {readout.detail ? <p className="text-caption text-text-muted m-0">{readout.detail}</p> : null}
        </div>
      ) : (
        <p className="text-caption text-text-muted m-0">Checking where the rider is.</p>
      )}
      {failed ? (
        <p className="text-caption text-text-muted m-0">
          Could not check for a newer position just now. GRIDGO tries again in a few seconds.
        </p>
      ) : null}
    </div>
  );
}

function PickupConversation({ orderId, fallback }: { orderId: string; fallback: PickupChatSummary }) {
  const [chat, setChat] = useState<PickupChatSummary | null>(fallback);
  const [messages, setMessages] = useState<PickupChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<PickupChatUnavailable | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const chatRef = useRef(chat);
  chatRef.current = chat;
  const load = useCallback(async () => {
    try {
      const result = await pickupApi.getPickupChat(orderId);
      setUnavailable(null);
      setLoadError(null);
      if (result.chat) setChat(result.chat);
      setMessages(result.messages);
    } catch (error) {
      const closed = pickupChatUnavailable(error);
      if (closed) {
        setUnavailable(closed);
        setChat(null);
        setMessages([]);
      } else if (!chatRef.current) {
        setLoadError("Could not load your messages. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    let gone = false;
    const run = () => {
      if (!gone) void load();
    };
    run();
    const timer = setInterval(run, PICKUP_CHAT_POLL_MS);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages.length]);

  const open = chat?.status === "open";
  const name = riderNameOf(chat);
  const entry = chat ? pickupChatEntry(chat) : null;

  const send = async () => {
    const body = draft.trim();
    if ((!body && pending.length === 0) || sending || !open) return;
    setSending(true);
    setSendError(null);
    try {
      const fileIds: string[] = [];
      for (const file of pending) {
        const stored = await pickupApi.uploadPickupChatImage(file);
        fileIds.push(stored.fileId);
      }
      const posted = fileIds.length
        ? await pickupApi.sendPickupMessage(orderId, body, { attachmentFileIds: fileIds })
        : await pickupApi.sendPickupMessage(orderId, body);
      setDraft("");
      setPending([]);
      if (posted.chat) setChat(posted.chat);
      setMessages((current) => (current.some((row) => row.id === posted.message.id) ? current : [...current, posted.message]));
    } catch (error) {
      setSendError(pickupSendError(error));
      void load();
    } finally {
      setSending(false);
    }
  };

  if (unavailable) {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          {unavailable.title}
        </h2>
        <p className="text-body text-text-secondary m-0 max-w-prose">{unavailable.body}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="bg-surface-variant text-text-primary flex size-11 shrink-0 items-center justify-center rounded-full" aria-hidden>
          <Bike className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
            {entry?.title ?? "Messages with the rider"}
          </h2>
          <p className="text-caption text-text-muted m-0">{open ? "Collecting this job" : "Delivered"}</p>
        </div>
      </div>
      {chat ? (
        <p className="bg-surface-variant text-caption text-text-secondary m-0 flex items-start gap-2 rounded-field px-3 py-2">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{pickupChatNotice(chat)}</span>
        </p>
      ) : null}
      {loadError && !chat ? (
        <p className="text-caption text-error m-0" role="alert">
          {loadError}{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : (
        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto" aria-label="Messages with the rider" data-testid="pickup-chat-transcript">
          {loading && messages.length === 0 ? (
            <p className="text-caption text-text-muted m-0">Loading messages.</p>
          ) : messages.length === 0 ? (
            <p className="text-body text-text-secondary m-0">
              {open
                ? `No messages yet. Ask ${name} where they are, or tell them which door to use and what to look for.`
                : "Nobody wrote during this pickup."}
            </p>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={message.mine ? "max-w-[80%] self-end" : "max-w-[80%] self-start"}>
                <div
                  className={
                    message.mine
                      ? "bg-accent text-accent-foreground rounded-card px-3 py-2"
                      : "border-outline bg-surface text-text-primary rounded-card border px-3 py-2"
                  }
                >
                  {message.body ? <p className="text-body m-0 whitespace-pre-wrap">{message.body}</p> : null}
                  {message.attachments?.map((attachment) => (
                    <ChatPhoto key={attachment.fileId} fileId={attachment.fileId} name={attachment.originalFilename} />
                  ))}
                </div>
                <p className="text-caption text-text-muted m-0 mt-1">
                  {senderLabel(message, chat)} · {messageTime(message.createdAt)}
                </p>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      )}
      {sendError ? (
        <p className="text-caption text-error m-0" role="alert">
          {sendError}
        </p>
      ) : null}
      {open ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {pending.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={`${pending.length} photos ready to send`}>
              {pending.map((file, index) => (
                <li key={`${file.name}-${index}`} className="text-caption flex items-center gap-1">
                  <span>{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    disabled={sending}
                    onClick={() => setPending((current) => current.filter((_, at) => at !== index))}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-end gap-2">
            <label className="border-outline flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-field border">
              <span className="sr-only">Add photos</span>
              <ImagePlus className="size-4" aria-hidden />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={sending || pending.length >= PICKUP_CHAT_IMAGE_MAX_COUNT}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const problem = validatePickupImage(file);
                  if (problem) {
                    setSendError(problem);
                    return;
                  }
                  if (pending.length >= PICKUP_CHAT_IMAGE_MAX_COUNT) {
                    setSendError(`A message can include up to ${PICKUP_CHAT_IMAGE_MAX_COUNT} photos.`);
                    return;
                  }
                  setSendError(null);
                  setPending((current) => [...current, file]);
                }}
              />
            </label>
            <textarea
              id="pickup-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={PICKUP_MESSAGE_MAX}
              rows={2}
              disabled={sending}
              aria-label={`Message ${name}`}
              placeholder={`Write to ${name}`}
              className="border-outline bg-surface text-body text-text-primary min-h-12 min-w-0 flex-1 rounded-field border px-3 py-2"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <Button type="submit" variant="primary" size="icon" aria-label="Send" disabled={sending || (!draft.trim() && pending.length === 0)}>
              <Send aria-hidden />
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function ChatPhoto({ fileId, name }: { fileId: string; name?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    let objectUrl: string | null = null;
    void getFileContent(fileId)
      .then((blob) => {
        if (gone) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);
  if (!url) return <p className="text-caption m-0">{name || "Photo"}</p>;
  return <img src={url} alt={name || "Photo from this pickup"} className="mt-2 max-h-40 rounded-field" />;
}

function PickupCall({ orderId, riderFirstName }: { orderId: string; riderFirstName: string | null }) {
  const supported = callsSupported();
  const entry = pickupCallEntry(riderFirstName, supported);
  const [calls, setCalls] = useState<OrderCall[]>([]);
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState<"unsupported" | "permission" | null>(supported ? null : "unsupported");
  const [snapshot, setSnapshot] = useState<CallSnapshot | null>(null);
  const session = useRef<CallSession | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let gone = false;
    const load = async () => {
      try {
        const next = await pickupApi.listCalls(orderId);
        if (gone) return;
        setCalls(next);
        const incoming = next.find((call) => isRingingForMe(call));
        if (incoming && !session.current) {
          const runtime = loadCallRuntime();
          if (!runtime) {
            setBlocked("unsupported");
            setOpen(true);
            return;
          }
          const nextSession = new CallSession(orderId, riderFirstName, runtime, setSnapshot, (stream) => {
            if (audio.current) {
              audio.current.srcObject = stream;
              void audio.current.play().catch(() => undefined);
            }
          });
          session.current = nextSession;
          nextSession.receive(incoming);
          setBlocked(null);
          setOpen(true);
        }
      } catch {
        // A missed poll waits for the next one. The window is the server's.
      }
    };
    void load();
    const timer = setInterval(() => void load(), CALL_POLL_MS);
    return () => {
      gone = true;
      clearInterval(timer);
      session.current?.dispose();
      session.current = null;
    };
  }, [orderId, riderFirstName]);

  useEffect(() => {
    if (snapshot?.phase !== "connected" || !snapshot.connectedAt) return;
    const timer = setInterval(() => setElapsed(Date.now() - (snapshot.connectedAt ?? Date.now())), 1000);
    return () => clearInterval(timer);
  }, [snapshot?.phase, snapshot?.connectedAt]);

  const start = () => {
    if (!supported) {
      setBlocked("unsupported");
      setOpen(true);
      return;
    }
    const runtime = loadCallRuntime();
    if (!runtime) {
      setBlocked("unsupported");
      setOpen(true);
      return;
    }
    session.current?.dispose();
    const nextSession = new CallSession(orderId, riderFirstName, runtime, setSnapshot, (stream) => {
      if (audio.current) {
        audio.current.srcObject = stream;
        void audio.current.play().catch(() => undefined);
      }
    });
    session.current = nextSession;
    setBlocked(null);
    setOpen(true);
    void nextSession.startOutgoing();
  };

  const close = () => {
    setOpen(false);
    if (session.current?.isFinished) {
      session.current = null;
      setSnapshot(null);
    }
  };

  const missed = latestMissedCall(calls);
  const phase = snapshot?.micBlocked ? "permission" : blocked === "unsupported" ? "unsupported" : blocked === "permission" ? "permission" : snapshot?.phase;
  const ended = snapshot?.phase === "ended" && !snapshot.micBlocked ? endCopy(snapshot.endReason ?? "ended", snapshot.otherName, snapshot.endedByMe) : null;

  return (
    <div className="border-outline-subtle flex flex-col gap-2 border-t pt-3">
      <audio ref={audio} autoPlay className="sr-only" />
      {missed ? (
        <p className="text-body text-text-primary m-0" role="status">
          {missed.title}
          <span className="text-caption text-text-muted"> · {missedAtLabel(missed.at)}</span>
        </p>
      ) : null}
      <button
        type="button"
        className="flex min-h-11 items-center gap-3 rounded-field text-left"
        aria-label={entry.accessibilityLabel}
        onClick={start}
      >
        <span className="bg-surface-variant flex size-10 items-center justify-center rounded-full" aria-hidden>
          <Phone className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="text-body text-text-primary block" style={{ fontFamily: "var(--font-medium)" }}>
            {entry.title}
          </span>
          <span className="text-caption text-text-muted block">{entry.detail}</span>
        </span>
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{riderFirstName || "The rider"}</DialogTitle>
            <DialogDescription>Rider collecting this job</DialogDescription>
          </DialogHeader>
          <p className="text-body text-text-secondary m-0" aria-live="polite">
            {phase === "permission"
              ? "Microphone needed"
              : phase === "unsupported"
                ? "Calls are not in this browser"
                : phase === "connected"
                  ? formatCallDuration(elapsed)
                  : phase
                    ? phaseLabel(phase)
                    : "Calling…"}
          </p>
          {phase === "connected" ? (
            <p className="sr-only">{`Connected, ${spokenDuration(elapsed)}`}</p>
          ) : null}
          {phase === "unsupported" ? <p className="text-body text-text-secondary m-0">{CALLS_NEED_BROWSER}</p> : null}
          {phase === "permission" ? <p className="text-body text-text-secondary m-0">{CALLS_MIC_BLOCKED}</p> : null}
          {ended ? (
            <div>
              <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                {ended.title}
              </p>
              <p className="text-body text-text-secondary m-0">{ended.body}</p>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            {phase === "incoming" ? (
              <>
                <Button type="button" variant="danger" onClick={() => void session.current?.decline()}>
                  <PhoneOff aria-hidden /> Decline
                </Button>
                <Button type="button" variant="primary" onClick={() => void session.current?.accept()}>
                  <Phone aria-hidden /> Accept
                </Button>
              </>
            ) : null}
            {phase === "unsupported" || phase === "permission" ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  close();
                  document.getElementById("pickup-message")?.focus();
                }}
              >
                Use messages
              </Button>
            ) : null}
            {phase && phase !== "incoming" && phase !== "unsupported" && phase !== "permission" && phase !== "ended" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={snapshot?.muted ?? false}
                  onClick={() => session.current?.setMuted(!snapshot?.muted)}
                >
                  {snapshot?.muted ? <MicOff aria-hidden /> : <Mic aria-hidden />}
                  {snapshot?.muted ? "Muted" : "Mute"}
                </Button>
                <Button type="button" variant="danger" onClick={() => void session.current?.hangUp()}>
                  <PhoneOff aria-hidden /> End call
                </Button>
              </>
            ) : null}
            {ended && !snapshot?.endedByMe && ended.canCallAgain ? (
              <Button type="button" variant="primary" onClick={start}>
                {snapshot?.endReason === "missed" ? "Call back" : "Call again"}
              </Button>
            ) : null}
            {phase === "ended" || phase === "unsupported" || phase === "permission" ? (
              <Button type="button" variant="outline" onClick={close}>
                Close
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
