/**
 * One browser call with the rider: GRIDGO's record, the signals, and the
 * peer connection. The sequence matches gridgo-supplier `lib/callSession.ts`
 * and gridgo-api `docs/CALLS_API.md`.
 *
 * There is no earpiece and no dialler. Remote audio plays through an
 * `<audio>` element the screen attaches. A missing peer connection or a
 * refused microphone never becomes a phone call.
 */

import { ApiError } from "@/lib/api/client";
import * as pickupApi from "@/lib/api/supplier-pickup";
import {
  CALL_HEARTBEAT_MS,
  CALL_LEASE_MS,
  CALL_PAIR,
  CALL_POLL_MS,
  activeCall,
  callRefusal,
  endReasonFor,
  isRingingForMe,
  isTerminal,
  microphoneDenied,
  otherParty,
  type CallPhase,
  type EndReason,
  type OrderCall,
} from "@/lib/order-call";

export type CallApi = Pick<
  typeof pickupApi,
  "startCall" | "listCalls" | "getCall" | "callAction" | "sendCallSignal" | "getCallSignals" | "getCallIceServers"
>;

export type CallSnapshot = {
  orderId: string;
  phase: CallPhase;
  call: OrderCall | null;
  otherName: string;
  muted: boolean;
  connectedAt: number | null;
  endReason: EndReason | null;
  endedByMe: boolean;
  durationMs: number | null;
  /** Set when the browser refused the microphone. The call was not left ringing. */
  micBlocked: boolean;
};

type IceCandidateInit = { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };
type Description = { type: string; sdp: string };
type Track = { enabled: boolean; stop: () => void };
type Stream = { getTracks: () => Track[]; getAudioTracks: () => Track[] };
type PeerConnection = {
  iceConnectionState: string;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  addTrack: (track: Track, stream: Stream) => unknown;
  createOffer: (options?: object) => Promise<Description>;
  createAnswer: () => Promise<Description>;
  setLocalDescription: (description: Description) => Promise<void>;
  setRemoteDescription: (description: unknown) => Promise<void>;
  addIceCandidate: (candidate: unknown) => Promise<void>;
  close: () => void;
};

export type BrowserCallRuntime = {
  webrtc: {
    RTCPeerConnection: new (config?: RTCConfiguration) => PeerConnection;
    RTCSessionDescription: new (description: Description) => Description;
    RTCIceCandidate: new (init: IceCandidateInit) => unknown;
    mediaDevices: { getUserMedia: (constraints: MediaStreamConstraints) => Promise<Stream> };
  };
};

export const RECONNECT_GIVE_UP_MS = 15_000;
export const PEER_END_GRACE_MS = 5_000;
export const RING_OFFLINE_GIVE_UP_MS = 15_000;

export function loadCallRuntime(): BrowserCallRuntime | null {
  if (typeof RTCPeerConnection !== "function") return null;
  if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.getUserMedia !== "function") return null;
  if (typeof RTCSessionDescription !== "function" || typeof RTCIceCandidate !== "function") return null;
  return {
    webrtc: {
      RTCPeerConnection: RTCPeerConnection as unknown as BrowserCallRuntime["webrtc"]["RTCPeerConnection"],
      RTCSessionDescription: RTCSessionDescription as unknown as BrowserCallRuntime["webrtc"]["RTCSessionDescription"],
      RTCIceCandidate: RTCIceCandidate as unknown as BrowserCallRuntime["webrtc"]["RTCIceCandidate"],
      mediaDevices: navigator.mediaDevices,
    },
  };
}

export class CallSession {
  private snapshot: CallSnapshot;
  private pc: PeerConnection | null = null;
  private stream: Stream | null = null;
  private cursor = 0;
  private seenSignals = new Set<number>();
  private pendingIce: IceCandidateInit[] = [];
  private remoteSet = false;
  private offerApplied = false;
  private iceCount = 0;
  private outbox: Promise<void> = Promise.resolve();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private pollAgain = false;
  private failingSince: number | null = null;
  private leaseExpiresAt: number | null = null;
  private aborted = false;
  private finished = false;

  constructor(
    orderId: string,
    otherName: string | null,
    private readonly runtime: BrowserCallRuntime,
    private readonly onChange: (snapshot: CallSnapshot) => void,
    private readonly onRemoteStream: (stream: MediaStream) => void = () => undefined,
    private readonly deps: { api: CallApi; now: () => number } = { api: pickupApi, now: Date.now },
  ) {
    this.snapshot = {
      orderId,
      phase: "calling",
      call: null,
      otherName: otherName || "the rider",
      muted: false,
      connectedAt: null,
      endReason: null,
      endedByMe: false,
      durationMs: null,
      micBlocked: false,
    };
  }

