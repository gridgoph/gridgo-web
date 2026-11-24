// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => params.current }));
vi.mock("@/lib/useSupplierDesktop", () => ({ useSupplierDesktop: () => true }));

const access = vi.hoisted(() => ({ current: { can: { money: true }, manager: false } }));
vi.mock("@/lib/auth/shop-access", () => ({ useShopAccess: () => access.current }));
vi.mock("@/components/shop-verification/useShopVerification", () => ({
  useShopVerification: () => ({ state: { kind: "none" }, reload: vi.fn() }),
}));

const api = vi.hoisted(() => ({
  loadShopSignup: vi.fn(),
  addSamplePhotos: vi.fn(async () => 0),
  attachSignupLogo: vi.fn(async () => false),
}));
vi.mock("@/lib/api/supplier-signup", () => api);

vi.mock("@/components/settings/SupplierPayoutSettings", () => ({
  SupplierPayoutSettings: () => <div data-testid="payout-settings" />,
}));
vi.mock("@/components/shop-team/TeamManager", () => ({ TeamManager: () => <div data-testid="team-manager" /> }));
vi.mock("@/components/supplier-signup/setup/SetupHours", () => ({
  SetupHours: () => <div data-testid="setup-hours" />,
}));
vi.mock("@/components/supplier-signup/setup/JobAlertsCard", () => ({ JobAlertsCard: () => <div data-testid="job-alerts" /> }));
vi.mock("@/components/supplier-signup/setup/OwnerClaimCard", () => ({ OwnerClaimCard: () => <div data-testid="owner-claim" /> }));

const { SetupWizard } = await import("@/components/supplier-signup/SetupWizard");

function shop(nextStep: string) {
  return { status: "ok", signup: { version: 9, supplierId: "shop-1", steps: {}, nextStep }, payoutStatus: null };
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  params.current = new URLSearchParams();
  access.current = { can: { money: true }, manager: false };
  api.loadShopSignup.mockReset();
  api.addSamplePhotos.mockClear();
});
afterEach(cleanup);

describe("/supplier/setup", () => {
  it("resumes at hours right after the shop opens", async () => {
    api.loadShopSignup.mockResolvedValue(shop("hours"));
    render(<SetupWizard />);
    expect(await screen.findByTestId("setup-hours")).toBeInTheDocument();
    expect(screen.getByTestId("mission-count")).toHaveTextContent("4 of 6 done");
  });

  it("shows the Owner where they get paid, with job alerts", async () => {
    api.loadShopSignup.mockResolvedValue(shop("payout"));
    render(<SetupWizard />);
    expect(await screen.findByTestId("payout-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("owner-claim")).not.toBeInTheDocument();
  });

  it("never shows a Manager the payout form: they send the owner the claim link", async () => {
    access.current = { can: { money: false }, manager: true };
    api.loadShopSignup.mockResolvedValue(shop("owner_claim"));
    params.current = new URLSearchParams("step=paid");
    render(<SetupWizard />);
    expect(await screen.findByTestId("owner-claim")).toBeInTheDocument();
    expect(screen.getByTestId("job-alerts")).toBeInTheDocument();
    expect(screen.queryByTestId("payout-settings")).not.toBeInTheDocument();
    expect(screen.getByTestId("mission-paid")).toHaveAttribute("data-state", "waiting");
  });

  it("adds the sample photo to new listings as GRIDGO's last step", async () => {
    api.loadShopSignup.mockResolvedValue(shop("listing_photos"));
    render(<SetupWizard />);
    expect(await screen.findByRole("heading", { name: "Your shop is set up" })).toBeInTheDocument();
    expect(api.addSamplePhotos).toHaveBeenCalledTimes(1);
  });

  it("leaves a shop that never used guided sign-up alone", async () => {
    api.loadShopSignup.mockResolvedValue({ status: "ok", signup: null, payoutStatus: null });
    render(<SetupWizard />);
    expect(await screen.findByText("Nothing to set up here")).toBeInTheDocument();
  });
});
