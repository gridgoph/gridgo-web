"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, Copy, EllipsisVertical, Share, SquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import type { DeviceKind, InstallRoute } from "@/lib/pwa/install";
import {
  PHONE_APP_INVITE_KEY,
  usePhoneApp,
  type PhoneAppControl,
} from "@/lib/pwa/usePhoneApp";
import type { WebPushStatus } from "@/lib/pwa/webPush";
import { cn } from "@/lib/utils";

/**
 * The shop's phone setup: add the supplier app to the Home Screen, then turn
 * on notifications. Two steps in that order, because on iPhone the second
 * only exists inside the first. `/supplier/phone-app` shows both; the Desk
 * invites once (`PhoneAppInvite`) and remembers "Not now" per step.
 */

export const PHONE_APP_HREF = "/supplier/phone-app";
export const APP_NAME = "GRIDGO Supplier";

type Chip = { tone: StatusTone; label: string; icon: StatusIconName };

/** "this phone" on a phone; a desktop shop is turning it on for a browser. */
export function deviceNoun(device: DeviceKind | null): "phone" | "browser" {
  return device && (device.ios || device.android) ? "phone" : "browser";
}

/* ----------------------------------------------------------------------------
   Copy
   ------------------------------------------------------------------------- */

export function installChip(route: InstallRoute): Chip | null {
  if (route === "installed")
    return { tone: "success", label: "Added", icon: "circle-check" };
  return null;
}

type PushCopy = {
  chip: Chip;
  body: string;
  action: "turn-on" | "turn-off" | null;
};

export function pushStepCopy(status: WebPushStatus, device: DeviceKind | null): PushCopy {
  switch (status) {
    case "on":
      return {
        chip: { tone: "success", label: "On", icon: "circle-check" },
        body: `New jobs and order updates come to this ${deviceNoun(device)}, even with GRIDGO closed.`,
        action: "turn-off",
      };
    case "ask":
    case "off":
      return {
        chip: { tone: "neutral", label: "Off", icon: "circle-dashed" },
        body: "Get new jobs and order updates on your lock screen, even with GRIDGO closed.",
        action: "turn-on",
      };
    case "blocked":
      return {
        chip: { tone: "error", label: "Blocked", icon: "ban" },
        body: device?.ios
          ? `Notifications are blocked for this app. Turn them on in Settings → Notifications → ${APP_NAME}, then come back.`
          : device?.android
            ? device.standalone
              ? "Notifications are blocked for this app. Press and hold the GRIDGO icon, tap App info → Notifications, and allow them."
              : "Notifications are blocked for this site. Tap the icon beside the address, then Permissions → Notifications → Allow."
            : "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
        action: null,
      };
    case "needs-install":
      return {
        chip: { tone: "neutral", label: "Add the app first", icon: "circle-dashed" },
        body: "On iPhone, notifications only work in the app you open from your Home Screen. Do step 1, open the app, and turn them on there.",
        action: null,
      };
    case "ios-too-old":
      return {
        chip: { tone: "warning", label: "Update iOS", icon: "triangle-alert" },
        body: "Phone notifications need iOS 16.4 or later. Update in Settings → General → Software Update. The bell in GRIDGO still shows every update.",
        action: null,
      };
    default:
      return {
        chip: { tone: "neutral", label: "Not in this browser", icon: "circle-help" },
        body: "This browser can't show phone notifications. Use Chrome on Android, or the app from your Home Screen on iPhone. The bell in GRIDGO still shows every update.",
        action: null,
      };
  }
}

/* ----------------------------------------------------------------------------
   Pieces
   ------------------------------------------------------------------------- */