  get current(): CallSnapshot {
    return this.snapshot;
  }

  private set(patch: Partial<CallSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onChange(this.snapshot);
  }

  private adopt(call: OrderCall): void {
    if (call.state === "accepted") {
      const expires = Date.parse(call.leaseExpiresAt ?? "");
      if (Number.isFinite(expires)) this.leaseExpiresAt = expires;
    }
    this.set({ call, otherName: otherParty(call).firstName || this.snapshot.otherName });
  }

  async startOutgoing(retried = false): Promise<void> {
    if (this.finished || this.aborted) return;
    this.set({ phase: "calling" });
    let call: OrderCall;
    try {
      call = await this.deps.api.startCall(this.snapshot.orderId, CALL_PAIR);
    } catch (error) {
      const refusal = callRefusal(error);
      if (refusal === "already_active") return this.recoverActive(retried);
      return this.finish(refusal === "not_available" ? "not_available" : refusal === "too_many" ? "too_many" : "failed");
    }
    if (this.aborted) {
      await this.deps.api.callAction(call.orderId, call.id, "cancel").catch(() => undefined);
      return this.finish("cancelled", true);
    }
    this.adopt(call);
    if (isTerminal(call.state)) return this.finish(endReasonFor(call));
    this.set({ phase: "ringing" });
    this.startPolling();
    try {
      await this.openPeer();
      const offer = await this.pc!.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await this.pc!.setLocalDescription(offer);
      this.send({ clientId: "offer_1", kind: "offer", sdp: offer.sdp });
    } catch (error) {
      if (this.finished) return;
      if (microphoneDenied(error)) {
        this.set({ micBlocked: true, phase: "permission" });
        await this.hangUpWith("cancelled");
        return;
      }
      await this.hangUpWith("failed");
    }
  }

  private async recoverActive(retried = false): Promise<void> {
    let live: OrderCall | null = null;
    try {
      live = activeCall(await this.deps.api.listCalls(this.snapshot.orderId));
    } catch {
      return this.finish("failed");
    }
    if (!live) return retried ? this.finish("failed") : this.startOutgoing(true);
    if (isRingingForMe(live, this.deps.now())) return this.receive(live);
    if (retried || !live.mine) return this.finish("failed");
    await this.deps.api
      .callAction(live.orderId, live.id, live.state === "ringing" ? "cancel" : "end")
      .catch(() => undefined);
    return this.startOutgoing(true);
  }

  receive(call: OrderCall): void {
    this.adopt(call);
    this.set({ phase: "incoming" });
    this.startPolling();
  }

  async accept(): Promise<void> {
    const call = this.snapshot.call;
    if (!call || this.snapshot.phase !== "incoming") return;
    this.set({ phase: "connecting" });
    try {
      const accepted = await this.deps.api.callAction(call.orderId, call.id, "accept");
      if (this.finished || this.aborted) {
        if (!isTerminal(accepted.state)) {
          await this.deps.api.callAction(call.orderId, call.id, "end").catch(() => undefined);
        }
        return;
      }
      this.adopt(accepted);
    } catch (error) {
      return this.settleAfterRefusal(error);
    }
    this.startHeartbeat();
    try {
      await this.openPeer();
    } catch (error) {
      if (microphoneDenied(error)) {
        this.set({ micBlocked: true, phase: "permission" });
        return this.hangUpWith("ended");
      }
      return this.hangUpWith("failed");
    }
    void this.poll();
  }

  async decline(): Promise<void> {
    const call = this.snapshot.call;
    if (!call || this.snapshot.phase !== "incoming") return;
    this.finish("missed", true);
    await this.deps.api.callAction(call.orderId, call.id, "decline").catch(() => undefined);
  }

  async hangUp(): Promise<void> {
    if (this.finished) return;
    const { phase, call } = this.snapshot;
    if (phase === "incoming") return this.decline();
    if (!call) {
      this.aborted = true;
      return this.finish("cancelled", true);
    }
    if (call.state === "ringing" && call.mine) {
      this.finish("cancelled", true);
      await this.deps.api.callAction(call.orderId, call.id, "cancel").catch(() => undefined);
      return;
    }
    this.finish("ended", true);
    await this.deps.api.callAction(call.orderId, call.id, "end").catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
    this.set({ muted });
  }

  poke(): void {
    void this.poll();
  }

  dispose(): void {
    this.aborted = true;
    void this.hangUp();
  }

