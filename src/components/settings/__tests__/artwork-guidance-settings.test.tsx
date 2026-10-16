// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import { deliveryZones } from "@/test/delivery-zones";
import { guidanceSettings, guidanceTaxonomy } from "@/test/artwork-guidance";

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const { getTaxonomy, updateSettings } = vi.hoisted(() => ({
  getTaxonomy: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getTaxonomy,
  updateSettings,
}));
const { ArtworkGuidanceSettings } = await import("@/components/settings/ArtworkGuidanceSettings");

const settings: PlatformSettings = {
  version: 9,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: deliveryZones(),
  artworkGuidance: guidanceSettings(),
};
const card = () => within(screen.getByRole("region", { name: "Artwork guidance" }));
const save = () => card().getByRole("button", { name: "Save artwork guidance" });

beforeEach(() => {
  getTaxonomy.mockResolvedValue(guidanceTaxonomy());
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("lists product types by the catalogue's names, grouped, with what each one uses", async () => {
  render(<ArtworkGuidanceSettings settings={settings} canEdit onSaved={vi.fn()} onConflict={vi.fn()} />);
  const paper = await card().findByRole("group", { name: "Paper and documents" });
  expect(within(paper).getByText("Business cards")).toBeInTheDocument();
  expect(within(paper).getByText(/Uses the default \(300 DPI, expects CMYK\)/)).toBeInTheDocument();
  expect(within(paper).queryByText("Old stickers")).not.toBeInTheDocument();
  const large = card().getByRole("group", { name: "Large format" });
  expect(within(large).getByRole("textbox", { name: "Minimum DPI for Tarpaulins and outdoor banners" })).toHaveValue("100");
  expect(within(large).getByText("Retired")).toBeInTheDocument();
  expect(save()).toBeDisabled();
});

it("saves the whole value with the version and an audited reason", async () => {
  const onSaved = vi.fn();
  updateSettings.mockImplementation(async (input) => ({ ...settings, ...input, version: 10 }));
  render(<ArtworkGuidanceSettings settings={settings} canEdit onSaved={onSaved} onConflict={vi.fn()} />);
  await card().findByText("Business cards");
  fireEvent.change(card().getByRole("textbox", { name: "Minimum DPI for Tarpaulins and outdoor banners" }), {
    target: { value: "120" },
  });
  fireEvent.click(card().getByRole("button", { name: "Set a target for Business cards" }));
  fireEvent.click(
    within(card().getByRole("group", { name: "Colour for Business cards" })).getByRole("button", { name: "RGB accepted" }),
  );
  fireEvent.click(card().getByRole("switch", { name: "Check resolution for Flyers" }));
  expect(card().getByTestId("artwork-guidance-changes")).toHaveTextContent("3 changes to save");
  fireEvent.click(save());
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  const input = updateSettings.mock.calls[0][0];
  expect(input).toEqual({
    expectedVersion: 9,
    artworkGuidance: {
      version: 1,
      default: { minimumDpi: 300, acceptsRgb: false },
      subcategories: {
        flyers: { minimumDpi: null, acceptsRgb: false },
        tarpaulins_outdoor_banners: { minimumDpi: 120, acceptsRgb: false },
        old_banners: { minimumDpi: 100, acceptsRgb: false },
        business_cards: { minimumDpi: 300, acceptsRgb: true },
      },
    },
    reason: expect.stringContaining("Tarpaulins and outdoor banners: 100 DPI, expects CMYK to 120 DPI, expects CMYK"),
  });
  expect(input.reason).toContain("Business cards: default (300 DPI, expects CMYK) to 300 DPI, RGB accepted");
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 10 }));
  expect(await card().findByText(/3 changes apply to new checkouts/)).toBeInTheDocument();
});

it("returns a product type to the default and refuses a number out of range before saving", async () => {
  render(<ArtworkGuidanceSettings settings={settings} canEdit onSaved={vi.fn()} onConflict={vi.fn()} />);
  await card().findByText("Business cards");
  fireEvent.change(card().getByRole("textbox", { name: "Minimum DPI for Flyers" }), { target: { value: "30" } });
  expect(card().getByRole("alert")).toHaveTextContent("Use a whole number from 50 to 1200");
  expect(save()).toBeDisabled();
  fireEvent.click(card().getByRole("button", { name: "Use the default for Flyers" }));
  expect(card().queryByRole("alert")).not.toBeInTheDocument();
  expect(card().getByTestId("artwork-guidance-changes")).toHaveTextContent(
    "Flyers: 300 DPI, expects CMYK to default (300 DPI, expects CMYK)",
  );
  fireEvent.click(card().getByRole("button", { name: "Discard" }));
  expect(card().getByRole("textbox", { name: "Minimum DPI for Flyers" })).toHaveValue("300");
  expect(updateSettings).not.toHaveBeenCalled();
});

it("keeps the edit on a stale version and reloads the settings", async () => {
  const onConflict = vi.fn();
  updateSettings.mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }));
  render(<ArtworkGuidanceSettings settings={settings} canEdit onSaved={vi.fn()} onConflict={onConflict} />);
  await card().findByText("Business cards");
  fireEvent.change(card().getByRole("textbox", { name: "Minimum DPI for Flyers" }), { target: { value: "250" } });
  fireEvent.click(save());
  expect(await card().findByRole("alert")).toHaveTextContent("Someone else saved settings a moment ago");
  expect(onConflict).toHaveBeenCalled();
  expect(card().getByRole("textbox", { name: "Minimum DPI for Flyers" })).toHaveValue("250");
});

it("says only Super Admin can change it on a 403", async () => {
  updateSettings.mockRejectedValueOnce(new ApiError(403, { error: "forbidden" }));
  render(<ArtworkGuidanceSettings settings={settings} canEdit onSaved={vi.fn()} onConflict={vi.fn()} />);
  await card().findByText("Business cards");
  fireEvent.change(card().getByRole("textbox", { name: "Minimum DPI for Flyers" }), { target: { value: "250" } });
  fireEvent.click(save());
  expect(await card().findByRole("alert")).toHaveTextContent("Only Super Admin can change artwork guidance.");
});

it("reads without controls for the GRIDGO Team", async () => {
  render(<ArtworkGuidanceSettings settings={settings} canEdit={false} />);
  await card().findByText("Business cards");
  expect(card().queryByRole("textbox")).not.toBeInTheDocument();
  expect(card().queryByRole("switch")).not.toBeInTheDocument();
  expect(card().queryByRole("button", { name: /Save|Set a target|Use the default/ })).not.toBeInTheDocument();
  expect(card().getByText("Only Super Admin changes these.")).toBeInTheDocument();
  expect(card().getAllByText("100 DPI minimum").length).toBeGreaterThan(0);
});

it("says so on an API without artwork guidance", () => {
  render(<ArtworkGuidanceSettings settings={{ ...settings, artworkGuidance: undefined }} canEdit />);
  expect(card().getByText(/not available yet/)).toBeInTheDocument();
});