/** What the shop will find on its Home Screen: the real icon and name. */
export function HomeScreenTile({ className }: { className?: string }) {
  return (
    <figure
      aria-hidden
      className={cn(
        "bg-surface-variant m-0 flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-card px-2 py-3",
        className,
      )}
    >
      {/* iOS draws its own corner mask; this is the same 22% curve. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/pwa/apple-touch-icon.png"
        alt=""
        width={56}
        height={56}
        className="size-14 rounded-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.18)]"
      />
      <figcaption className="text-caption text-text-primary max-w-full text-center">
        {APP_NAME}
      </figcaption>
    </figure>
  );
}

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-outline bg-surface text-text-primary mx-1 inline-flex size-6 items-center justify-center rounded-[6px] border align-middle">
      {children}
    </span>
  );
}

/** Safari's own path. iOS 26 keeps Share inside the ••• button. */
export function IosAddToHomeScreen() {
  return (
    <ol className="text-body text-text-primary m-0 flex list-none flex-col gap-3 p-0">
      <IosStep n={1}>
        Tap Share
        <Glyph>
          <Share size={14} aria-hidden />
        </Glyph>
        in Safari&apos;s toolbar. On newer iPhones it&apos;s inside the
        <Glyph>
          <span aria-hidden className="text-caption leading-none">
            •••
          </span>
        </Glyph>
        button.
      </IosStep>
      <IosStep n={2}>
        Scroll down and tap Add to Home Screen
        <Glyph>
          <SquarePlus size={14} aria-hidden />
        </Glyph>
        . If you see Open as Web App, leave it on.
      </IosStep>
      <IosStep n={3} after={<HomeScreenTile className="mt-2" />}>
        Tap Add, then open {APP_NAME} from your Home Screen. It looks like this:
      </IosStep>
    </ol>
  );
}

function IosStep({
  n,
  children,
  after,
}: {
  n: number;
  children: React.ReactNode;
  after?: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
      <span
        className="text-body text-text-muted leading-7 tabular-nums"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {n}.
      </span>
      <div className="flex flex-col items-start">
        <p className="m-0 leading-7">{children}</p>
        {after}
      </div>
    </li>
  );
}

function CopyLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="text-caption bg-surface-variant text-text-primary rounded-field px-2 py-1 break-all">
        {href}
      </code>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(href)
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
      >
        <Copy data-icon="inline-start" aria-hidden />
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}

function usePageUrl(): string {
  const [url, setUrl] = useState(PHONE_APP_HREF);
  useEffect(() => {
    setUrl(`${window.location.origin}${PHONE_APP_HREF}`);
  }, []);
  return url;
}

/* ----------------------------------------------------------------------------
   The page: /supplier/phone-app
   ------------------------------------------------------------------------- */

function StepHeading({
  n,
  id,
  title,
  chip,
}: {
  n: number;
  id: string;
  title: string;
  chip: Chip | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 id={id} className="text-h3 text-text-primary m-0">
        <span className="text-text-muted mr-2 tabular-nums">{n}</span>
        {title}
      </h2>
      {chip ? <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} /> : null}
    </div>
  );
}

function InstallStep({
  control,
  primary,
}: {
  control: PhoneAppControl;
  primary: boolean;
}) {
  const { install, device, installing, installApp } = control;
  const url = usePageUrl();
  return (
    <section aria-labelledby="phone-app-install" className="gg-card flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <StepHeading
            n={1}
            id="phone-app-install"
            title="Add GRIDGO to your Home Screen"
            chip={installChip(install)}
          />
          <p className="text-body text-text-secondary m-0 max-w-prose">
            {install === "installed"
              ? `You're in the ${APP_NAME} app. Open it from your Home Screen from now on.`
              : "It opens full screen like an app, without the browser around it."}
          </p>
        </div>
        {install === "ios-safari" ? null : <HomeScreenTile className="hidden sm:flex" />}
      </div>

      {install === "prompt" ? (
        <div className="flex items-center gap-3">
          <HomeScreenTile className="sm:hidden" />
          <Button
            variant={primary ? "primary" : "outline"}
            disabled={installing}
            onClick={() => void installApp()}
          >
            {installing ? "Installing…" : "Install app"}
          </Button>
        </div>
      ) : null}

      {install === "ios-safari" ? <IosAddToHomeScreen /> : null}

      {install === "ios-other" ? (
        <div className="flex flex-col gap-2">
          <p className="text-body text-text-primary m-0">
            On iPhone, apps are added from Safari. Open this page in Safari:
          </p>
          <CopyLink href={url} />
        </div>
      ) : null}

      {install === "none" ? (
        device?.android ? (
          <p className="text-body text-text-primary m-0 max-w-prose">
            Open your browser&apos;s menu
            <Glyph>
              <EllipsisVertical size={14} aria-hidden />
            </Glyph>
            and tap Install app or Add to Home screen.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-body text-text-primary m-0">
              Open this page on your phone:
            </p>
            <CopyLink href={url} />
          </div>
        )
      ) : null}
    </section>
  );
}

function PushStep({ control, primary }: { control: PhoneAppControl; primary: boolean }) {
  const { push, device, pushBusy, pushError, turnOnPush, turnOffPush } = control;
  const copy = push ? pushStepCopy(push, device) : null;
  return (
    <section aria-labelledby="phone-app-push" className="gg-card flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <StepHeading
          n={2}
          id="phone-app-push"
          title="Turn on notifications"
          chip={copy?.chip ?? null}
        />
        <p className="text-body text-text-secondary m-0 max-w-prose" aria-live="polite">
          {copy ? copy.body : "Checking this browser…"}
        </p>
      </div>
      {copy?.action === "turn-on" ? (
        <div className="flex flex-col gap-2">
          <Button
            className="self-start"
            variant={primary ? "primary" : "outline"}
            disabled={pushBusy}
            onClick={() => void turnOnPush()}
          >
            <BellRing data-icon="inline-start" aria-hidden />
            {pushBusy ? "Turning on…" : "Turn on notifications"}
          </Button>
          {push === "ask" ? (
            <p className="text-caption text-text-muted m-0">
              Your {deviceNoun(device)} will ask once. Choose Allow.
            </p>
          ) : null}
        </div>
      ) : null}
      {copy?.action === "turn-off" ? (
        <Button
          className="self-start"
          variant="ghost"
          disabled={pushBusy}
          onClick={() => void turnOffPush()}
        >
          {pushBusy ? "Turning off…" : `Turn off on this ${deviceNoun(device)}`}
        </Button>
      ) : null}
      {pushError ? (
        <p className="text-body text-error m-0" role="alert">
          {pushError}
        </p>
      ) : null}
    </section>
  );
}

export function PhoneAppSetup() {
  const control = usePhoneApp();
  // One yellow button: the step the shop is on.
  const installPending = control.install === "prompt";
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Use GRIDGO on your phone like an app, and hear about new jobs the moment they
        arrive. Works on iPhone and Android, with nothing to download from a store.
      </p>
      <InstallStep control={control} primary={installPending} />
      <PushStep control={control} primary={!installPending} />
    </div>
  );
}

