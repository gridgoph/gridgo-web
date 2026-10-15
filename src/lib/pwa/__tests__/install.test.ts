import { describe, expect, it } from "vitest";

import {
  describeDevice,
  installRouteFor,
  iosSupportsWebPush,
  iosVersionOf,
  isIos,
  isIosSafari,
} from "../install";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneOld:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 [FBAN/FBIOS;FBAV/520.0.0]",
  ipadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
};

describe("which phone this is", () => {
  it("tells iPhone and iPad (even in desktop mode) from a Mac", () => {
    expect(isIos(UA.iphoneSafari, 5)).toBe(true);
    expect(isIos(UA.ipadDesktop, 5)).toBe(true);
    expect(isIos(UA.ipadDesktop, 0)).toBe(false);
    expect(isIos(UA.android, 5)).toBe(false);
  });

  it("finds Safari itself, not Chrome or an in-app browser on iOS", () => {
    expect(isIosSafari(UA.iphoneSafari, 5)).toBe(true);
    expect(isIosSafari(UA.ipadDesktop, 5)).toBe(true);
    expect(isIosSafari(UA.iphoneChrome, 5)).toBe(false);
    expect(isIosSafari(UA.iphoneFacebook, 5)).toBe(false);
  });

  it("reads the iOS version, and push arrives in 16.4", () => {
    expect(iosVersionOf(UA.iphoneSafari)).toEqual([18, 5]);
    expect(iosVersionOf(UA.ipadDesktop)).toEqual([17, 4]);
    expect(iosSupportsWebPush([16, 3])).toBe(false);
    expect(iosSupportsWebPush([16, 4])).toBe(true);
    expect(iosSupportsWebPush([17, 0])).toBe(true);
    expect(iosSupportsWebPush(null)).toBe(false);
  });
});

describe("which install path to offer", () => {
  const device = (userAgent: string, standalone = false) =>
    describeDevice({ userAgent, maxTouchPoints: 5, standalone });

  it("offers nothing to install once the app runs from the Home Screen", () => {
    expect(installRouteFor(device(UA.iphoneSafari, true), false, false)).toBe(
      "installed",
    );
    expect(installRouteFor(device(UA.android), true, true)).toBe("installed");
  });

  it("shows the Share guide only in iOS Safari, and points other iOS browsers at Safari", () => {
    expect(installRouteFor(device(UA.iphoneSafari), false, false)).toBe("ios-safari");
    expect(installRouteFor(device(UA.iphoneChrome), false, false)).toBe("ios-other");
    expect(installRouteFor(device(UA.iphoneFacebook), false, false)).toBe("ios-other");
  });

  it("offers the browser's own prompt on Android only once the browser hands it over", () => {
    expect(installRouteFor(device(UA.android), true, false)).toBe("prompt");
    expect(installRouteFor(device(UA.android), false, false)).toBe("none");
  });
});
