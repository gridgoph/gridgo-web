// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DesktopAlertsPrompt, DesktopAlertsRow } from "@/components/shell/DesktopAlerts";
import type { Role } from "@/lib/api/types";
import { resetDesktopAlertWorkerForTests } from "@/lib/live/desktopAlerts";

vi.stubGlobal("React", React);

function installNotification(
  permission: NotificationPermission,
  answer: NotificationPermission = permission,
) {
  const created: string[] = [];
  class FakeNotification {
    static permission = permission;
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = answer;
      return answer;
    });
    onclick: (() => void) | null = null;
    close = vi.fn();
    constructor(title: string) {
      created.push(title);
    }
  }
  vi.stubGlobal("Notification", FakeNotification);
  return { api: FakeNotification, created };
}

function Desk({ role = "ops_admin" }: { role?: Role }) {
  return (
    <>
      <DesktopAlertsPrompt role={role} />
      <DesktopAlertsRow role={role} />
    </>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetDesktopAlertWorkerForTests();
  vi.unstubAllGlobals();
  vi.stubGlobal("React", React);
});

describe("Desktop alerts on the Desk", () => {
  it("invites once without asking the browser on render", () => {
    const { api } = installNotification("default");
    render(<Desk />);
    expect(screen.getByText("Get desktop alerts")).toBeInTheDocument();
    expect(
      screen.getByText(
        "See new slips on your screen while GRIDGO is in another tab or window.",
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-slot="desk-alerts"]')).toBeNull();
    expect(api.requestPermission).not.toHaveBeenCalled();
  });

  it("speaks to suppliers about jobs, not slips", () => {
    installNotification("default");
    render(<Desk role="supplier" />);
    expect(
      screen.getByText(
        "See new jobs and order updates on your screen while GRIDGO is in another tab or window.",
      ),
    ).toBeInTheDocument();
  });

  it("folds into the footer line after Not now, and stays folded", async () => {
    const user = userEvent.setup();
    const { api } = installNotification("default");
    const { unmount } = render(<Desk />);
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Get desktop alerts")).toBeNull();
    const row = document.querySelector('[data-slot="desk-alerts"]');
    expect(row).toHaveAttribute("data-state", "ask");
    expect(screen.getByText("Desktop alerts off")).toBeInTheDocument();
    expect(api.requestPermission).not.toHaveBeenCalled();
    unmount();
    render(<Desk />);
    expect(screen.queryByText("Get desktop alerts")).toBeNull();
  });

  it("asks the browser on Turn on, then confirms with one alert", async () => {
    const user = userEvent.setup();
    const { api, created } = installNotification("default", "granted");
    render(<Desk />);
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(api.requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByText("Desktop alerts on")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("For new slips while GRIDGO is in another tab or window"),
    ).toBeInTheDocument();
    await waitFor(() => expect(created).toEqual(["Desktop alerts are on"]));
  });

  it("turns off and back on without asking a granted browser again", async () => {
    const user = userEvent.setup();
    const { api, created } = installNotification("granted");
    render(<Desk />);
    expect(screen.queryByText("Get desktop alerts")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    expect(screen.getByText("Desktop alerts off")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() =>
      expect(screen.getByText("Desktop alerts on")).toBeInTheDocument(),
    );
    expect(api.requestPermission).not.toHaveBeenCalled();
    // Re-enabling is not a first grant, so no confirmation alert.
    expect(created).toEqual([]);
  });

  it("explains a blocked browser and offers no button that cannot work", () => {
    installNotification("denied");
    render(<Desk />);
    expect(screen.queryByText("Get desktop alerts")).toBeNull();
    expect(screen.getByText("Desktop alerts blocked")).toBeInTheDocument();
    expect(
      screen.getByText("Allow notifications for this site in your browser settings"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("degrades to a plain line where the browser has no notifications", () => {
    vi.stubGlobal("Notification", undefined);
    render(<Desk />);
    expect(screen.queryByText("Get desktop alerts")).toBeNull();
    expect(screen.getByText("Desktop alerts unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