/* ----------------------------------------------------------------------------
   The Desk invitation
   ------------------------------------------------------------------------- */

export type InviteKind = "install" | "push";

/**
 * Which invitation the Desk shows on this phone, if any. Phones only: a
 * desktop shop has the bell, the chime and desktop alerts already.
 */
export function inviteKindFor(
  device: DeviceKind | null,
  install: InstallRoute,
  push: WebPushStatus | null,
  dismissed: ReadonlySet<InviteKind>,
): InviteKind | null {
  if (!device || !(device.ios || device.android)) return null;
  const installable =
    install === "prompt" || install === "ios-safari" || install === "ios-other";
  if (installable && !dismissed.has("install")) return "install";
  if ((push === "ask" || push === "off") && !dismissed.has("push")) return "push";
  return null;
}

function readDismissed(): Set<InviteKind> {
  try {
    const value = window.localStorage.getItem(PHONE_APP_INVITE_KEY) ?? "";
    return new Set(
      value
        .split(",")
        .filter((kind): kind is InviteKind => kind === "install" || kind === "push"),
    );
  } catch {
    return new Set();
  }
}

function writeDismissed(kinds: Set<InviteKind>): void {
  try {
    window.localStorage.setItem(PHONE_APP_INVITE_KEY, [...kinds].join(","));
  } catch {
    // Private mode: "Not now" lasts for this page only.
  }
}

export function PhoneAppInvite() {
  const control = usePhoneApp();
  const [dismissed, setDismissed] = useState<Set<InviteKind> | null>(null);
  useEffect(() => setDismissed(readDismissed()), []);
  if (!dismissed) return null;
  const kind = inviteKindFor(control.device, control.install, control.push, dismissed);
  if (!kind) return null;

  const notNow = () => {
    const next = new Set(dismissed);
    next.add(kind);
    writeDismissed(next);
    setDismissed(next);
  };

  return (
    <section
      aria-labelledby="phone-app-invite"
      data-slot="phone-app-invite"
      className="gg-card flex items-start gap-3"
    >
      {kind === "install" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/pwa/apple-touch-icon.png"
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-[10px]"
        />
      ) : (
        <span
          aria-hidden
          className="border-outline text-text-primary flex size-11 shrink-0 items-center justify-center rounded-[10px] border"
        >
          <BellRing size={18} strokeWidth={2} />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <h2
            id="phone-app-invite"
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-bold)" }}
          >
            {kind === "install"
              ? "Add GRIDGO to your Home Screen"
              : "Turn on notifications"}
          </h2>
          <p className="text-caption text-text-secondary m-0">
            {kind === "install"
              ? control.device?.ios
                ? "Open GRIDGO like an app. On iPhone, that's also how new-job notifications reach you."
                : "Open GRIDGO like an app, straight from your Home Screen."
              : "New jobs and order updates on your lock screen, even with GRIDGO closed."}
          </p>
        </div>
        {control.pushError && kind === "push" ? (
          <p className="text-caption text-error m-0" role="alert">
            {control.pushError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {kind === "install" && control.install === "prompt" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={control.installing}
              onClick={() => void control.installApp()}
            >
              Install app
            </Button>
          ) : kind === "install" ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={PHONE_APP_HREF} />}
            >
              Show me how
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={control.pushBusy}
              onClick={() => void control.turnOnPush()}
            >
              {control.pushBusy ? "Turning on…" : "Turn on notifications"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={notNow}>
            Not now
          </Button>
        </div>
      </div>
    </section>
  );
}
