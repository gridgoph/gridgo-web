/**
 * The Desk chime.
 *
 * One short sound for every fresh inbox arrival, carried over from the legacy
 * GRIDGO admin (`notification_user.mp3`). Two rules keep it from becoming noise:
 *
 * - Bursts coalesce. A reconnect replays every notification missed while the
 *   tab was away; that is one chime, not one per row.
 * - Browsers refuse audio until the person has interacted with the page. A
 *   refused chime is dropped, and the next click or keypress primes the
 *   element so later chimes play.
 *
 * The preference is per browser (localStorage), on by default, and shared by
 * every tab through the storage event.
 */

export const NOTIFICATION_SOUND_SRC = "/audio/notification_user.mp3";
export const NOTIFICATION_SOUND_PREFERENCE_KEY = "gridgo-web.notification-sound";
export const NOTIFICATION_SOUND_MIN_GAP_MS = 1_500;

type Listener = () => void;
const listeners = new Set<Listener>();
let storageBound = false;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readNotificationSoundEnabled(): boolean {
  return storage()?.getItem(NOTIFICATION_SOUND_PREFERENCE_KEY) !== "off";
}

export function writeNotificationSoundEnabled(enabled: boolean): void {
  try {
    storage()?.setItem(NOTIFICATION_SOUND_PREFERENCE_KEY, enabled ? "on" : "off");
  } catch {
    // Private mode or a full store: the toggle still applies for this page.
  }
  for (const listener of listeners) listener();
}

export function subscribeNotificationSoundEnabled(listener: Listener): () => void {
  listeners.add(listener);
  if (!storageBound && typeof window !== "undefined") {
    storageBound = true;
    window.addEventListener("storage", (event) => {
      if (event.key === null || event.key === NOTIFICATION_SOUND_PREFERENCE_KEY) {
        for (const next of listeners) next();
      }
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export type NotificationChime = {
  /** Play the chime unless one played within the coalescing window. */
  play: () => void;
  /** Stop listening for the priming gesture. */
  dispose: () => void;
};

type ChimeOptions = {
  minGapMs?: number;
  now?: () => number;
  createAudio?: () => HTMLAudioElement;
};

function defaultAudio(): HTMLAudioElement {
  const audio = new Audio(NOTIFICATION_SOUND_SRC);
  audio.preload = "auto";
  return audio;
}

export function createNotificationChime(options: ChimeOptions = {}): NotificationChime {
  const minGap = options.minGapMs ?? NOTIFICATION_SOUND_MIN_GAP_MS;
  const now = options.now ?? (() => Date.now());
  let audio: HTMLAudioElement | null = null;
  let lastPlayedAt = -Infinity;
  let priming = false;
  const gestureEvents = ["pointerdown", "keydown"] as const;

  const element = () => {
    if (!audio) audio = (options.createAudio ?? defaultAudio)();
    return audio;
  };

  const prime = () => {
    unbindGesture();
    const el = element();
    const wasMuted = el.muted;
    el.muted = true;
    void Promise.resolve(el.play())
      .then(() => {
        el.pause();
        el.currentTime = 0;
      })
      .catch(() => undefined)
      .finally(() => {
        el.muted = wasMuted;
      });
  };

  const bindGesture = () => {
    if (priming || typeof window === "undefined") return;
    priming = true;
    for (const type of gestureEvents)
      window.addEventListener(type, prime, { once: true });
  };

  const unbindGesture = () => {
    if (!priming || typeof window === "undefined") return;
    priming = false;
    for (const type of gestureEvents) window.removeEventListener(type, prime);
  };

  return {
    play: () => {
      const at = now();
      if (at - lastPlayedAt < minGap) return;
      lastPlayedAt = at;
      const el = element();
      el.currentTime = 0;
      void Promise.resolve(el.play()).catch(() => {
        lastPlayedAt = -Infinity;
        bindGesture();
      });
    },
    dispose: unbindGesture,
  };
}

let sharedChime: NotificationChime | null = null;

/** One chime element per tab, so the Desk toggle and the stream share it. */
export function notificationChime(): NotificationChime {
  if (!sharedChime) sharedChime = createNotificationChime();
  return sharedChime;
}

/** Test seam: drop the shared element so the next call builds a fresh one. */
export function resetNotificationChimeForTests(): void {
  sharedChime?.dispose();
  sharedChime = null;
}

/** Inbox arrivals older than this were missed long enough that the badge, not a chime, reports them. */
export const NOTIFICATION_SOUND_FRESH_MS = 10 * 60_000;

export function isFreshArrival(at: string, now: number = Date.now()): boolean {
  const stamp = Date.parse(at);
  if (Number.isNaN(stamp)) return true;
  return now - stamp <= NOTIFICATION_SOUND_FRESH_MS;
}
