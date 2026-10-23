import { afterEach, describe, expect, it, vi } from "vitest";
import { CallSession, type BrowserCallRuntime, type CallApi } from "@/lib/call-session";
import type { OrderCall } from "@/lib/order-call";

const NOW = Date.parse("2026-10-23T05:00:00.000Z");
function call(patch: Partial<OrderCall> = {}): OrderCall {
  return {
    id: "call_1",
    orderId: "ord_1",
    pair: "pickup",
    state: "ringing",
    mine: true,
    caller: { firstName: "Shop", role: "supplier" },
    callee: { firstName: "Jun", role: "rider" },
    createdAt: new Date(NOW).toISOString(),
    ringExpiresAt: new Date(NOW + 30000).toISOString(),
    acceptedAt: null,
    endedAt: null,
    leaseExpiresAt: null,
    ...patch,
  };
}
function fixture() {
  const track = { enabled: true, stop: vi.fn() };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const close = vi.fn();
  class Peer {
    iceConnectionState = "new";
    addEventListener() {}
    addTrack() {}
    close = close;
    createOffer = async () => ({ type: "offer", sdp: "offer" });
    createAnswer = async () => ({ type: "answer", sdp: "answer" });
    setLocalDescription = async () => {};
    setRemoteDescription = async () => {};
    addIceCandidate = async () => {};
  }
  const runtime = {
    webrtc: {
      RTCPeerConnection: Peer,
      RTCSessionDescription: class {},
      RTCIceCandidate: class {},
      mediaDevices: { getUserMedia: async () => stream },
    },
  } as unknown as BrowserCallRuntime;
  const api = {
    startCall: vi.fn(async () => call()),
    listCalls: vi.fn(async () => []),
    getCall: vi.fn(async () => call()),
    callAction: vi.fn(async () =>
      call({
        state: "accepted",
        mine: false,
        leaseExpiresAt: new Date(NOW + 90000).toISOString(),
      }),
    ),
    sendCallSignal: vi.fn(async () => {}),
    getCallSignals: vi.fn(async () => ({ signals: [], cursor: 0, call: null })),
    getCallIceServers: vi.fn(async () => []),
  } satisfies CallApi;
  const session = new CallSession("ord_1", "Jun", runtime, vi.fn(), undefined, {
    api,
    now: Date.now,
  });
  return { session, api, track, close };
}
afterEach(() => {
  vi.useRealTimers();
});

describe("browser call lifecycle", () => {
  it("cancels a start that finishes after the call view was disposed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { session, api, track } = fixture();
    let resolve!: (value: OrderCall) => void;
    api.startCall.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const starting = session.startOutgoing();
    session.dispose();
    resolve(call());
    await starting;
    expect(api.callAction).toHaveBeenCalledWith("ord_1", "call_1", "cancel");
    expect(session.isFinished).toBe(true);
    expect(session.current.phase).toBe("ended");
    expect(track.enabled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends the backend call and releases the microphone when its view unmounts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { session, api, track, close } = fixture();
    session.receive(call({ mine: false }));
    await session.accept();
    session.dispose();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(api.callAction).toHaveBeenCalledWith("ord_1", "call_1", "end");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops at the server lease even while a state poll is still pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { session, api, track } = fixture();
    api.callAction.mockResolvedValue(
      call({
        mine: false,
        state: "accepted",
        leaseExpiresAt: new Date(NOW + 1000).toISOString(),
      }),
    );
    api.getCallSignals.mockImplementation(() => new Promise(() => {}));
    session.receive(call({ mine: false }));
    await session.accept();
    await vi.advanceTimersByTimeAsync(2000);
    expect(session.isFinished).toBe(true);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(api.callAction).toHaveBeenCalledWith("ord_1", "call_1", "end");
    expect(vi.getTimerCount()).toBe(0);
  });
});
