/**
 * The supplier web app on a phone: which install path this browser has.
 *
 * - Android (and desktop) Chrome / Edge / Samsung Internet raise
 *   `beforeinstallprompt`. The portal holds that event and offers its own
 *   "Install app" button, so installing is one tap from the Desk, never a
 *   browser banner over someone's work.
 * - iPhone and iPad have no install event. Safari installs through Share →
 *   Add to Home Screen, so the portal shows that guide, and only in Safari:
 *   other iOS browsers get one line pointing at Safari instead.
 * - Once the app is open from the Home Screen (`display-mode: standalone`)
 *   there is nothing left to install.
 *
 * Web Push on iOS needs both iOS 16.4+ and the installed app; a Safari tab
 * cannot subscribe. `src/lib/pwa/webPush.ts` reads that from here.
 */

export const INSTALL_READY_EVENT = "gridgo-install-ready";

/**
 * Inlined in the root layout's head, before any React code: Chrome may fire
 * `beforeinstallprompt` before the page hydrates, and a missed event does not
 * come back until the next full page load. Only the supplier tree links the
 * manifest, so other trees never see the event.
 */
export const INSTALL_CAPTURE_SCRIPT = `(function(){try{window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__gridgoInstallPrompt=e;window.dispatchEvent(new Event(${JSON.stringify(INSTALL_READY_EVENT)}))});window.addEventListener("appinstalled",function(){window.__gridgoInstallPrompt=null;window.__gridgoInstalled=true;window.dispatchEvent(new Event(${JSON.stringify(INSTALL_READY_EVENT)}))})}catch(e){}})();`;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallWindow = Window & {
  __gridgoInstallPrompt?: BeforeInstallPromptEvent | null;
  __gridgoInstalled?: boolean;
};

export type DeviceFacts = {
  userAgent: string;
  maxTouchPoints: number;
  /** `display-mode: standalone` or iOS `navigator.standalone`. */
  standalone: boolean;
};

export type DeviceKind = {
  ios: boolean;
  /** Safari itself, not Chrome/Firefox/Edge or an in-app browser on iOS. */
  iosSafari: boolean;
  /** [major, minor] on iOS, else null. */
  iosVersion: [number, number] | null;
  android: boolean;
  standalone: boolean;
};

/** iPadOS 13+ reports a Mac; a Mac with a touch screen is an iPad. */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

export function iosVersionOf(userAgent: string): [number, number] | null {
  const os = /OS (\d+)[_.](\d+)/.exec(userAgent);
  if (os && /iPhone|iPad|iPod/.test(userAgent)) return [Number(os[1]), Number(os[2])];
  // iPadOS in desktop mode carries only Safari's own version, which tracks iOS.
  const safari = /Version\/(\d+)\.(\d+)/.exec(userAgent);
  return safari ? [Number(safari[1]), Number(safari[2])] : null;
}

/** Other iOS browsers and in-app web views carry their own token. */
const IOS_NOT_SAFARI =
  /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\/|FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|Twitter/;

export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  if (!isIos(userAgent, maxTouchPoints)) return false;
  if (IOS_NOT_SAFARI.test(userAgent)) return false;
  return /Safari\//.test(userAgent) && /Version\//.test(userAgent);
}

export function describeDevice(facts: DeviceFacts): DeviceKind {
  const ios = isIos(facts.userAgent, facts.maxTouchPoints);
  return {
    ios,
    iosSafari: isIosSafari(facts.userAgent, facts.maxTouchPoints),
    iosVersion: ios ? iosVersionOf(facts.userAgent) : null,
    android: /Android/.test(facts.userAgent),
    standalone: facts.standalone,
  };
}

/** Web Push reached iOS home screen apps in 16.4. */
export function iosSupportsWebPush(version: [number, number] | null): boolean {
  if (!version) return false;
  const [major, minor] = version;
  return major > 16 || (major === 16 && minor >= 4);
}

export function readDeviceFacts(): DeviceFacts {
  if (typeof window === "undefined") {
    return { userAgent: "", maxTouchPoints: 0, standalone: false };
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  let standalone = nav.standalone === true;
  try {
    standalone ||= window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    // Very old browsers: treat as a tab.
  }
  return {
    userAgent: nav.userAgent ?? "",
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone,
  };
}

export function readDevice(): DeviceKind {
  return describeDevice(readDeviceFacts());
}

/**
 * - `installed`: running from the Home Screen (or just installed here).
 * - `prompt`: the browser handed over its install prompt; one tap installs.
 * - `ios-safari`: show Share → Add to Home Screen.
 * - `ios-other`: an iOS browser that is not Safari; point at Safari.
 * - `none`: nothing to offer (a desktop browser, or Android before the browser
 *   offers installing; its own menu still has "Install app").
 */
export type InstallRoute = "installed" | "prompt" | "ios-safari" | "ios-other" | "none";

export function installRouteFor(
  device: DeviceKind,
  promptReady: boolean,
  justInstalled: boolean,
): InstallRoute {
  if (device.standalone || justInstalled) return "installed";
  if (device.ios) return device.iosSafari ? "ios-safari" : "ios-other";
  return promptReady ? "prompt" : "none";
}

function installWindow(): InstallWindow | null {
  return typeof window === "undefined" ? null : (window as InstallWindow);
}

export function readInstallRoute(): InstallRoute {
  const win = installWindow();
  return installRouteFor(
    readDevice(),
    Boolean(win?.__gridgoInstallPrompt),
    Boolean(win?.__gridgoInstalled),
  );
}

let bound = false;

/** Client navigations into the tree after load still hear the event. */
function bindLateCapture(win: InstallWindow): void {
  if (bound) return;
  bound = true;
  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    win.__gridgoInstallPrompt = event as BeforeInstallPromptEvent;
    win.dispatchEvent(new Event(INSTALL_READY_EVENT));
  });
  win.addEventListener("appinstalled", () => {
    win.__gridgoInstallPrompt = null;
    win.__gridgoInstalled = true;
    win.dispatchEvent(new Event(INSTALL_READY_EVENT));
  });
}

export function subscribeInstall(listener: () => void): () => void {
  const win = installWindow();
  if (!win) return () => undefined;
  bindLateCapture(win);
  win.addEventListener(INSTALL_READY_EVENT, listener);
  let query: MediaQueryList | null = null;
  try {
    query = win.matchMedia("(display-mode: standalone)");
    query.addEventListener?.("change", listener);
  } catch {
    query = null;
  }
  return () => {
    win.removeEventListener(INSTALL_READY_EVENT, listener);
    query?.removeEventListener?.("change", listener);
  };
}

/** "Install app". The browser's own dialog decides; the event is single-use. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const win = installWindow();
  const event = win?.__gridgoInstallPrompt;
  if (!win || !event) return "unavailable";
  win.__gridgoInstallPrompt = null;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") win.__gridgoInstalled = true;
    return outcome;
  } catch {
    return "unavailable";
  } finally {
    win.dispatchEvent(new Event(INSTALL_READY_EVENT));
  }
}
