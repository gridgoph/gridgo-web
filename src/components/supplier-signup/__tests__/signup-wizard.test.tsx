// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GuidedSignup, SignupTerms } from "@/lib/guided-signup";

vi.stubGlobal("React", React);

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const auth = vi.hoisted(() => ({
  current: {
    status: "unmapped" as string,
    memberships: [] as { role: string }[],
    refresh: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  },
}));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => auth.current }));
vi.mock("@/lib/useSupplierDesktop", () => ({ useSupplierDesktop: () => true }));

vi.mock("@clerk/nextjs", () => ({
  SignUp: (props: { forceRedirectUrl?: string }) => (
    <div data-testid="clerk-sign-up-form" data-redirect={props.forceRedirectUrl} />
  ),
  useUser: () => ({ user: { phoneNumbers: [], createPhoneNumber: vi.fn() } }),
  useClerk: () => ({ __unstable__environment: { userSettings: { attributes: { phone_number: { enabled: false } } } } }),
}));
vi.mock("@/components/supplier-signup/PinPicker", () => ({ PinPicker: () => <div data-testid="pin-map" /> }));
vi.mock("@/lib/api/supplier-self", () => ({ listSupplierLegalDocuments: vi.fn(async () => ({ documents: [] })) }));

const api = vi.hoisted(() => ({
  loadGuidedSignup: vi.fn(),
  saveSignupStep: vi.fn(),
  enrollGuidedSupplier: vi.fn(),
}));
vi.mock("@/lib/api/supplier-signup", () => api);

const { SignupWizard } = await import("@/components/supplier-signup/SignupWizard");

const TERMS: SignupTerms = {
  printGroups: ["documents"],
  locationConsentWording: "Test pin wording.",
  payoutConsentWording: "Test payout wording.",
  documentRates: { bwMinor: 300, colourMinor: 1000 },
};
const ELIGIBILITY = { shopKind: "print_shop", registrantRole: "owner", adult: true };
const SHOP = { shopName: "Test Print", contactName: "Test Owner", phone: "+639171234567" };

function draft(nextStep: GuidedSignup["nextStep"], steps: Record<string, unknown>, version = 4): GuidedSignup {
  return { version, supplierId: null, steps: steps as GuidedSignup["steps"], nextStep };
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  window.sessionStorage.clear();
  router.replace.mockReset();
  auth.current = { ...auth.current, status: "unmapped", memberships: [] };
  api.loadGuidedSignup.mockReset();
  api.saveSignupStep.mockReset();
  api.enrollGuidedSupplier.mockReset();
});
afterEach(cleanup);

describe("/signup resume", () => {
  it("asks step 0 before the account, then hands over to Clerk to make it", async () => {
    auth.current = { ...auth.current, status: "signed_out" };
    render(<SignupWizard />);
    expect(await screen.findByRole("heading", { name: "Tell us about you" })).toBeInTheDocument();
    expect(screen.queryByText(/role/i)).not.toBeInTheDocument();
    expect(api.loadGuidedSignup).not.toHaveBeenCalled();
  });

  it("reopens the first unfinished step after leaving mid-way", async () => {
    api.loadGuidedSignup.mockResolvedValue({
      status: "ok",
      signup: draft("location", { eligibility: ELIGIBILITY, shop: SHOP }),
      terms: TERMS,
    });
    render(<SignupWizard />);
    expect(await screen.findByRole("heading", { name: "Pin your shop" })).toBeInTheDocument();
    expect(screen.getByTestId("mission-shop")).toHaveAttribute("data-state", "done");
    expect(screen.getByTestId("mission-pin")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("mission-count")).toHaveTextContent("1 of 6 done");
  });

  it("saves step 0 answered before the account existed and moves on", async () => {
    window.sessionStorage.setItem(
      "gridgo.supplierSignup.v1",
      JSON.stringify({ eligibility: { shopKind: "print_shop", registrantRole: "manager", adult: true } }),
    );
    api.loadGuidedSignup.mockResolvedValue({ status: "ok", signup: draft("eligibility", {}, 1), terms: TERMS });
    api.saveSignupStep.mockResolvedValue({
      status: "ok",
      signup: draft("shop", { eligibility: { ...ELIGIBILITY, registrantRole: "manager" } }, 2),
      terms: TERMS,
    });
    render(<SignupWizard />);
    expect(await screen.findByRole("heading", { name: "Your shop" })).toBeInTheDocument();
    expect(api.saveSignupStep).toHaveBeenCalledWith(1, "eligibility", {
      shopKind: "print_shop",
      registrantRole: "manager",
      adult: true,
    });
    // A manager names the owner's mobile.
    expect(screen.getByTestId("owner-phone")).toBeInTheDocument();
  });

  it("sends a shop that already opened straight on to its setup", async () => {
    api.loadGuidedSignup.mockResolvedValue({
      status: "ok",
      signup: { ...draft("hours", {}), supplierId: "shop-1" },
      terms: TERMS,
    });
    render(<SignupWizard />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/supplier/setup"));
    expect(auth.current.refresh).toHaveBeenCalled();
  });

  it("keeps today's web when the API has no guided sign-up", async () => {
    api.loadGuidedSignup.mockResolvedValue({ status: "not_open_yet" });
    render(<SignupWizard />);
    expect(await screen.findByText("Shop sign-up is not open on the web yet")).toBeInTheDocument();
  });

  it("never turns an Operations or Super Admin account into a shop", async () => {
    auth.current = { ...auth.current, status: "mapped", memberships: [{ role: "ops_admin" }] };
    render(<SignupWizard />);
    expect(await screen.findByText("This account already uses the GRIDGO portal")).toBeInTheDocument();
    expect(api.loadGuidedSignup).not.toHaveBeenCalled();
  });

  it("reads again and retries once when another window saved first", async () => {
    api.loadGuidedSignup
      .mockResolvedValueOnce({ status: "ok", signup: draft("prints", { eligibility: ELIGIBILITY, shop: SHOP, location: {} }, 5), terms: TERMS })
      .mockResolvedValueOnce({ status: "ok", signup: draft("prints", { eligibility: ELIGIBILITY, shop: SHOP, location: {} }, 6), terms: TERMS });
    api.saveSignupStep
      .mockResolvedValueOnce({ status: "stale" })
      .mockResolvedValueOnce({
        status: "ok",
        signup: draft("enroll", { eligibility: ELIGIBILITY, shop: SHOP, location: {}, prints: { groups: ["documents"] } }, 7),
        terms: TERMS,
      });
    render(<SignupWizard />);
    expect(await screen.findByRole("heading", { name: "What you print" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("step-next"));
    expect(await screen.findByRole("heading", { name: "Who takes jobs?" })).toBeInTheDocument();
    expect(api.saveSignupStep).toHaveBeenNthCalledWith(1, 5, "prints", expect.any(Object));
    expect(api.saveSignupStep).toHaveBeenNthCalledWith(2, 6, "prints", expect.any(Object));
  });
});
