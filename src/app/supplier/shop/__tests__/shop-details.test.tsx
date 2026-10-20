// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { SupplierProfile } from "@/lib/api/client";

const api = vi.hoisted(() => ({
  getSupplierProfile: vi.fn(),
  updateSupplierProfile: vi.fn(),
  getMyShopHours: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  ...api,
}));

import SupplierShopPage from "@/app/supplier/shop/page";

const profile: SupplierProfile = {
  userId: "shop",
  shopName: "Ana Prints",
  contactName: "Ana",
  phone: "+639171234567",
  email: "ana@example.com",
  shop: { lat: 14.6, lng: 121, label: "Counter" },
  version: 2,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("locks the fields while a save is in flight, so nothing typed meanwhile is overwritten", async () => {
  const user = userEvent.setup();
  api.getSupplierProfile.mockResolvedValue(profile);
  api.getMyShopHours.mockResolvedValue(null);
  let answer!: (next: SupplierProfile) => void;
  api.updateSupplierProfile.mockReturnValue(
    new Promise<SupplierProfile>((resolve) => {
      answer = resolve;
    }),
  );
  render(<SupplierShopPage />);
  const name = await screen.findByLabelText("Shop name");
  await user.clear(name);
  await user.type(name, "First name");
  await user.click(screen.getByRole("button", { name: "Save shop details" }));

  expect(api.updateSupplierProfile).toHaveBeenCalledWith(2, { shopName: "First name" });
  for (const label of ["Shop name", "Contact", "Phone", "Latitude", "Longitude"]) {
    expect(screen.getByLabelText(label)).toBeDisabled();
  }

  await act(async () => answer({ ...profile, shopName: "First name", version: 3 }));
  expect(await screen.findByText(/Saved\./)).toBeInTheDocument();
  expect(screen.getByLabelText("Shop name")).toBeEnabled();
  expect(screen.getByLabelText("Shop name")).toHaveValue("First name");
});
