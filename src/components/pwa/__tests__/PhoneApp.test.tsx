// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "shop_1" } }),
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, getWebPushPublicKey: vi.fn(async () => "key") };
});

import {
  inviteKindFor,
  PhoneAppInvite,
  PhoneAppSetup,
  pushStepCopy,
} from "@/components/pwa/PhoneApp";
import { TakePhotoButton } from "@/components/ui/TakePhotoButton";
import type { DeviceKind } from "@/lib/pwa/install";
import { PHONE_APP_INVITE_KEY } from "@/lib/pwa/usePhoneApp";

vi.stubGlobal("React", React);

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

function asPhone(userAgent: string, { standalone = false, coarse = true } = {}) {
  Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
  window.matchMedia = vi.fn((query: string) => ({
    matches:
      (query === "(display-mode: standalone)" && standalone) ||
      (query === "(pointer: coarse)" && coarse),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const iphone: DeviceKind = {
  ios: true,
  iosSafari: true,
  iosVersion: [18, 5],
  android: false,
  standalone: false,
};

describe("the Desk invitation", () => {
  it("invites a phone to install first, then to turn on notifications", () => {
    expect(inviteKindFor(iphone, "ios-safari", "needs-install", new Set())).toBe(
      "install",
    );
    expect(
      inviteKindFor({ ...iphone, standalone: true }, "installed", "ask", new Set()),
    ).toBe("push");
    expect(
      inviteKindFor(iphone, "ios-safari", "needs-install", new Set(["install"])),
    ).toBeNull();
  });

  it("never invites a desktop, or once notifications are on", () => {
    const desktop = { ...iphone, ios: false, iosSafari: false, iosVersion: null };
    expect(inviteKindFor(desktop, "prompt", "ask", new Set())).toBeNull();
    expect(
      inviteKindFor({ ...iphone, standalone: true }, "installed", "on", new Set()),
    ).toBeNull();
  });

  it("remembers Not now", async () => {
    asPhone(IPHONE);
    render(<PhoneAppInvite />);
    expect(await screen.findByText("Add GRIDGO to your Home Screen")).toBeVisible();
    expect(screen.getByText("Show me how").closest("a")).toHaveAttribute(
      "href",
      "/supplier/phone-app",
    );
    screen.getByRole("button", { name: "Not now" }).click();
    await waitFor(() =>
      expect(
        screen.queryByText("Add GRIDGO to your Home Screen"),
      ).not.toBeInTheDocument(),
    );
    expect(window.localStorage.getItem(PHONE_APP_INVITE_KEY)).toBe("install");
  });
});

describe("the phone app page", () => {
  it("walks an iPhone in Safari through Share, Add to Home Screen, and says notifications come after", async () => {
    asPhone(IPHONE);
    render(<PhoneAppSetup />);
    expect(screen.getByText(/Tap Share/)).toBeVisible();
    expect(screen.getByText(/Scroll down and tap Add to Home Screen/)).toBeVisible();
    expect(await screen.findByText("Add the app first")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Turn on notifications/ }),
    ).not.toBeInTheDocument();
  });

  it("offers Turn on notifications inside the installed iPhone app", async () => {
    asPhone(IPHONE, { standalone: true });
    vi.stubGlobal(
      "Notification",
      Object.assign(function Notification() {}, {
        permission: "default",
        requestPermission: vi.fn(),
      }),
    );
    vi.stubGlobal("PushManager", function PushManager() {});
    Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
    render(<PhoneAppSetup />);
    expect(screen.getByText("Added")).toBeVisible();
    expect(
      await screen.findByRole("button", { name: /Turn on notifications/ }),
    ).toBeVisible();
    expect(screen.queryByText(/Tap Share/)).not.toBeInTheDocument();
    vi.unstubAllGlobals();
    vi.stubGlobal("React", React);
  });

  it("says where to unblock notifications on each phone", () => {
    expect(pushStepCopy("blocked", { ...iphone, standalone: true }).body).toMatch(
      /Settings → Notifications → GRIDGO Supplier/,
    );
    expect(
      pushStepCopy("blocked", { ...iphone, ios: false, iosSafari: false, android: true })
        .body,
    ).toMatch(/Permissions → Notifications → Allow/);
    expect(pushStepCopy("ios-too-old", iphone).body).toMatch(/iOS 16\.4/);
  });

  it("says phone on a phone and browser on a computer", () => {
    expect(pushStepCopy("on", iphone).body).toMatch(/come to this phone/);
    expect(pushStepCopy("on", { ...iphone, ios: false, iosSafari: false }).body).toMatch(
      /come to this browser/,
    );
  });
});

describe("Take photo", () => {
  it("opens the rear camera on a phone", () => {
    asPhone(IPHONE);
    const onFile = vi.fn();
    render(<TakePhotoButton onFile={onFile} inputLabel="Take a progress photo" />);
    expect(screen.getByRole("button", { name: "Take photo" })).toBeVisible();
    const input = screen.getByLabelText("Take a progress photo");
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).toHaveAttribute("capture", "environment");
  });

  it("stays out of the way on a desktop, where it would only repeat the file picker", () => {
    asPhone("Mozilla/5.0 (X11; Linux x86_64)", { coarse: false });
    render(<TakePhotoButton onFile={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Take photo" })).not.toBeInTheDocument();
  });
});
