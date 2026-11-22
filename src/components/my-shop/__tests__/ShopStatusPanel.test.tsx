// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShopCard } from "@/components/my-shop/ShopCard";
import { ShopStatusPanel } from "@/components/my-shop/ShopStatusPanel";
import { normalizeMyShopStatus, type MyShopStatus } from "@/lib/my-shop-status";

vi.stubGlobal("React", React);
// Base UI's switch dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

const NOW = new Date("2026-11-22T02:00:00Z");

function status(over: Record<string, unknown> = {}): MyShopStatus {
  return normalizeMyShopStatus({
    version: 3,
    shopName: "Test Print Shop",
    hours: { temporarilyClosed: false, isOpenNow: true, schedule: { week: [{ weekday: 0, opensMinute: 480, closesMinute: 1080 }] } },
    todayHours: [{ opensMinute: 480, closesMinute: 1080 }],
    isOpenNow: true,
    expressEnabled: true,
    nightJobs: "off",
    printerDemandPings: false,
    pausedUntil: null,
    ...over,
  })!;
}

afterEach(cleanup);

function panel(props: Partial<React.ComponentProps<typeof ShopStatusPanel>> = {}) {
  const onSave = vi.fn();
  render(
    <ShopStatusPanel
      status={status()}
      loading={false}
      canEdit
      canEditHours
      busy={false}
      message={null}
      payoutLine="Wallet ••4821"
      onSave={onSave}
      now={NOW}
      {...props}
    />,
  );
  return onSave;
}

describe("Shop status panel", () => {
  it("lets the Owner switch Express, night jobs, pings and pause", async () => {
    const onSave = panel();
    const region = screen.getByRole("region", { name: "Shop status" });
    await userEvent.click(within(region).getByRole("switch", { name: "Express jobs" }));
    expect(onSave).toHaveBeenLastCalledWith({ expressEnabled: false });
    await userEvent.click(within(region).getByRole("switch", { name: "Night jobs" }));
    expect(onSave).toHaveBeenLastCalledWith({ nightJobs: "until_21" });
    await userEvent.click(within(region).getByRole("switch", { name: /Ping me/ }));
    expect(onSave).toHaveBeenLastCalledWith({ printerDemandPings: true });
    await userEvent.click(within(region).getByRole("button", { name: "Rest of today" }));
    expect(onSave).toHaveBeenLastCalledWith({ pause: "today" });
    expect(within(region).getByRole("link", { name: /Where you get paid/ })).toHaveAttribute(
      "href",
      "/supplier/payout-account",
    );
  });

  it("picks the night end time and resumes a pause", async () => {
    const onSave = panel({ status: status({ nightJobs: "until_21", pausedUntil: "2026-11-22T03:00:00Z" }) });
    await userEvent.click(screen.getByRole("button", { name: "11 PM" }));
    expect(onSave).toHaveBeenLastCalledWith({ nightJobs: "until_23" });
    expect(screen.getByText("Paused until 11 AM")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Resume now" }));
    expect(onSave).toHaveBeenLastCalledWith({ pause: null });
  });

  it("is read-only for Staff and Managers, with no payout row", () => {
    const onSave = panel({ canEdit: false, canEditHours: false, payoutLine: null });
    expect(screen.getByText("Only the shop owner can change these.")).toBeVisible();
    for (const control of screen.getAllByRole("switch")) expect(control).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "1 hour" })).toBeDisabled();
    expect(screen.queryByText("Where you get paid")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Hours/ })).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("gives a Manager the hours link only", () => {
    panel({ canEdit: false, canEditHours: true, payoutLine: null });
    expect(screen.getByRole("link", { name: /Hours/ })).toHaveAttribute("href", "/supplier/shop-hours");
  });
});

describe("Shop card sign", () => {
  it("asks before the Owner closes an open shop", async () => {
    const onSave = vi.fn();
    render(
      <ShopCard name="Test Print Shop" status={status()} canEdit canEditHours busy={false} onSave={onSave} now={NOW} />,
    );
    expect(screen.getByText("Express on")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /^Open\. 8 AM – 6 PM\. Close the shop/ }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close the shop" }));
    expect(onSave).toHaveBeenCalledWith({ temporarilyClosed: true });
  });

  it("is a plain sign for Staff", () => {
    render(
      <ShopCard name="Test Print Shop" status={status()} canEdit={false} canEditHours={false} busy={false} onSave={vi.fn()} now={NOW} />,
    );
    expect(screen.getByTestId("shop-sign")).toHaveTextContent("OPEN");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
