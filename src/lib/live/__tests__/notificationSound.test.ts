// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NOTIFICATION_SOUND_FRESH_MS,
  NOTIFICATION_SOUND_PREFERENCE_KEY,
  createNotificationChime,
  isFreshArrival,
  readNotificationSoundEnabled,
  subscribeNotificationSoundEnabled,
  writeNotificationSoundEnabled,
} from "../notificationSound";

type FakeAudio = HTMLAudioElement & { plays: number };

function fakeAudio(play: () => Promise<void>): FakeAudio {
  const audio = {
    plays: 0,
    muted: false,
    currentTime: 0,
    preload: "none",
    pause: vi.fn(),
    play: vi.fn(() => {
      audio.plays += 1;
      return play();
    }),
  } as unknown as FakeAudio;
  return audio;
}

afterEach(() => {
  window.localStorage.clear();
});

describe("sound preference", () => {
  it("is on until someone turns it off", () => {
    expect(readNotificationSoundEnabled()).toBe(true);
    writeNotificationSoundEnabled(false);
    expect(readNotificationSoundEnabled()).toBe(false);
    expect(window.localStorage.getItem(NOTIFICATION_SOUND_PREFERENCE_KEY)).toBe("off");
    writeNotificationSoundEnabled(true);
    expect(readNotificationSoundEnabled()).toBe(true);
  });

  it("tells subscribers when the preference changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNotificationSoundEnabled(listener);
    writeNotificationSoundEnabled(false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeNotificationSoundEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("chime", () => {
  it("plays once for a burst of arrivals", () => {
    let clock = 1_000;
    const audio = fakeAudio(() => Promise.resolve());
    const chime = createNotificationChime({
      minGapMs: 1_500,
      now: () => clock,
      createAudio: () => audio,
    });
    chime.play();
    chime.play();
    clock += 1_000;
    chime.play();
    expect(audio.plays).toBe(1);
    clock += 600;
    chime.play();
    expect(audio.plays).toBe(2);
  });

  it("waits for a gesture when the browser refuses, then plays later chimes", async () => {
    let allowed = false;
    let clock = 0;
    const audio = fakeAudio(() =>
      allowed ? Promise.resolve() : Promise.reject(new Error("NotAllowedError")),
    );
    const chime = createNotificationChime({
      minGapMs: 1_500,
      now: () => clock,
      createAudio: () => audio,
    });
    chime.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.plays).toBe(1);

    allowed = true;
    window.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // The priming play is muted and paused straight away.
    expect(audio.plays).toBe(2);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.muted).toBe(false);

    clock += 5_000;
    chime.play();
    expect(audio.plays).toBe(3);
    chime.dispose();
  });
});

describe("isFreshArrival", () => {
  it("treats anything inside the window as news and older rows as history", () => {
    const now = Date.parse("2026-09-15T10:00:00Z");
    expect(isFreshArrival("2026-09-15T09:59:00Z", now)).toBe(true);
    expect(
      isFreshArrival(new Date(now - NOTIFICATION_SOUND_FRESH_MS - 1).toISOString(), now),
    ).toBe(false);
    expect(isFreshArrival("not a date", now)).toBe(true);
  });
});