  private async openPeer(): Promise<void> {
    const call = this.snapshot.call!;
    const iceServers = await this.deps.api.getCallIceServers(call.orderId, call.id);
    if (this.finished) return;
    const { RTCPeerConnection, mediaDevices } = this.runtime.webrtc;
    const pc = new RTCPeerConnection({ iceServers });
    this.pc = pc;
    pc.addEventListener("icecandidate", (event) => {
      const candidate = (event as { candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null })
        .candidate;
      this.iceCount += 1;
      this.send({
        clientId: `ice_${this.iceCount}`,
        kind: "ice",
        candidate: candidate?.candidate ?? "",
        sdpMid: candidate?.sdpMid ?? null,
        sdpMLineIndex: candidate?.sdpMLineIndex ?? null,
      });
    });
    pc.addEventListener("iceconnectionstatechange", () => this.onIceState(pc.iceConnectionState));
    pc.addEventListener("track", (event) => {
      const streams = (event as { streams?: MediaStream[] }).streams;
      const remote = streams?.[0];
      if (remote) this.onRemoteStream(remote);
    });
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    if (this.finished) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    this.stream = stream;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !this.snapshot.muted;
      pc.addTrack(track, stream);
    }
  }

  private onIceState(state: string): void {
    if (this.finished) return;
    if (state === "connected" || state === "completed") {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.set({ phase: "connected", connectedAt: this.snapshot.connectedAt ?? this.deps.now() });
    } else if (state === "disconnected" || state === "failed") {
      if (this.snapshot.connectedAt) this.set({ phase: "reconnecting" });
      void this.poll();
      if (state === "failed" && this.reconnectTimer) clearTimeout(this.reconnectTimer);
      if (state === "failed" || !this.reconnectTimer) {
        const wait = state === "failed" ? PEER_END_GRACE_MS : RECONNECT_GIVE_UP_MS;
        this.reconnectTimer = setTimeout(() => void this.confirmLoss(), wait);
      }
    }
  }

  private async confirmLoss(): Promise<void> {
    const call = this.snapshot.call;
    if (!call || this.finished) return;
    try {
      this.onState(await this.deps.api.getCall(call.orderId, call.id));
    } catch (error) {
      if (callRefusal(error)) return this.settleAfterRefusal(error);
    }
    if (!this.finished) await this.hangUpWith("network_lost");
  }

  private send(signal: pickupApi.CallSignalBody): void {
    const call = this.snapshot.call;
    if (!call) return;
    this.outbox = this.outbox.then(async () => {
      for (let attempt = 0; attempt < 3 && !this.finished; attempt += 1) {
        try {
          await this.deps.api.sendCallSignal(call.orderId, call.id, signal);
          return;
        } catch (error) {
          if (callRefusal(error) || (error instanceof ApiError && error.status < 500)) return;
        }
      }
    });
  }

  private async applySignals(signals: pickupApi.CallSignal[]): Promise<void> {
    const pc = this.pc;
    for (const signal of signals) {
      if (this.seenSignals.has(signal.id)) continue;
      if (signal.kind === "ice") {
        const init = { candidate: signal.candidate, sdpMid: signal.sdpMid, sdpMLineIndex: signal.sdpMLineIndex };
        if (!init.candidate) {
          this.seenSignals.add(signal.id);
          continue;
        }
        if (pc && this.remoteSet) await this.addIce(init);
        else this.pendingIce.push(init);
        this.seenSignals.add(signal.id);
        continue;
      }
      if (!pc) return;
      const { RTCSessionDescription } = this.runtime.webrtc;
      if (signal.kind === "answer" && this.snapshot.call?.mine && !this.remoteSet) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }));
        this.remoteSet = true;
      } else if (signal.kind === "offer" && !this.snapshot.call?.mine && !this.offerApplied) {
        this.offerApplied = true;
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: signal.sdp }));
        this.remoteSet = true;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send({ clientId: "answer_1", kind: "answer", sdp: answer.sdp });
      }
      this.seenSignals.add(signal.id);
      if (this.remoteSet) await this.flushIce();
    }
  }

  private async flushIce(): Promise<void> {
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const init of queued) await this.addIce(init);
  }

  private async addIce(init: IceCandidateInit): Promise<void> {
    const { RTCIceCandidate } = this.runtime.webrtc;
    await this.pc?.addIceCandidate(new RTCIceCandidate(init)).catch(() => undefined);
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.checkLease();
      void this.poll();
    }, CALL_POLL_MS);
  }

  private async poll(): Promise<void> {
    const call = this.snapshot.call;
    if (!call || this.finished) return;
    if (this.polling) {
      this.pollAgain = true;
      return;
    }
    this.polling = true;
    try {
      if (!call.mine && !this.pc) {
        this.onState(await this.deps.api.getCall(call.orderId, call.id));
      } else {
        const result = await this.deps.api.getCallSignals(call.orderId, call.id, this.cursor);
        if (result.call) this.onState(result.call);
        if (!this.finished) {
          await this.applySignals(result.signals);
          if (result.signals.every((signal) => this.seenSignals.has(signal.id))) this.cursor = result.cursor;
        }
      }
      this.failingSince = null;
    } catch (error) {
      await this.onPollFailure(error);
    } finally {
      this.polling = false;
      this.checkLease();
      if (this.pollAgain && !this.finished) {
        this.pollAgain = false;
        void this.poll();
      }
    }
  }

  private onState(call: OrderCall): void {
    if (this.finished) return;
    const was = this.snapshot.call?.state;
    this.adopt(call);
    if (isTerminal(call.state)) {
      this.finish(endReasonFor(call));
      return;
    }
    if (call.state === "ringing" && !call.mine && Date.parse(call.ringExpiresAt) <= this.deps.now()) {
      this.finish("missed");
      return;
    }
    if (call.state === "accepted" && was === "ringing" && call.mine) {
      if (this.snapshot.phase === "ringing") this.set({ phase: "connecting" });
      this.startHeartbeat();
    }
  }

  private async onPollFailure(error: unknown): Promise<void> {
    const refusal = callRefusal(error);
    if (refusal) return this.settleAfterRefusal(error);
    const now = this.deps.now();
    this.failingSince ??= now;
    const call = this.snapshot.call;
    if (call?.state === "ringing" && now - this.failingSince >= RING_OFFLINE_GIVE_UP_MS) {
      await this.hangUpWith("network_lost");
    }
  }

  private async settleAfterRefusal(error: unknown): Promise<void> {
    const call = this.snapshot.call;
    const refusal = callRefusal(error);
    if (call && refusal !== "gone") {
      try {
        const fresh = await this.deps.api.getCall(call.orderId, call.id);
        this.adopt(fresh);
        if (isTerminal(fresh.state)) return this.finish(endReasonFor(fresh));
      } catch {
        // Gone or unreachable.
      }
    }
    this.finish(refusal === "not_available" || refusal === "gone" ? "not_available" : this.snapshot.connectedAt ? "ended" : "failed");
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.leaseExpiresAt ??= this.deps.now() + CALL_LEASE_MS;
    this.heartbeatTimer = setInterval(() => void this.beat(), CALL_HEARTBEAT_MS);
  }

  private async beat(): Promise<void> {
    const call = this.snapshot.call;
    if (!call || this.finished) return;
    try {
      const renewed = await this.deps.api.callAction(call.orderId, call.id, "heartbeat");
      this.leaseExpiresAt = this.deps.now() + CALL_LEASE_MS;
      this.onState(renewed);
    } catch (error) {
      if (callRefusal(error)) await this.settleAfterRefusal(error);
    }
    this.checkLease();
  }

  private checkLease(): void {
    if (this.finished || this.snapshot.call?.state !== "accepted" || this.leaseExpiresAt === null) return;
    if (this.deps.now() >= this.leaseExpiresAt) void this.hangUpWith("network_lost");
  }

  private async hangUpWith(reason: EndReason): Promise<void> {
    const call = this.snapshot.call;
    if (this.finished) return;
    this.finish(reason);
    if (!call) return;
    const action = call.state === "ringing" ? (call.mine ? "cancel" : "decline") : "end";
    await this.deps.api.callAction(call.orderId, call.id, action).catch(() => undefined);
  }

  private finish(reason: EndReason, byMe = false): void {
    if (this.finished) return;
    this.finished = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pollTimer = this.heartbeatTimer = null;
    this.reconnectTimer = null;
    for (const track of this.stream?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        // Already stopped.
      }
    }
    this.stream = null;
    try {
      this.pc?.close();
    } catch {
      // Already closed.
    }
    this.pc = null;
    const connectedAt = this.snapshot.connectedAt;
    const micBlocked = this.snapshot.micBlocked;
    this.set({
      phase: micBlocked ? "permission" : "ended",
      endReason: reason,
      endedByMe: byMe,
      durationMs: connectedAt ? this.deps.now() - connectedAt : null,
    });
  }

  get isFinished(): boolean {
    return this.finished;
  }
}
