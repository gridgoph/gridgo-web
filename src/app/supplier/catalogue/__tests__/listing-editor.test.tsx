// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTOSAVE_DELAY_MS } from "@/app/supplier/_components/SaveStatus";
import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";
import { LIVE_RELOAD_COALESCE_MS } from "@/lib/live/useLiveReload";
import { ApiError } from "@/lib/api/client";
import type { InvalidatePing } from "@/lib/api/types";
import type { Taxonomy } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  getCatalogItem: vi.fn(),
  listMySupplierServices: vi.fn(),
  getTaxonomy: vi.fn(),
  listCatalogItemPrepSteps: vi.fn(),
  listAcceptedFileFormats: vi.fn(),
  getFileDownloadUrl: vi.fn(),
  updateCatalogItem: vi.fn(),
  updateCatalogOption: vi.fn(),
  reorderCatalogPhotos: vi.fn(),
  uploadCatalogItemPhoto: vi.fn(),
  attachCatalogItemPhoto: vi.fn(),
  getSupplierReadiness: vi.fn(),
  submitCatalogItemForReview: vi.fn(),
  getSettings: vi.fn(),
  listCatalogItems: vi.fn(),
  previewProductionTime: vi.fn(),
  applyProductionTimeToAll: vi.fn(),
  updateCatalogItemPrepStep: vi.fn(),
  reorderCatalogItemPrepSteps: vi.fn(),
}));

vi.stubGlobal("React", React);

class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "sci_1" }),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { verificationStatus: "approved" } }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    getCatalogItem: mocks.getCatalogItem,
    listMySupplierServices: mocks.listMySupplierServices,
    getTaxonomy: mocks.getTaxonomy,
    listCatalogItemPrepSteps: mocks.listCatalogItemPrepSteps,
    listAcceptedFileFormats: mocks.listAcceptedFileFormats,
    getFileDownloadUrl: mocks.getFileDownloadUrl,
    updateCatalogItem: mocks.updateCatalogItem,
    updateCatalogOption: mocks.updateCatalogOption,
    reorderCatalogPhotos: mocks.reorderCatalogPhotos,
    uploadCatalogItemPhoto: mocks.uploadCatalogItemPhoto,
    attachCatalogItemPhoto: mocks.attachCatalogItemPhoto,
    getSupplierReadiness: mocks.getSupplierReadiness,
    submitCatalogItemForReview: mocks.submitCatalogItemForReview,
    getSettings: mocks.getSettings,
    listCatalogItems: mocks.listCatalogItems,
    previewProductionTime: mocks.previewProductionTime,
    applyProductionTimeToAll: mocks.applyProductionTimeToAll,
    updateCatalogItemPrepStep: mocks.updateCatalogItemPrepStep,
    reorderCatalogItemPrepSteps: mocks.reorderCatalogItemPrepSteps,
  };
});

import ListingEditorPage from "@/app/supplier/catalogue/[id]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Autosave fires once the shop pauses; give it that pause plus slack. */
const AUTOSAVE_WAIT = { timeout: AUTOSAVE_DELAY_MS + 2000 };

async function openEditorStep(label: string) {
  fireEvent.click(await screen.findByRole("tab", { name: label }));
}

const taxonomy: Taxonomy = {
  categories: [
    {
      id: "taxc_marketing_collateral",
      code: "marketing_collateral",
      name: "Marketing & Promotional Collateral",
      bestFor: "Businesses promoting a service.",
      sortOrder: 1,
      productFamilyIds: [],
      active: true,
    },
  ],
  subcategories: [
    {
      id: "taxs_flyers",
      code: "flyers",
      categoryCode: "marketing_collateral",
      name: "Flyers",
      examples: ["A5"],
      sortOrder: 1,
      active: true,
    },
    {
      id: "taxs_tarpaulins_outdoor_banners",
      code: "tarpaulins_outdoor_banners",
      categoryCode: "marketing_collateral",
      name: "Tarpaulin & Outdoor Banners",
      examples: ["10x10"],
      sortOrder: 2,
      active: true,
    },
  ],
  materials: [],
  finishes: [],
};

function catalogItem(partial: Record<string, unknown> = {}) {
  return {
    item: {
      id: "sci_1",
      supplierServiceId: "svc_1",
      subcategoryCode: "flyers",
      name: "Flyers",
      description: "Single-sheet colour printing.",
      basePriceMinor: 40000,
      pricingUnit: "per_package",
      packageQty: 100,
      turnaroundMode: "override",
      turnaroundHours: 48,
      fileFormatMode: "override",
      formatCodes: ["pdf"],
      active: true,
      photos: [{ fileId: "file_1", sortOrder: 0 }],
      optionGroups: [
        {
          id: "grp_1",
          version: 1,
          name: "Size",
          kind: "spec",
          required: true,
          options: [{ id: "opt_a", label: "A5", priceModifierMinor: 0, sortOrder: 0 }],
        },
      ],
      version: 3,
      ...partial,
    },
  };
}

function stubLoad(item: ReturnType<typeof catalogItem>) {
  mocks.getCatalogItem.mockResolvedValue(item);
  mocks.listMySupplierServices.mockResolvedValue({
    services: [
      {
        id: "svc_1",
        categoryCode: "marketing_collateral",
        state: "live",
        turnaroundHours: 48,
        formatCodes: ["pdf"],
      },
    ],
  });
  mocks.getTaxonomy.mockResolvedValue(taxonomy);
  mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: [] });
  mocks.listAcceptedFileFormats.mockResolvedValue([
    { code: "pdf", displayName: "PDF", inputKind: "file" },
  ]);
  mocks.getFileDownloadUrl.mockResolvedValue("https://files.test/file_1");
  mocks.getSupplierReadiness.mockResolvedValue({
    operational: { ready: true, missing: [], listings: [] },
  });
  mocks.getSettings.mockRejectedValue(new ApiError(403, { error: "forbidden" }));
  mocks.updateCatalogItem.mockImplementation(async (_id, _version, body) => ({
    item: { ...item.item, ...body, version: 4 },
  }));
  mocks.listCatalogItems.mockResolvedValue({ items: [item.item], total: 1 });
  mocks.previewProductionTime.mockResolvedValue(PREVIEW);
}

/** A preview as `GET …/production-time-preview` answers it, cut to four days. */
const PREVIEW = {
  productionTime: { mode: "days", minDays: 1, maxDays: 3 },
  scheduling: {
    status: "tight",
    earliestReadyBy: "2026-10-24T03:45:00.000Z",
    securedReadyBy: "2026-10-27T03:45:00.000Z",
  },
  calendar: {
    days: [
      { day: "2026-10-23", status: "not_possible", reason: "before_shortest_time", readyBy: null, rushTier: null },
      { day: "2026-10-24", status: "tight", reason: null, readyBy: "2026-10-24T03:45:00.000Z", rushTier: null },
      { day: "2026-10-25", status: "not_possible", reason: "gridgo_closed_sunday", readyBy: null, rushTier: null },
      { day: "2026-10-27", status: "secured", reason: null, readyBy: "2026-10-27T03:45:00.000Z", rushTier: null },
    ],
    earliest: "2026-10-24T03:45:00.000Z",
  },
};

describe("listing editor printer cap", () => {
  it("hides max printer width on families that are not tarpaulin", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);

    expect(await screen.findByRole("tab", { name: "Pick" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByLabelText("Max printer width")).not.toBeInTheDocument();
    expect(screen.queryByText(/^feet$/)).not.toBeInTheDocument();
    await openEditorStep("About");
    expect(screen.getByLabelText("Name")).toHaveValue("Flyers");
  });

  it("requires max printer width in feet on tarpaulin listings", async () => {
    stubLoad(
      catalogItem({
        subcategoryCode: "tarpaulins_outdoor_banners",
        name: "Storefront tarpaulin",
        pricingUnit: "per_area",
        packageQty: null,
        measureUnit: "ft",
        printerMaxWidthFeet: null,
        active: false,
      }),
    );
    render(<ListingEditorPage />);

    expect(await screen.findByLabelText("Max printer width")).toBeVisible();
    expect(screen.getByText("feet")).toBeVisible();
    await openEditorStep("Review");
    expect(
      screen.getAllByText(
        "Set the max printer width in feet before it can go on the board.",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Put it on the board" })).toBeDisabled();
  });

  it("saves printerMaxWidthFeet for tarpaulin and sends null after switching away", async () => {
    const user = userEvent.setup();
    stubLoad(
      catalogItem({
        subcategoryCode: "tarpaulins_outdoor_banners",
        name: "Storefront tarpaulin",
        pricingUnit: "per_area",
        packageQty: null,
        measureUnit: "ft",
        printerMaxWidthFeet: null,
      }),
    );
    render(<ListingEditorPage />);

    const cap = await screen.findByLabelText("Max printer width");
    await user.clear(cap);
    await user.type(cap, "5");

    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalled(), AUTOSAVE_WAIT);
    const tarpBody = mocks.updateCatalogItem.mock.calls[0]?.[2] as Record<
      string,
      unknown
    >;
    expect(tarpBody).toMatchObject({ printerMaxWidthFeet: 5 });
    expect(Object.keys(tarpBody)).toContain("printerMaxWidthFeet");
    expect(tarpBody.printerMaxWidthFeet).not.toBeUndefined();

    await user.click(screen.getByRole("radio", { name: "Flyers" }));
    expect(screen.queryByLabelText("Max printer width")).not.toBeInTheDocument();

    await waitFor(
      () => expect(mocks.updateCatalogItem).toHaveBeenCalledTimes(2),
      AUTOSAVE_WAIT,
    );
    const flyersBody = mocks.updateCatalogItem.mock.calls[1]?.[2] as Record<
      string,
      unknown
    >;
    expect(flyersBody).toMatchObject({
      subcategoryCode: "flyers",
      printerMaxWidthFeet: null,
    });
    expect(typeof flyersBody.printerMaxWidthFeet === "number").toBe(false);
  });
});

it("preserves an edited listing draft when a live catalogue refresh arrives", async () => {
  stubLoad(catalogItem());
  let listener!: (ping: InvalidatePing) => void;
  const live: LiveContextValue = {
    notifications: [],
    unreadCount: 0,
    snapshot: null,
    live: true,
    subscribe: (next) => {
      listener = next;
      return () => undefined;
    },
    markRead: async () => {},
    markAllRead: async () => {},
    remove: async () => {},
    refreshInbox: async () => {},
  };
  render(
    <LiveContext.Provider value={live}>
      <ListingEditorPage />
    </LiveContext.Provider>,
  );
  await openEditorStep("About");
  expect(screen.getByLabelText("Name")).toHaveValue("Flyers");
  // The autosave that follows the edit meets a stale version; the draft stays.
  mocks.updateCatalogItem.mockRejectedValueOnce(
    new ApiError(409, { error: "version_conflict" }),
  );
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "My unsaved draft" },
  });
  mocks.getCatalogItem.mockResolvedValue(
    catalogItem({ name: "Remote edit", basePriceMinor: 50000, version: 4 }),
  );
  await act(async () => {
    listener({ resource: "catalog" });
  });
  await waitFor(() => expect(mocks.getCatalogItem).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("Name")).toHaveValue("My unsaved draft");
  await waitFor(
    () =>
      expect(mocks.updateCatalogItem).toHaveBeenCalledWith(
        "sci_1",
        3,
        expect.objectContaining({ name: "My unsaved draft", basePriceMinor: 40000 }),
      ),
    AUTOSAVE_WAIT,
  );
  expect(screen.getByLabelText("Name")).toHaveValue("My unsaved draft");
  expect(await screen.findByText(/Could not save/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  // Retry sends the same draft again; nothing else fired in between.
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("Saved just now")).toBeVisible();
});

describe("listing editor autosave", () => {
  it("saves a paused edit on its own and says so, without a Save button", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);
    await openEditorStep("About");
    expect(screen.getByLabelText("Name")).toHaveValue("Flyers");
    expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flyers A5" } });
    await waitFor(
      () =>
        expect(mocks.updateCatalogItem).toHaveBeenCalledWith(
          "sci_1",
          3,
          expect.objectContaining({ name: "Flyers A5" }),
        ),
      AUTOSAVE_WAIT,
    );
    expect(await screen.findByText("Saved just now")).toBeVisible();
    expect(mocks.updateCatalogItem).toHaveBeenCalledTimes(1);
  });

  it("keeps keystrokes typed while a save is in flight and saves them next", async () => {
    stubLoad(catalogItem());
    let release!: () => void;
    mocks.updateCatalogItem.mockImplementationOnce(
      (_id, _version, body) =>
        new Promise((resolve) => {
          release = () =>
            resolve({ item: { ...catalogItem().item, ...body, version: 4 } });
        }),
    );
    render(<ListingEditorPage />);
    await openEditorStep("About");
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "Business " } });
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalledTimes(1), AUTOSAVE_WAIT);
    expect(screen.getByText("Saving…")).toBeVisible();
    fireEvent.change(name, { target: { value: "Business cards" } });
    await act(async () => {
      release();
    });
    expect(name).toHaveValue("Business cards");
    await waitFor(
      () =>
        expect(mocks.updateCatalogItem).toHaveBeenLastCalledWith(
          "sci_1",
          4,
          expect.objectContaining({ name: "Business cards" }),
        ),
      AUTOSAVE_WAIT,
    );
    expect(name).toHaveValue("Business cards");
  });

  it("holds a draft the API would refuse instead of sending it", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);
    await openEditorStep("Price");
    const price = screen.getByLabelText("Your price");
    fireEvent.change(price, { target: { value: "" } });
    expect(await screen.findByText(/Not saved yet — enter a price/)).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 200));
    expect(mocks.updateCatalogItem).not.toHaveBeenCalled();
  });
});

/** The Speed step's own section, apart from the client preview beside it. */
describe("listing editor: How long does this take? (gridgo-api#292)", () => {
  it("saves Same day hours as one productionTime answer, never the old fields or Express", async () => {
    stubLoad(
      catalogItem({
        turnaroundHours: undefined,
        turnaroundDays: 2,
        productionTime: { mode: "days", minDays: 2, maxDays: 2 },
        productionDayMinutes: 600,
        express: false,
      }),
    );
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    expect(screen.getByRole("heading", { name: "How long does this take?" })).toBeVisible();
    expect(screen.queryByRole("switch", { name: "Express" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Same day" }));
    const hours = screen.getByRole("spinbutton", { name: "Hours until ready" });
    expect(hours).toHaveAttribute("aria-valuetext", "2 hours");
    fireEvent.click(screen.getByRole("button", { name: "More: hours until ready" }));
    expect(hours).toHaveAttribute("aria-valuetext", "2½ hours");

    await waitFor(
      () =>
        expect(mocks.updateCatalogItem).toHaveBeenCalledWith(
          "sci_1",
          3,
          expect.objectContaining({ productionTime: { mode: "same_day", hours: 2.5 } }),
        ),
      AUTOSAVE_WAIT,
    );
    const body = mocks.updateCatalogItem.mock.calls[0][2];
    for (const key of ["turnaroundMode", "turnaroundDays", "turnaroundMinutes", "turnaroundHours", "minimumTurnaroundDays", "minimumTurnaroundMinutes", "express"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it("keeps From at or under To and previews the unsaved answer's dates", async () => {
    stubLoad(catalogItem({ productionTime: { mode: "days", minDays: 1, maxDays: 3 } }));
    render(<ListingEditorPage />);
    await openEditorStep("Speed");

    const from = screen.getByRole("spinbutton", { name: "Shortest working days" });
    const to = screen.getByRole("spinbutton", { name: "Longest working days" });
    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "More: shortest working days" }));
    }
    expect(from).toHaveAttribute("aria-valuetext", "4 working days");
    expect(to).toHaveAttribute("aria-valuetext", "4 working days");

    await waitFor(() =>
      expect(mocks.previewProductionTime).toHaveBeenLastCalledWith("sci_1", {
        mode: "days",
        minDays: 4,
        maxDays: 4,
      }),
    );
    const dates = await screen.findByRole("list", { name: "The next two weeks" });
    expect(within(dates).getByText("Sat 24 Oct")).toBeVisible();
    expect(within(dates).getByText("Tight")).toBeVisible();
    expect(within(dates).getByText("Secured")).toBeVisible();
    expect(within(dates).getByText("GRIDGO is closed on Sundays")).toBeVisible();
    expect(within(dates).getByText("Ready by Tue 27 Oct, 11:45 AM")).toBeVisible();
    expect(screen.getByText(/the soonest it can be ready is Sat 24 Oct, 11:45 AM/)).toBeVisible();
  });

  it("leaves an untouched time out of a save, so other edits are not held", async () => {
    // An older API stored 48 hours exactly, which reads as a long Same day.
    stubLoad(catalogItem({ productionTime: { mode: "same_day", hours: 48 } }));
    render(<ListingEditorPage />);
    await openEditorStep("About");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flyers A5" } });
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalled(), AUTOSAVE_WAIT);
    const body = mocks.updateCatalogItem.mock.calls[0][2];
    expect(body).toMatchObject({ name: "Flyers A5" });
    expect(body).not.toHaveProperty("productionTime");
    expect(body).not.toHaveProperty("turnaroundMinutes");
  });

  it.each(["invalid_production_time", "invalid_catalog_item"])(
    "says the same thing when the API refuses the time with %s",
    async (code) => {
      stubLoad(catalogItem({ productionTime: { mode: "days", minDays: 1, maxDays: 3 } }));
      mocks.updateCatalogItem.mockRejectedValueOnce(new ApiError(400, { error: code }));
      render(<ListingEditorPage />);
      await openEditorStep("Speed");
      fireEvent.click(screen.getByRole("button", { name: "More: longest working days" }));
      expect(
        await screen.findByText(
          /GRIDGO could not save this production time\. Choose Same day with a number of hours, or Days with whole working days/,
          undefined,
          AUTOSAVE_WAIT,
        ),
      ).toBeVisible();
    },
  );

  it("previews and keeps a held exact-hours time of a working day or more", async () => {
    stubLoad(
      catalogItem({ productionTime: { mode: "same_day", hours: 12 }, productionDayMinutes: 600 }),
    );
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    expect(screen.getByRole("radio", { name: "Same day" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("spinbutton", { name: "Hours until ready" })).toHaveAttribute(
      "aria-valuetext",
      "12 hours",
    );
    expect(
      screen.getByText(
        "This is one working day of open hours or more. GRIDGO keeps it exactly, so the work is ready on a later working day; the dates below show when.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.previewProductionTime).toHaveBeenCalledWith("sci_1", {
        mode: "same_day",
        hours: 12,
      }),
    );
    expect(screen.queryByText("Fix the time above to see the dates.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(await screen.findByRole("button", { name: "Use for all my listings" })).toBeEnabled();

    // Days from here saves a usable answer.
    fireEvent.click(screen.getByRole("radio", { name: "Days" }));
    await waitFor(
      () =>
        expect(mocks.updateCatalogItem).toHaveBeenCalledWith(
          "sci_1",
          3,
          expect.objectContaining({ productionTime: { mode: "days", minDays: 1, maxDays: 3 } }),
        ),
      AUTOSAVE_WAIT,
    );
  });

  it("previews and keeps an exact 31 minutes the API returns as fractional hours", async () => {
    const exact = { mode: "same_day", hours: 31 / 60 } as const;
    stubLoad(
      catalogItem({
        productionTime: exact,
        productionDayMinutes: 600,
        productionTimeReview: {
          required: true,
          reasons: ["legacy_one_working_day"],
          message: "Check your production time",
        },
      }),
    );
    mocks.updateCatalogItem.mockResolvedValue(catalogItem({ productionTime: exact, version: 4 }));
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    await waitFor(() => expect(mocks.previewProductionTime).toHaveBeenCalledWith("sci_1", exact));
    expect(screen.queryByText("Choose how many hours this takes.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(await screen.findByRole("button", { name: "Use for all my listings" })).toBeEnabled();

    const banner = screen.getByRole("region", { name: "Check your production time" });
    fireEvent.click(within(banner).getByRole("button", { name: /^Keep / }));
    await waitFor(() =>
      expect(mocks.updateCatalogItem).toHaveBeenCalledWith("sci_1", 3, { productionTime: exact }),
    );
  });

  it.each([
    [
      new ApiError(409, { error: "shop_never_open" }),
      "GRIDGO could not fit this work into your open hours in the coming weeks. Check your open days and hours.",
    ],
    [
      new TypeError("Failed to fetch"),
      "Cannot reach GRIDGO to show the dates clients will see. Check your connection, then try again.",
    ],
  ])("says why the dates could not be shown, and tries again (%s)", async (failure, message) => {
    stubLoad(catalogItem({ productionTime: { mode: "days", minDays: 1, maxDays: 3 } }));
    mocks.previewProductionTime.mockRejectedValueOnce(failure);
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    expect(await screen.findByText(message)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("list", { name: "The next two weeks" })).toBeVisible();
    expect(mocks.previewProductionTime).toHaveBeenCalledTimes(2);
    expect(mocks.previewProductionTime).toHaveBeenLastCalledWith("sci_1", {
      mode: "days",
      minDays: 1,
      maxDays: 3,
    });
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it("shows an older mixed hours-and-days range as it is, never as not set", async () => {
    stubLoad(
      catalogItem({
        turnaroundHours: undefined,
        turnaroundMode: "override",
        minimumTurnaroundMinutes: 120,
        turnaroundDays: 2,
        productionTime: null,
      }),
    );
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    expect(screen.getByText("Now: Ready in 2 hours to 2 working days")).toBeVisible();
    expect(screen.getByText(/Choosing an answer changes them from now on/)).toBeVisible();
    expect(screen.queryByText(/No production time yet/)).not.toBeInTheDocument();

    await openEditorStep("About");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flyers A5" } });
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalled(), AUTOSAVE_WAIT);
    expect(mocks.updateCatalogItem.mock.calls[0][2]).not.toHaveProperty("productionTime");
  });

  it("edits a faster price as a whole-job price and leaves tiers out of an unrelated save", async () => {
    stubLoad(
      catalogItem({
        productionTime: { mode: "days", minDays: 3, maxDays: 5 },
        priceTiers: [{ minQuantity: 50, unitPriceMinor: 30000 }],
        speedTiers: [
          { id: "st_1", label: "Next day", turnaroundDays: 1, priceMinor: 50000, surchargeMinor: null },
        ],
      }),
    );
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(await screen.findByText("Next day")).toBeVisible();
    expect(screen.getByText(/Whole-job price/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Next day" })).toBeVisible();
    expect(screen.getByText(/Express is not one of these and has no surcharge/)).toBeVisible();

    await openEditorStep("About");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flyers A5" } });
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalled(), AUTOSAVE_WAIT);
    const body = mocks.updateCatalogItem.mock.calls[0][2];
    expect(body).not.toHaveProperty("speedTiers");
    expect(body).not.toHaveProperty("priceTiers");
    expect(body).not.toHaveProperty("express");
    expect(body).not.toHaveProperty("productionTime");
  });

  it("keeps speed tiers when only the production window changes", async () => {
    stubLoad(
      catalogItem({
        productionTime: { mode: "days", minDays: 2, maxDays: 2 },
        speedTiers: [
          { id: "st_1", label: "Next day", turnaroundDays: 1, priceMinor: 50000, surchargeMinor: null },
        ],
      }),
    );
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    fireEvent.click(screen.getByRole("radio", { name: "Same day" }));
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalled(), AUTOSAVE_WAIT);
    const body = mocks.updateCatalogItem.mock.calls[0][2];
    expect(body.productionTime).toEqual({ mode: "same_day", hours: 2 });
    expect(body).not.toHaveProperty("speedTiers");
    expect(body).not.toHaveProperty("express");
    expect(screen.getByRole("button", { name: "More options" })).toBeVisible();
  });

  it("sends a new speed as its own whole-job price", async () => {
    stubLoad(catalogItem({ productionTime: { mode: "days", minDays: 3, maxDays: 5 } }));
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.change(screen.getByLabelText("What this speed is called"), {
      target: { value: "Rush" },
    });
    fireEvent.change(screen.getByLabelText("Price at this speed"), { target: { value: "700.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Add this speed" }));
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalled(), AUTOSAVE_WAIT);
    const body = mocks.updateCatalogItem.mock.calls[0][2];
    expect(body.speedTiers).toEqual([
      expect.objectContaining({
        label: "Rush",
        priceMinor: 70050,
        surchargeMinor: null,
        turnaroundDays: 1,
      }),
    ]);
    expect(body).not.toHaveProperty("express");
  });
});

describe("listing editor: catalogue money bounds", () => {
  const over = "90071992547409.92";

  it("explains an invalid draft even when the saved price is zero", async () => {
    stubLoad(catalogItem({ basePriceMinor: 0 }));
    render(<ListingEditorPage />);
    await openEditorStep("Price");
    fireEvent.change(screen.getByLabelText("Your price"), { target: { value: "10.005" } });
    expect(await screen.findByText(/Enter an amount in pesos, for example 1200.00./)).toBeVisible();
    expect(screen.getByLabelText("Your price")).toHaveValue("10.005");
    expect(mocks.updateCatalogItem).not.toHaveBeenCalled();
  });

  it("saves zero and a sub-peso price as exact centavos", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);
    await openEditorStep("Price");
    fireEvent.change(screen.getByLabelText("Your price"), { target: { value: "0.50" } });
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalled(), AUTOSAVE_WAIT);
    expect(mocks.updateCatalogItem.mock.calls[0][2].basePriceMinor).toBe(50);
  });

  it("holds an amount past the safe centavo integer and says so", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);
    await openEditorStep("Price");
    fireEvent.change(screen.getByLabelText("Your price"), { target: { value: over } });
    expect(
      await screen.findByText(
        "Not saved yet — That amount is above the largest whole-centavo price a listing can store.",
        {},
        AUTOSAVE_WAIT,
      ),
    ).toBeVisible();
    expect(mocks.updateCatalogItem).not.toHaveBeenCalled();
  });

  it("holds a pack below 2 and saves a pack above 5,000", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    fireEvent.change(screen.getByLabelText("Pieces in a pack"), { target: { value: "1" } });
    expect(
      await screen.findByText(
        "Not saved yet — A pack must be a whole number of at least 2.",
        {},
        AUTOSAVE_WAIT,
      ),
    ).toBeVisible();
    expect(mocks.updateCatalogItem).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Pieces in a pack"), { target: { value: "6000" } });
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalled(), AUTOSAVE_WAIT);
    expect(mocks.updateCatalogItem.mock.calls[0][2].packageQty).toBe(6000);
  });

  it("saves a minimum order above 1,000", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    fireEvent.change(screen.getByLabelText("Minimum order"), { target: { value: "1001" } });
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalled(), AUTOSAVE_WAIT);
    expect(mocks.updateCatalogItem.mock.calls[0][2].minimumOrderQuantity).toBe(1001);
  });

  it("rejects a second bulk break at the same quantity with the API's meaning", async () => {
    stubLoad(catalogItem({ priceTiers: [{ minQuantity: 20, unitPriceMinor: 1000 }] }));
    render(<ListingEditorPage />);
    await openEditorStep("Price");
    fireEvent.change(screen.getByLabelText("Quantity this break starts at"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Rate at this quantity"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Add this break" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Two bulk breaks cannot start at the same quantity.",
    );
    expect(mocks.updateCatalogItem).not.toHaveBeenCalled();
  });
});

describe("listing editor: Check your production time (gridgo-api#292)", () => {
  it("lets a shop keep a time GRIDGO rounded up, which clears the reminder", async () => {
    stubLoad(
      catalogItem({
        productionTime: { mode: "days", minDays: 1, maxDays: 1 },
        productionTimeReview: {
          required: true,
          reasons: ["legacy_one_working_day"],
          message: "Check your production time",
        },
      }),
    );
    mocks.updateCatalogItem.mockImplementationOnce(async (_id, _version, body) => ({
      item: {
        ...catalogItem().item,
        ...body,
        productionTimeReview: { required: false, reasons: [], message: null },
        version: 4,
      },
    }));
    render(<ListingEditorPage />);
    const banner = await screen.findByRole("region", { name: "Check your production time" });
    expect(
      within(banner).getByText(
        "This listing has an older 1-working-day setting. Confirm it, or set the time it really takes.",
      ),
    ).toBeVisible();

    fireEvent.click(within(banner).getByRole("button", { name: "Keep 1 working day" }));
    await waitFor(() =>
      expect(mocks.updateCatalogItem).toHaveBeenCalledWith("sci_1", 3, {
        productionTime: { mode: "days", minDays: 1, maxDays: 1 },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Check your production time" })).not.toBeInTheDocument(),
    );
  });

  it("asks an Express listing with no hours to pick Same day, and saves it", async () => {
    stubLoad(
      catalogItem({
        turnaroundMode: "inherit",
        turnaroundHours: undefined,
        express: true,
        productionTime: null,
        productionTimeReview: {
          required: true,
          reasons: ["express_missing_hours"],
          message: "Check your production time",
        },
      }),
    );
    render(<ListingEditorPage />);
    const banner = await screen.findByRole("region", { name: "Check your production time" });
    expect(within(banner).getByText(/Express is now Same day/)).toBeVisible();
    expect(within(banner).queryByRole("button", { name: /^Keep/ })).not.toBeInTheDocument();

    fireEvent.click(within(banner).getByRole("button", { name: "Check production time" }));
    expect(screen.getByText(/No production time yet/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Same day" }));
    await waitFor(
      () =>
        expect(mocks.updateCatalogItem).toHaveBeenCalledWith(
          "sci_1",
          3,
          expect.objectContaining({ productionTime: { mode: "same_day", hours: 2 } }),
        ),
      AUTOSAVE_WAIT,
    );
    expect(mocks.updateCatalogItem.mock.calls[0][2]).not.toHaveProperty("express");
  });
});

describe("listing editor: Use for all my listings (gridgo-api#292)", () => {
  it("confirms, sends every listing's version, and moves this draft to the new version", async () => {
    stubLoad(catalogItem({ productionTime: { mode: "days", minDays: 1, maxDays: 3 } }));
    mocks.listCatalogItems.mockResolvedValue({
      items: [
        { ...catalogItem().item, productionTime: { mode: "days", minDays: 1, maxDays: 3 } },
        { ...catalogItem().item, id: "sci_2", name: "Hidden posters", active: false, version: 7 },
      ],
      total: 2,
    });
    mocks.applyProductionTimeToAll.mockResolvedValue({
      items: [
        { ...catalogItem().item, productionTime: { mode: "days", minDays: 1, maxDays: 3 }, version: 5 },
        { ...catalogItem().item, id: "sci_2", version: 8 },
      ],
      total: 2,
    });
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use for all my listings" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("All 2 of your listings, hidden ones and drafts included");
    expect(dialog).toHaveTextContent("Orders already placed keep their dates");
    expect(mocks.applyProductionTimeToAll).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Use for all" }));

    await waitFor(() =>
      expect(mocks.applyProductionTimeToAll).toHaveBeenCalledWith(
        { mode: "days", minDays: 1, maxDays: 3 },
        { sci_1: 3, sci_2: 7 },
      ),
    );
    expect(await screen.findByText("Done. All 2 listings take 1 to 3 working days now.")).toBeVisible();

    await openEditorStep("About");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flyers, glossy" } });
    await waitFor(
      () =>
        expect(mocks.updateCatalogItem).toHaveBeenLastCalledWith(
          "sci_1",
          5,
          expect.objectContaining({ name: "Flyers, glossy" }),
        ),
      AUTOSAVE_WAIT,
    );
  });

  it("takes the server's newer price after bulk apply and sends no follow-up PATCH", async () => {
    // Another session moved the price to ₱500 (version 4) before this editor heard of it.
    stubLoad(catalogItem({ productionTime: { mode: "days", minDays: 1, maxDays: 3 } }));
    const newer = {
      ...catalogItem().item,
      basePriceMinor: 50000,
      productionTime: { mode: "days", minDays: 1, maxDays: 3 },
    };
    mocks.listCatalogItems.mockResolvedValue({ items: [{ ...newer, version: 4 }], total: 1 });
    mocks.applyProductionTimeToAll.mockResolvedValue({ items: [{ ...newer, version: 5 }], total: 1 });
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use for all my listings" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Use for all" }),
    );
    await waitFor(() =>
      expect(mocks.applyProductionTimeToAll).toHaveBeenCalledWith(
        { mode: "days", minDays: 1, maxDays: 3 },
        { sci_1: 4 },
      ),
    );
    await screen.findByText("Done. Your listing takes 1 to 3 working days now.");
    await act(() => new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 500)));
    expect(mocks.updateCatalogItem).not.toHaveBeenCalled();
    await openEditorStep("Price");
    expect(screen.getByLabelText("Your price")).toHaveValue("500.00");
  });

  it.each(["already running when it starts", "arriving while it runs"])(
    "never takes a live refresh %s for the shop's own edit during bulk apply",
    async (when) => {
      // Another session moves the price to ₱450 (version 4) while Use for all
      // reads the board, then to ₱500 (version 5) before the board read ends.
      const choice = { mode: "days", minDays: 1, maxDays: 3 } as const;
      const row = (price: number, version: number, id = "sci_1") => ({
        ...catalogItem().item,
        id,
        basePriceMinor: price,
        version,
        productionTime: choice,
      });
      stubLoad(catalogItem({ productionTime: choice }));
      let listener!: (ping: InvalidatePing) => void;
      const live: LiveContextValue = {
        notifications: [],
        unreadCount: 0,
        snapshot: null,
        live: true,
        subscribe: (next) => {
          listener = next;
          return () => undefined;
        },
        markRead: async () => {},
        markAllRead: async () => {},
        remove: async () => {},
        refreshInbox: async () => {},
      };
      let firstPage: ((body: unknown) => void) | null = null;
      let finishBulk!: (body: unknown) => void;
      mocks.listCatalogItems.mockImplementation(
        (query: { limit?: number; cursor?: string | null }) =>
          query.limit !== 50
            ? Promise.resolve({ items: [row(40000, 3)], total: 2 })
            : query.cursor === "this-listing"
              ? Promise.resolve({ items: [row(50000, 5)], total: 2 })
              : new Promise((resolve) => {
                  firstPage = resolve;
                }),
      );
      mocks.applyProductionTimeToAll.mockReturnValue(
        new Promise((resolve) => {
          finishBulk = resolve;
        }),
      );
      render(
        <LiveContext.Provider value={live}>
          <ListingEditorPage />
        </LiveContext.Provider>,
      );
      await openEditorStep("Speed");
      const refresh = async () => {
        act(() => listener({ resource: "catalog" } as InvalidatePing));
        await act(() => new Promise((resolve) => setTimeout(resolve, LIVE_RELOAD_COALESCE_MS + 100)));
      };
      let landRefresh: (() => void) | null = null;
      if (when === "already running when it starts") {
        mocks.getCatalogItem.mockReturnValue(
          new Promise((resolve) => {
            landRefresh = () => resolve({ item: row(45000, 4) });
          }),
        );
        await refresh();
        await waitFor(() => expect(mocks.getCatalogItem).toHaveBeenCalledTimes(2));
      }
      fireEvent.click(screen.getByRole("button", { name: "More options" }));
      fireEvent.click(await screen.findByRole("button", { name: "Use for all my listings" }));
      fireEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Use for all" }),
      );
      await waitFor(() => expect(firstPage).not.toBeNull());

      const readsBefore = mocks.getCatalogItem.mock.calls.length;
      if (landRefresh) {
        await act(async () => landRefresh?.());
      } else {
        mocks.getCatalogItem.mockResolvedValue({ item: row(45000, 4) });
        await refresh();
      }
      // Held: nothing from the server lands in the draft while the request runs.
      expect(mocks.getCatalogItem).toHaveBeenCalledTimes(readsBefore);

      await act(async () => {
        firstPage?.({ items: [row(40000, 9, "sci_other")], nextCursor: "this-listing", total: 2 });
      });
      await waitFor(() =>
        expect(mocks.applyProductionTimeToAll).toHaveBeenCalledWith(choice, {
          sci_other: 9,
          sci_1: 5,
        }),
      );
      mocks.getCatalogItem.mockResolvedValue({ item: row(50000, 6) });
      await act(async () => {
        finishBulk({ items: [row(50000, 6), row(40000, 10, "sci_other")], total: 2 });
      });
      await screen.findByText(/^Done\. All 2 listings take/);
      await act(() => new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 500)));
      expect(mocks.updateCatalogItem).not.toHaveBeenCalled();
      // The refresh held during the request runs once it ends.
      expect(mocks.getCatalogItem).toHaveBeenCalledTimes(readsBefore + 1);
      await openEditorStep("Price");
      expect(screen.getByLabelText("Your price")).toHaveValue("500.00");
    },
  );

  it.each(["fails", "succeeds"])(
    "reads the listing again when a refresh started before bulk apply lands after it %s",
    async (outcome) => {
      const choice = { mode: "days", minDays: 1, maxDays: 3 } as const;
      const row = (price: number, version: number) => ({
        ...catalogItem().item,
        basePriceMinor: price,
        version,
        productionTime: choice,
      });
      stubLoad(catalogItem({ productionTime: choice }));
      let listener!: (ping: InvalidatePing) => void;
      const live: LiveContextValue = {
        notifications: [],
        unreadCount: 0,
        snapshot: null,
        live: true,
        subscribe: (next) => {
          listener = next;
          return () => undefined;
        },
        markRead: async () => {},
        markAllRead: async () => {},
        remove: async () => {},
        refreshInbox: async () => {},
      };
      render(
        <LiveContext.Provider value={live}>
          <ListingEditorPage />
        </LiveContext.Provider>,
      );
      await openEditorStep("Speed");
      let landRefresh!: (body: unknown) => void;
      mocks.getCatalogItem.mockReturnValueOnce(
        new Promise((resolve) => {
          landRefresh = resolve;
        }),
      );
      act(() => listener({ resource: "catalog" } as InvalidatePing));
      await act(() => new Promise((resolve) => setTimeout(resolve, LIVE_RELOAD_COALESCE_MS + 100)));
      await waitFor(() => expect(mocks.getCatalogItem).toHaveBeenCalledTimes(2));

      if (outcome === "fails") {
        mocks.applyProductionTimeToAll.mockRejectedValue(
          new ApiError(409, { error: "catalog_items_stale" }),
        );
      } else {
        mocks.applyProductionTimeToAll.mockResolvedValue({ items: [row(40000, 4)], total: 1 });
      }
      fireEvent.click(screen.getByRole("button", { name: "More options" }));
      fireEvent.click(await screen.findByRole("button", { name: "Use for all my listings" }));
      fireEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Use for all" }),
      );
      await screen.findByText(
        outcome === "fails" ? /One of your listings changed while/ : /^Done\. Your listing takes/,
      );

      // The old refresh lands after the request settled: dropped, and read again.
      mocks.getCatalogItem.mockResolvedValue({ item: row(50000, 6) });
      await act(async () => landRefresh({ item: row(45000, 5) }));
      await waitFor(() => expect(mocks.getCatalogItem).toHaveBeenCalledTimes(3));
      await openEditorStep("Price");
      await waitFor(() => expect(screen.getByLabelText("Your price")).toHaveValue("500.00"));
      expect(mocks.updateCatalogItem).not.toHaveBeenCalled();
    },
  );

  it("keeps an answer changed while bulk apply was running, and saves it next", async () => {
    stubLoad(catalogItem({ productionTime: { mode: "days", minDays: 1, maxDays: 3 } }));
    let finish: (body: unknown) => void = () => undefined;
    mocks.applyProductionTimeToAll.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use for all my listings" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Use for all" }),
    );
    await waitFor(() => expect(mocks.applyProductionTimeToAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "More: shortest working days" }));
    const from = screen.getByRole("spinbutton", { name: "Shortest working days" });
    expect(from).toHaveAttribute("aria-valuenow", "2");
    await act(async () => {
      finish({
        items: [
          { ...catalogItem().item, productionTime: { mode: "days", minDays: 1, maxDays: 3 }, version: 5 },
        ],
        total: 1,
      });
    });
    await screen.findByText(/^Done\. Your listing takes/);
    expect(from).toHaveAttribute("aria-valuenow", "2");
    await waitFor(
      () =>
        expect(mocks.updateCatalogItem).toHaveBeenCalledWith(
          "sci_1",
          5,
          expect.objectContaining({ productionTime: { mode: "days", minDays: 2, maxDays: 3 } }),
        ),
      AUTOSAVE_WAIT,
    );
  });

  it("says nothing changed when a listing moved in the meantime", async () => {
    stubLoad(catalogItem({ productionTime: { mode: "days", minDays: 1, maxDays: 3 } }));
    mocks.applyProductionTimeToAll.mockRejectedValue(
      new ApiError(409, { error: "catalog_items_stale" }),
    );
    render(<ListingEditorPage />);
    await openEditorStep("Speed");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use for all my listings" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Use for all" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "One of your listings changed while this was being applied, so nothing was changed. Try again.",
    );
  });
});

describe("listing editor readiness checklist", () => {
  it("lists what is missing once, and takes you to the field", async () => {
    stubLoad(catalogItem({ description: "", active: false }));
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<ListingEditorPage />);
    await openEditorStep("Review");

    expect(screen.getByText("1 thing before it can go up")).toBeVisible();

    const row = screen.getByRole("button", {
      name: /Missing: Say what this is, so a client knows what they are ordering\./,
    });
    const cta = screen.getByRole("button", { name: "Put it on the board" });
    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute("aria-describedby", row.id);

    fireEvent.click(row);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "About" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Description")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Single-sheet colour printing." },
    });
    await openEditorStep("Review");
    expect(await screen.findByText("Ready for the board")).toBeVisible();
    expect(screen.getByRole("button", { name: "Put it on the board" })).toBeEnabled();
  });

  it("shows the standing chip in the header only for a live or hidden listing", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Flyers" })).toBeVisible();
    // The client reading does not chip a live listing, so the header chip is the one.
    expect(screen.getAllByText("Live")).toHaveLength(1);
    await openEditorStep("Review");
    expect(screen.getByRole("button", { name: "Take it off the board" })).toBeEnabled();
  });
});

describe("listing editor review", () => {
  it("shows Operations' send-back reason and sends the listing for review again", async () => {
    const sentBack = catalogItem({
      reviewStatus: "needs_revision",
      reviewReason: "Photo 2 shows the shop's logo. Replace it with a plain photo.",
      hasApprovedVersion: false,
      active: false,
    });
    stubLoad(sentBack);
    mocks.submitCatalogItemForReview.mockResolvedValue({
      item: { ...sentBack.item, reviewStatus: "pending", reviewReason: null, version: 4 },
    });
    render(<ListingEditorPage />);
    expect(await screen.findByRole("heading", { name: /Operations sent this back/ })).toBeVisible();
    expect(screen.getByText("Photo 2 shows the shop's logo. Replace it with a plain photo.")).toBeVisible();
    expect(screen.getAllByText("Needs changes").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Send for review" }));
    await waitFor(() =>
      expect(mocks.submitCatalogItemForReview).toHaveBeenCalledWith(
        sentBack.item.id,
        sentBack.item.version,
      ),
    );
    expect(await screen.findByText(/Sent to Operations/)).toBeVisible();
    expect(screen.getByText(/Waiting for Operations to review/)).toBeVisible();
  });

  it("reads Pending review for a new listing Operations has not approved", async () => {
    stubLoad(catalogItem({ reviewStatus: "pending", hasApprovedVersion: false }));
    mocks.getSupplierReadiness.mockResolvedValue({
      operational: {
        ready: false,
        missing: [],
        listings: [
          {
            catalogItemId: "sci_1",
            ready: false,
            missing: [{ code: "listing_not_approved", message: "Operations must approve this listing.", action: "view_listing_review" }],
          },
        ],
      },
    });
    render(<ListingEditorPage />);
    expect(await screen.findByText("Pending review")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send for review" })).toBeNull();
  });
});

describe("listing editor wizard", () => {
  it("walks all seven steps", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);
    const steps = [
      ["Pick", "Pick printing category"],
      ["About", "Describe your product"],
      ["Price", "Set your product price"],
      ["Speed", "Set your capacity & speed"],
      ["Steps", "How will the client choose?"],
      ["Artwork", "How can the client help you?"],
      ["Review", "Finalize your product"],
    ] as const;

    expect(await screen.findByRole("tab", { name: "Pick" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    for (const [label, title] of steps) {
      fireEvent.click(screen.getByRole("tab", { name: label }));
      expect(screen.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeVisible();
    }
  });

  it("shows the draft price and sample in the client reading", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);
    const preview = await screen.findByTestId("listing-preview");
    expect(preview).toHaveTextContent("₱400.00");
    expect(preview).toHaveTextContent("per pack of 100");
    expect(await within(preview).findByRole("img", { name: "Flyers" })).toBeVisible();

    await openEditorStep("Price");
    fireEvent.change(screen.getByLabelText("Your price"), { target: { value: "550" } });
    expect(preview).toHaveTextContent("₱550.00");
    expect(within(preview).getByRole("img", { name: "Flyers" })).toBeVisible();
    expect(mocks.updateCatalogItem).not.toHaveBeenCalled();
  });

  it("keeps publish on Review blocked until the checklist is clear", async () => {
    stubLoad(catalogItem({ description: "", active: false }));
    render(<ListingEditorPage />);
    await openEditorStep("Review");
    expect(screen.getByRole("button", { name: "Put it on the board" })).toBeDisabled();
    expect(screen.getByText("1 thing before it can go up")).toBeVisible();

    await openEditorStep("About");
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Single-sheet colour printing." },
    });
    await openEditorStep("Review");
    expect(await screen.findByText("Ready for the board")).toBeVisible();
    expect(screen.getByRole("button", { name: "Put it on the board" })).toBeEnabled();
  });
});

it.each([true, false])(
  "keeps option price ownership across refresh (edited: %s)",
  async (edited) => {
    stubLoad(catalogItem());
    let listener!: (ping: InvalidatePing) => void;
    const live: LiveContextValue = {
      notifications: [],
      unreadCount: 0,
      snapshot: null,
      live: true,
      subscribe: (next) => {
        listener = next;
        return () => undefined;
      },
      markRead: async () => {},
      markAllRead: async () => {},
      remove: async () => {},
      refreshInbox: async () => {},
    };
    render(
      <LiveContext.Provider value={live}>
        <ListingEditorPage />
      </LiveContext.Provider>,
    );
    await openEditorStep("Steps");
    const price = screen.getByLabelText("A5 extra pesos");
    if (edited) fireEvent.change(price, { target: { value: "12.50" } });
    const remote = catalogItem();
    remote.item.optionGroups[0].version = 2;
    remote.item.optionGroups[0].options[0].priceModifierMinor = 2000;
    mocks.getCatalogItem.mockResolvedValue(remote);
    await act(async () => {
      listener({ resource: "catalog" });
    });
    await waitFor(() => expect(mocks.getCatalogItem).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(price).toHaveValue(edited ? "12.50" : "20.00"));
    if (!edited) fireEvent.change(price, { target: { value: "12.50" } });
    mocks.updateCatalogOption.mockRejectedValueOnce(
      new ApiError(409, { error: "version_conflict" }),
    );
    fireEvent.blur(price);
    await waitFor(() =>
      expect(mocks.updateCatalogOption).toHaveBeenCalledWith(
        "grp_1",
        "opt_a",
        edited ? 1 : 2,
        { priceModifierMinor: 1250 },
      ),
    );
    expect(price).toHaveValue("12.50");
  },
);

function renderLiveListing() {
  stubLoad(catalogItem());
  let listener!: (ping: InvalidatePing) => void;
  const live: LiveContextValue = {
    notifications: [],
    unreadCount: 0,
    snapshot: null,
    live: true,
    subscribe: (next) => {
      listener = next;
      return () => undefined;
    },
    markRead: async () => {},
    markAllRead: async () => {},
    remove: async () => {},
    refreshInbox: async () => {},
  };
  render(
    <LiveContext.Provider value={live}>
      <ListingEditorPage />
    </LiveContext.Provider>,
  );
  return async () => {
    const calls = mocks.getTaxonomy.mock.calls.length;
    // The request starting is not the refresh committing. Flush its promises
    // and React effects before the caller interacts with the retained input.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await act(async () => {
        listener({ resource: "catalog" });
        await vi.advanceTimersByTimeAsync(LIVE_RELOAD_COALESCE_MS);
      });
      expect(mocks.getTaxonomy).toHaveBeenCalledTimes(calls + 1);
    } finally {
      vi.useRealTimers();
    }
  };
}

it("retains an option price draft and its version through transient failure and recovery", async () => {
  const ping = renderLiveListing();
  await openEditorStep("Steps");
  const price = screen.getByLabelText("A5 extra pesos");
  fireEvent.change(price, { target: { value: "12.50" } });
  price.focus();
  mocks.getTaxonomy.mockRejectedValueOnce(new TypeError("Offline"));
  await ping();
  expect(screen.getByLabelText("A5 extra pesos")).toBe(price);
  expect(price).toHaveValue("12.50");
  expect(price).toHaveFocus();
  expect(screen.queryByText("This listing could not open")).not.toBeInTheDocument();

  const remote = catalogItem();
  remote.item.optionGroups[0].version = 2;
  remote.item.optionGroups[0].options[0].priceModifierMinor = 2000;
  mocks.getCatalogItem.mockResolvedValue(remote);
  await ping();
  expect(screen.getByLabelText("A5 extra pesos")).toBe(price);
  expect(price).toHaveValue("12.50");
  expect(price).toHaveFocus();
  mocks.updateCatalogOption.mockRejectedValueOnce(
    new ApiError(409, { error: "version_conflict" }),
  );
  fireEvent.blur(price);
  await waitFor(() =>
    expect(mocks.updateCatalogOption).toHaveBeenCalledWith("grp_1", "opt_a", 1, {
      priceModifierMinor: 1250,
    }),
  );
});

it.each([401, 403, 404])(
  "clears the loaded listing on HTTP %s and keeps it hidden during a failed retry",
  async (status) => {
    const ping = renderLiveListing();
    await openEditorStep("Steps");
    const price = screen.getByLabelText("A5 extra pesos");
    fireEvent.change(price, { target: { value: "12.50" } });
    mocks.getTaxonomy.mockRejectedValueOnce(
      new ApiError(status, {
        error:
          status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "not_found",
      }),
    );
    await ping();
    expect(await screen.findByText("This listing could not open")).toBeVisible();
    expect(screen.queryByLabelText("A5 extra pesos")).not.toBeInTheDocument();

    mocks.getTaxonomy.mockRejectedValueOnce(new TypeError("Offline"));
    await ping();
    expect(screen.getByText("This listing could not open")).toBeVisible();
    expect(screen.queryByLabelText("A5 extra pesos")).not.toBeInTheDocument();

    await ping();
    expect(await screen.findByLabelText("A5 extra pesos")).toHaveValue("0.00");
  },
);

describe("listing editor sample photos", () => {
  const photos = [
    { fileId: "file_1", sortOrder: 0 },
    { fileId: "file_2", sortOrder: 1 },
    { fileId: "file_3", sortOrder: 2 },
  ];

  function stubPhotos(list = photos) {
    stubLoad(catalogItem({ photos: list }));
    mocks.getFileDownloadUrl.mockImplementation(
      async (fileId: string) => `https://files.test/${fileId}`,
    );
    mocks.reorderCatalogPhotos.mockImplementation(
      async (_itemId: string, fileIds: string[], expectedVersion: number) =>
        catalogItem({
          photos: fileIds.map((fileId, sortOrder) => ({ fileId, sortOrder })),
          version: expectedVersion + 1,
        }),
    );
  }

  /** The Board photo in "What clients see". */
  async function previewSample(fileId: string) {
    const preview = screen.getByTestId("listing-preview-sample");
    await waitFor(() =>
      expect(within(preview).getByRole("img")).toHaveAttribute(
        "src",
        `https://files.test/${fileId}`,
      ),
    );
  }

  async function choose(user: ReturnType<typeof userEvent.setup>, photo: string, item: string) {
    await user.click(screen.getByRole("button", { name: `Edit ${photo}` }));
    await user.click(await screen.findByRole("menuitem", { name: item }));
  }

  it("labels every photo's controls and offers only the moves that make sense", async () => {
    const user = userEvent.setup();
    stubPhotos();
    render(<ListingEditorPage />);
    await openEditorStep("About");

    for (const name of ["Edit Board photo", "Edit photo 2", "Edit photo 3"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
    await user.click(screen.getByRole("button", { name: "Edit Board photo" }));
    const wideItems = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(wideItems).toEqual(["Move later", "Replace photo…", "Remove photo…"]);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Edit photo 3" }));
    const lastItems = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(lastItems).toEqual([
      "Make Board photo",
      "Move earlier",
      "Replace photo…",
      "Remove photo…",
    ]);
  });

  it("confirms, then posts the photos that stay when one is removed", async () => {
    const user = userEvent.setup();
    stubPhotos();
    render(<ListingEditorPage />);
    await openEditorStep("About");

    await choose(user, "photo 2", "Remove photo…");
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Remove photo 2?" })).toBeVisible();
    expect(
      within(dialog).getByText(
        "It comes off this listing. The other photos keep their order. Orders already placed are not changed.",
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Remove photo" }));

    await waitFor(() =>
      expect(mocks.reorderCatalogPhotos).toHaveBeenCalledWith("sci_1", ["file_1", "file_3"], 3),
    );
    expect(mocks.reorderCatalogPhotos).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Photo 2 removed.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit photo 3" })).not.toBeInTheDocument();
  });

  it("removes the Board photo, says the next photo took its place, and updates the preview", async () => {
    const user = userEvent.setup();
    stubPhotos();
    render(<ListingEditorPage />);
    await openEditorStep("About");
    await previewSample("file_1");

    await choose(user, "Board photo", "Remove photo…");
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", { name: "Remove the Board photo?" }),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Photo 2 becomes the Board photo clients see first\./),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Remove photo" }));

    await waitFor(() =>
      expect(mocks.reorderCatalogPhotos).toHaveBeenCalledWith("sci_1", ["file_2", "file_3"], 3),
    );
    expect(
      await screen.findByText("Board photo removed. The next photo is now the Board photo."),
    ).toBeVisible();
    await previewSample("file_2");
  });

  it("does not call the API when the shop keeps the photo", async () => {
    const user = userEvent.setup();
    stubPhotos();
    render(<ListingEditorPage />);
    await openEditorStep("About");

    await choose(user, "Board photo", "Remove photo…");
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Keep it" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.reorderCatalogPhotos).not.toHaveBeenCalled();
    await previewSample("file_1");
  });

  it("warns that removing the only photo takes the listing off the board", async () => {
    const user = userEvent.setup();
    stubPhotos([{ fileId: "file_1", sortOrder: 0 }]);
    render(<ListingEditorPage />);
    await openEditorStep("About");

    await choose(user, "Board photo", "Remove photo…");
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Remove the only photo?" })).toBeVisible();
    expect(within(dialog).getByText(/clients stop seeing it until you add another/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Remove photo" }));

    await waitFor(() =>
      expect(mocks.reorderCatalogPhotos).toHaveBeenCalledWith("sci_1", [], 3),
    );
    expect(await screen.findByRole("button", { name: /Add the Board photo/ })).toBeVisible();
  });

  it("makes a later photo the Board photo in one step and the preview follows", async () => {
    const user = userEvent.setup();
    stubPhotos();
    render(<ListingEditorPage />);
    await openEditorStep("About");

    await choose(user, "photo 3", "Make Board photo");

    await waitFor(() =>
      expect(mocks.reorderCatalogPhotos).toHaveBeenCalledWith(
        "sci_1",
        ["file_3", "file_1", "file_2"],
        3,
      ),
    );
    expect(await screen.findByText("Photo 3 is now the Board photo.")).toBeVisible();
    await previewSample("file_3");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit Board photo" })).toHaveFocus(),
    );
  });

  it("keeps the step-by-step move", async () => {
    const user = userEvent.setup();
    stubPhotos();
    render(<ListingEditorPage />);
    await openEditorStep("About");

    await choose(user, "photo 2", "Move later");

    await waitFor(() =>
      expect(mocks.reorderCatalogPhotos).toHaveBeenCalledWith(
        "sci_1",
        ["file_1", "file_3", "file_2"],
        3,
      ),
    );
    expect(await screen.findByText("Photo 2 is now photo 3.")).toBeVisible();
  });

  it("replaces a photo in its own slot and the preview shows the new one", async () => {
    const user = userEvent.setup();
    stubPhotos();
    mocks.uploadCatalogItemPhoto.mockResolvedValue({ fileId: "file_new" });
    mocks.attachCatalogItemPhoto.mockImplementation(async () => {
      mocks.getCatalogItem.mockResolvedValue(
        catalogItem({
          photos: [
            { fileId: "file_new", sortOrder: 0 },
            { fileId: "file_2", sortOrder: 1 },
            { fileId: "file_3", sortOrder: 2 },
          ],
          version: 4,
        }),
      );
      return {};
    });
    render(<ListingEditorPage />);
    await openEditorStep("About");
    await previewSample("file_1");

    await choose(user, "Board photo", "Replace photo…");
    const picked = new File(["x"], "sharper.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Choose a replacement photo"), picked);

    await waitFor(() =>
      expect(mocks.attachCatalogItemPhoto).toHaveBeenCalledWith("file_new", "sci_1", 0, undefined),
    );
    expect(mocks.uploadCatalogItemPhoto).toHaveBeenCalledWith(picked);
    expect(mocks.reorderCatalogPhotos).not.toHaveBeenCalled();
    expect(await screen.findByText("Board photo replaced. It kept its place.")).toBeVisible();
    await previewSample("file_new");
  });

  it("replaces a later photo at its own sort order", async () => {
    const user = userEvent.setup();
    stubPhotos([
      { fileId: "file_1", sortOrder: 0 },
      { fileId: "file_2", sortOrder: 4 },
    ]);
    mocks.uploadCatalogItemPhoto.mockResolvedValue({ fileId: "file_new" });
    mocks.attachCatalogItemPhoto.mockResolvedValue({});
    render(<ListingEditorPage />);
    await openEditorStep("About");

    await choose(user, "photo 2", "Replace photo…");
    await user.upload(
      screen.getByLabelText("Choose a replacement photo"),
      new File(["x"], "b.png", { type: "image/png" }),
    );

    await waitFor(() =>
      expect(mocks.attachCatalogItemPhoto).toHaveBeenCalledWith("file_new", "sci_1", 4, undefined),
    );
  });

  it("asks the shop to refresh when the photo set is stale", async () => {
    const user = userEvent.setup();
    stubPhotos();
    mocks.reorderCatalogPhotos.mockRejectedValueOnce(
      new ApiError(409, { error: "catalog_item_stale" }),
    );
    render(<ListingEditorPage />);
    await openEditorStep("About");

    await choose(user, "photo 3", "Move earlier");

    expect(
      await screen.findByText("This listing changed on another screen. Refresh and try again."),
    ).toBeVisible();
  });
});

it("shows a recoverable error when the initial listing load fails", async () => {
  stubLoad(catalogItem());
  mocks.getTaxonomy.mockRejectedValueOnce(new TypeError("Offline"));
  render(<ListingEditorPage />);
  expect(await screen.findByText("This listing could not open")).toBeVisible();
  expect(screen.queryByLabelText("A5 extra pesos")).not.toBeInTheDocument();
});

it.each([false, true])(
  "reconciles a saved option price after refresh (initial refresh fails: %s)",
  async (refreshFails) => {
    const ping = renderLiveListing();
    await openEditorStep("Steps");
    const price = screen.getByLabelText("A5 extra pesos");
    fireEvent.change(price, { target: { value: "12.50" } });
    const updated = catalogItem();
    updated.item.optionGroups[0].version = 2;
    updated.item.optionGroups[0].options[0].priceModifierMinor = 1250;
    mocks.updateCatalogOption.mockResolvedValue({});
    mocks.getCatalogItem.mockResolvedValue(updated);
    if (refreshFails) mocks.getTaxonomy.mockRejectedValueOnce(new TypeError("Offline"));
    await act(async () => {
      fireEvent.blur(price);
    });
    expect(mocks.getTaxonomy).toHaveBeenCalledTimes(2);

    if (refreshFails) {
      expect(
        await screen.findByText(
          "Price saved, but its refresh failed. Your entered price was kept.",
        ),
      ).toBeVisible();
      expect(screen.getByLabelText("A5 extra pesos")).toBe(price);
      expect(price).toHaveValue("12.50");
      await ping();
    }
    expect(price).toHaveValue("12.50");
    fireEvent.blur(price);
    expect(mocks.updateCatalogOption).toHaveBeenCalledTimes(1);

    fireEvent.change(price, { target: { value: "15.00" } });
    mocks.updateCatalogOption.mockRejectedValueOnce(
      new ApiError(409, { error: "version_conflict" }),
    );
    fireEvent.blur(price);
    await waitFor(() =>
      expect(mocks.updateCatalogOption).toHaveBeenLastCalledWith("grp_1", "opt_a", 2, {
        priceModifierMinor: 1500,
      }),
    );
    expect(price).toHaveValue("15.00");
  },
);

describe("listing editor print layouts (gridgo-client#245)", () => {
  it("marks layouts, says clients must choose one, and saves the whole set", async () => {
    stubLoad(catalogItem({ printLayouts: [], reviewStatus: "approved" }));
    render(<ListingEditorPage />);
    await openEditorStep("Artwork");

    const group = screen.getByRole("group", { name: "Print layouts you can print" });
    const boxes = within(group).getAllByRole("checkbox");
    expect(boxes.map((box) => box.textContent)).toEqual([
      expect.stringContaining("Fit to paper"),
      expect.stringContaining("Actual size, centred"),
      expect.stringContaining("Actual size, in its original position"),
    ]);
    expect(boxes.every((box) => box.getAttribute("aria-checked") === "false")).toBe(true);
    expect(screen.getByText(/No layout marked: clients are not asked/)).toBeVisible();
    expect(screen.getByText(/A change goes to the GRIDGO Team for review/)).toBeVisible();

    // Ticked out of order, sent in the canonical order.
    fireEvent.click(within(group).getByRole("checkbox", { name: /Actual size, centred/ }));
    fireEvent.click(within(group).getByRole("checkbox", { name: /Fit to paper/ }));
    expect(
      screen.getByText("Clients must choose one of these before they can order this listing. Nothing is chosen for them."),
    ).toBeVisible();
    // The client reading beside the editor asks for a layout too.
    expect(within(screen.getByTestId("listing-preview-layout")).getByText("Step 2 · Layout")).toBeVisible();

    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalledTimes(1), AUTOSAVE_WAIT);
    const [, version, body] = mocks.updateCatalogItem.mock.calls[0];
    expect(version).toBe(3);
    expect(body).toMatchObject({ printLayouts: ["fit_to_paper", "actual_size_centered"] });
  });

  it("leaves an unchanged set out of other saves, so a text edit opens no review", async () => {
    stubLoad(catalogItem({ printLayouts: ["fit_to_paper"] }));
    render(<ListingEditorPage />);
    await openEditorStep("About");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Plans" } });
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalledTimes(1), AUTOSAVE_WAIT);
    expect(mocks.updateCatalogItem.mock.calls[0][2]).not.toHaveProperty("printLayouts");
  });

  it("shows no layout section against an API without layouts", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);
    await openEditorStep("Artwork");
    expect(screen.queryByRole("group", { name: "Print layouts you can print" })).not.toBeInTheDocument();
  });
});

describe("listing editor prep steps", () => {
  const STEPS = [
    { id: "prep_a", title: "Flatten the art", body: "", sortOrder: 0 },
    { id: "prep_b", title: "Outline the fonts", body: "", sortOrder: 1 },
  ];

  it("moves a step only after the edit typed before it is saved, on the version that edit left", async () => {
    stubLoad(catalogItem());
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: STEPS });
    let finishSave: (() => void) | null = null;
    mocks.updateCatalogItemPrepStep.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = () => {
            // The PATCH bumps the listing to version 4.
            mocks.getCatalogItem.mockResolvedValue(catalogItem({ version: 4 }));
            mocks.listCatalogItemPrepSteps.mockResolvedValue({
              prepSteps: [{ ...STEPS[0], title: "Flatten every layer" }, STEPS[1]],
            });
            resolve({ itemVersion: 4 });
          };
        }),
    );
    mocks.reorderCatalogItemPrepSteps.mockResolvedValue({ itemVersion: 5 });
    const user = userEvent.setup();
    render(<ListingEditorPage />);
    await openEditorStep("Artwork");

    const title = await screen.findByLabelText("Step 1 title");
    await user.clear(title);
    await user.type(title, "Flatten every layer");
    // Clicking Later blurs the title first, so its save and the move leave together.
    await user.click(screen.getAllByRole("button", { name: "Later" })[0]);

    await waitFor(() =>
      expect(mocks.updateCatalogItemPrepStep).toHaveBeenCalledWith("sci_1", "prep_a", 3, {
        title: "Flatten every layer",
      }),
    );
    expect(mocks.reorderCatalogItemPrepSteps).not.toHaveBeenCalled();

    await act(async () => finishSave!());
    await waitFor(() =>
      expect(mocks.reorderCatalogItemPrepSteps).toHaveBeenCalledWith("sci_1", 4, [
        "prep_b",
        "prep_a",
      ]),
    );
  });

  it("keeps the shop's text in the box when the save meets a newer version", async () => {
    stubLoad(catalogItem());
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: STEPS });
    mocks.updateCatalogItemPrepStep
      .mockRejectedValueOnce(new ApiError(409, { error: "catalog_item_stale" }))
      .mockResolvedValueOnce({ itemVersion: 5 });
    const user = userEvent.setup();
    render(<ListingEditorPage />);
    await openEditorStep("Artwork");

    const title = await screen.findByLabelText("Step 1 title");
    await user.clear(title);
    await user.type(title, "Flatten every layer");
    // The refused save rereads the listing, which another screen moved to version 4.
    mocks.getCatalogItem.mockResolvedValue(catalogItem({ version: 4 }));
    await user.tab();

    expect(await screen.findByText(/Your text is still in the box/)).toBeVisible();
    expect(screen.getByLabelText("Step 1 title")).toHaveValue("Flatten every layer");

    await waitFor(() => expect(mocks.getCatalogItem).toHaveBeenCalledTimes(2));
    await user.click(screen.getByLabelText("Step 1 title"));
    await user.tab();
    await waitFor(() =>
      expect(mocks.updateCatalogItemPrepStep).toHaveBeenLastCalledWith("sci_1", "prep_a", 4, {
        title: "Flatten every layer",
      }),
    );
  });

  it("edits a step on the version an ordinary autosave left, without a reread", async () => {
    stubLoad(catalogItem());
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: STEPS });
    mocks.updateCatalogItemPrepStep.mockResolvedValue({ itemVersion: 5 });
    const user = userEvent.setup();
    render(<ListingEditorPage />);
    await openEditorStep("About");

    // The autosave answers version 4; nothing rereads the listing after it.
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flyers A5" } });
    expect(await screen.findByText("Saved just now", {}, AUTOSAVE_WAIT)).toBeVisible();

    await openEditorStep("Artwork");
    const title = await screen.findByLabelText("Step 1 title");
    await user.clear(title);
    await user.type(title, "Flatten every layer");
    await user.tab();

    await waitFor(() =>
      expect(mocks.updateCatalogItemPrepStep).toHaveBeenCalledWith("sci_1", "prep_a", 4, {
        title: "Flatten every layer",
      }),
    );
  }, 15_000);

  it("moves a step on the version a photo move left", async () => {
    stubLoad(
      catalogItem({
        photos: [
          { fileId: "file_1", sortOrder: 0 },
          { fileId: "file_2", sortOrder: 1 },
        ],
      }),
    );
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: STEPS });
    mocks.reorderCatalogPhotos.mockImplementation(
      async (_itemId: string, fileIds: string[], expectedVersion: number) =>
        catalogItem({
          photos: fileIds.map((fileId, sortOrder) => ({ fileId, sortOrder })),
          version: expectedVersion + 1,
        }),
    );
    mocks.reorderCatalogItemPrepSteps.mockResolvedValue({ itemVersion: 5 });
    const user = userEvent.setup();
    render(<ListingEditorPage />);
    await openEditorStep("About");

    await user.click(screen.getByRole("button", { name: "Edit Board photo" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move later" }));
    await waitFor(() =>
      expect(mocks.reorderCatalogPhotos).toHaveBeenCalledWith("sci_1", ["file_2", "file_1"], 3),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit Board photo" })).toBeEnabled(),
    );

    await openEditorStep("Artwork");
    await user.click((await screen.findAllByRole("button", { name: "Later" }))[0]);
    await waitFor(() =>
      expect(mocks.reorderCatalogItemPrepSteps).toHaveBeenCalledWith("sci_1", 4, [
        "prep_b",
        "prep_a",
      ]),
    );
  });

  it("keeps a refused edit and its warning through a move that succeeds and a tab change", async () => {
    stubLoad(catalogItem());
    let moved = false;
    mocks.listCatalogItemPrepSteps.mockImplementation(async () => ({
      prepSteps: moved
        ? [
            { ...STEPS[1], sortOrder: 0 },
            { ...STEPS[0], sortOrder: 1 },
          ]
        : STEPS,
    }));
    mocks.updateCatalogItemPrepStep
      .mockRejectedValueOnce(new ApiError(409, { error: "catalog_item_stale" }))
      .mockResolvedValueOnce({ itemVersion: 6 });
    mocks.reorderCatalogItemPrepSteps.mockImplementation(async () => {
      moved = true;
      return { itemVersion: 5 };
    });
    const user = userEvent.setup();
    render(<ListingEditorPage />);
    await openEditorStep("Artwork");

    const title = await screen.findByLabelText("Step 1 title");
    await user.clear(title);
    await user.type(title, "Flatten every layer");
    // The title save is refused; the move queued behind it goes through.
    await user.click(screen.getAllByRole("button", { name: "Later" })[0]);
    await waitFor(() => expect(mocks.reorderCatalogItemPrepSteps).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText("Step 1 title")).toHaveValue("Outline the fonts"));

    const warning = /Your text is still in the box/;
    expect(screen.getByText(warning)).toBeVisible();
    expect(screen.getByLabelText("Step 2 title")).toHaveValue("Flatten every layer");

    await openEditorStep("About");
    await openEditorStep("Artwork");
    expect(await screen.findByLabelText("Step 2 title")).toHaveValue("Flatten every layer");
    expect(screen.getByText(warning)).toBeVisible();

    // Saving that edit is what clears its warning.
    mocks.listCatalogItemPrepSteps.mockResolvedValue({
      prepSteps: [
        { ...STEPS[1], sortOrder: 0 },
        { ...STEPS[0], title: "Flatten every layer", sortOrder: 1 },
      ],
    });
    await user.click(screen.getByLabelText("Step 2 title"));
    await user.tab();
    await waitFor(() =>
      expect(mocks.updateCatalogItemPrepStep).toHaveBeenLastCalledWith("sci_1", "prep_a", 5, {
        title: "Flatten every layer",
      }),
    );
    await waitFor(() => expect(screen.queryByText(warning)).not.toBeInTheDocument());
    expect(screen.getByLabelText("Step 2 title")).toHaveValue("Flatten every layer");
  });

  it("puts back GRIDGO's text when the shop drops a refused edit", async () => {
    stubLoad(catalogItem());
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: STEPS });
    mocks.updateCatalogItemPrepStep.mockRejectedValueOnce(
      new ApiError(409, { error: "catalog_item_stale" }),
    );
    const user = userEvent.setup();
    render(<ListingEditorPage />);
    await openEditorStep("Artwork");

    const title = await screen.findByLabelText("Step 1 title");
    await user.clear(title);
    await user.type(title, "Flatten every layer");
    await user.tab();
    await user.click(await screen.findByRole("button", { name: "Put back the saved text" }));

    expect(screen.getByLabelText("Step 1 title")).toHaveValue("Flatten the art");
    expect(screen.queryByText(/Your text is still in the box/)).not.toBeInTheDocument();
    expect(mocks.updateCatalogItemPrepStep).toHaveBeenCalledTimes(1);
  });

  /** Step 1's title save is refused once, so its warning and Put back show. */
  async function refusedTitle(user: ReturnType<typeof userEvent.setup>) {
    mocks.updateCatalogItemPrepStep.mockRejectedValueOnce(
      new ApiError(409, { error: "catalog_item_stale" }),
    );
    render(<ListingEditorPage />);
    await openEditorStep("Artwork");
    const title = await screen.findByLabelText("Step 1 title");
    await user.clear(title);
    await user.type(title, "Flatten every layer");
    await user.tab();
    await screen.findByRole("button", { name: "Put back the saved text" });
    mocks.updateCatalogItemPrepStep.mockClear();
    mocks.updateCatalogItemPrepStep.mockResolvedValue({ itemVersion: 4 });
  }

  it("puts back without saving when the shop clicks it straight from the box", async () => {
    stubLoad(catalogItem());
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: STEPS });
    const user = userEvent.setup();
    await refusedTitle(user);

    // Back in the box, then straight to Put back: leaving the box is not a save.
    await user.click(screen.getByLabelText("Step 1 title"));
    await user.click(screen.getByRole("button", { name: "Put back the saved text" }));

    expect(screen.getByLabelText("Step 1 title")).toHaveValue("Flatten the art");
    expect(screen.queryByText(/Your text is still in the box/)).not.toBeInTheDocument();
    await act(async () => {});
    expect(mocks.updateCatalogItemPrepStep).not.toHaveBeenCalled();
  });

  it("puts back without saving when the shop reaches it with Tab", async () => {
    stubLoad(catalogItem());
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: STEPS });
    mocks.updateCatalogItemPrepStep.mockRejectedValueOnce(
      new ApiError(409, { error: "catalog_item_stale" }),
    );
    const user = userEvent.setup();
    render(<ListingEditorPage />);
    await openEditorStep("Artwork");

    const details = await screen.findByLabelText("Step 1 details");
    await user.type(details, "Use CMYK");
    await user.tab();
    await screen.findByRole("button", { name: "Put back the saved text" });
    mocks.updateCatalogItemPrepStep.mockClear();

    // Details, then Tab onto Put back, then Enter.
    await user.click(screen.getByLabelText("Step 1 details"));
    await user.tab();
    expect(screen.getByRole("button", { name: "Put back the saved text" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("Step 1 details")).toHaveValue("");
    await act(async () => {});
    expect(mocks.updateCatalogItemPrepStep).not.toHaveBeenCalled();
  });

  it("drops an edit still waiting in the queue when the shop puts its text back", async () => {
    stubLoad(catalogItem());
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: STEPS });
    const user = userEvent.setup();
    await refusedTitle(user);

    let finishMove!: () => void;
    mocks.reorderCatalogItemPrepSteps.mockImplementation(
      () => new Promise((resolve) => (finishMove = () => resolve({ itemVersion: 4 }))),
    );
    await user.click(screen.getAllByRole("button", { name: "Later" })[0]);
    await waitFor(() => expect(mocks.reorderCatalogItemPrepSteps).toHaveBeenCalled());

    // Leaving the box queues a save behind the move; Put back drops it before it runs.
    await user.click(screen.getByLabelText("Step 1 title"));
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Put back the saved text" }));
    await act(async () => finishMove());

    // Opening, the refused save and the move each read the steps; the dropped save sends nothing.
    await waitFor(() => expect(mocks.listCatalogItemPrepSteps).toHaveBeenCalledTimes(3));
    await act(async () => {});
    expect(mocks.updateCatalogItemPrepStep).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Flatten every layer")).not.toBeInTheDocument();
  });

  it("holds Put back while that step's save is with GRIDGO", async () => {
    stubLoad(catalogItem());
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: STEPS });
    const user = userEvent.setup();
    await refusedTitle(user);

    let finishSave!: () => void;
    mocks.updateCatalogItemPrepStep.mockImplementation(
      () => new Promise((resolve) => (finishSave = () => resolve({ itemVersion: 4 }))),
    );
    await user.click(screen.getByLabelText("Step 1 title"));
    await user.click(screen.getByLabelText("Step 1 details"));
    const held = await screen.findByRole("button", { name: "Saving your text…" });
    expect(held).toHaveAttribute("aria-disabled", "true");

    await act(async () => finishSave());
    await waitFor(() => expect(screen.queryByRole("button", { name: /Saving your text|Put back/ })).not.toBeInTheDocument());
    expect(mocks.updateCatalogItemPrepStep).toHaveBeenCalledTimes(1);
  });

  it("keeps a saved title on screen when the reread of the steps fails", async () => {
    stubLoad(catalogItem());
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: STEPS });
    mocks.updateCatalogItemPrepStep.mockImplementation(async () => {
      mocks.listCatalogItemPrepSteps.mockRejectedValue(new ApiError(503, { error: "unavailable" }));
      return { prepStep: { ...STEPS[0], title: "Flatten every layer" }, itemVersion: 4 };
    });
    const user = userEvent.setup();
    render(<ListingEditorPage />);
    await openEditorStep("Artwork");

    const title = await screen.findByLabelText("Step 1 title");
    await user.clear(title);
    await user.type(title, "Flatten every layer");
    await user.tab();

    expect(
      await screen.findByText("Could not load the preparation steps. They are not an empty list."),
    ).toBeVisible();
    expect(screen.getByLabelText("Step 1 title")).toHaveValue("Flatten every layer");
    await openEditorStep("About");
    await openEditorStep("Artwork");
    expect(await screen.findByLabelText("Step 1 title")).toHaveValue("Flatten every layer");
  });

  it("autosaves on the version a step edit left when the listing reread fails", async () => {
    stubLoad(catalogItem());
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: STEPS });
    mocks.updateCatalogItemPrepStep.mockImplementation(async () => {
      mocks.getCatalogItem.mockRejectedValue(new ApiError(503, { error: "unavailable" }));
      return { prepStep: { ...STEPS[0], title: "Flatten every layer" }, itemVersion: 4 };
    });
    const user = userEvent.setup();
    render(<ListingEditorPage />);
    await openEditorStep("Artwork");

    const title = await screen.findByLabelText("Step 1 title");
    await user.clear(title);
    await user.type(title, "Flatten every layer");
    await user.tab();
    await waitFor(() => expect(mocks.getCatalogItem).toHaveBeenCalledTimes(2));

    await openEditorStep("About");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flyers A5" } });
    await waitFor(
      () =>
        expect(mocks.updateCatalogItem).toHaveBeenCalledWith(
          "sci_1",
          4,
          expect.objectContaining({ name: "Flyers A5" }),
        ),
      AUTOSAVE_WAIT,
    );
  }, 15_000);

  it("keeps a saved step and its version when an older live read lands after the save", async () => {
    stubLoad(catalogItem());
    mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: [STEPS[0]] });
    let ping!: (event: InvalidatePing) => void;
    const live: LiveContextValue = {
      notifications: [],
      unreadCount: 0,
      snapshot: null,
      live: true,
      subscribe: (listener) => {
        ping = listener;
        return () => undefined;
      },
      markRead: async () => {},
      markAllRead: async () => {},
      remove: async () => {},
      refreshInbox: async () => {},
    };
    mocks.updateCatalogItem.mockImplementation(async (_id, version, body) => {
      if (version !== 4) throw new ApiError(409, { error: "catalog_item_stale" });
      return catalogItem({ ...body, version: 5 });
    });
    const user = userEvent.setup();
    render(
      <LiveContext.Provider value={live}>
        <ListingEditorPage />
      </LiveContext.Provider>,
    );
    await openEditorStep("Artwork");
    const title = await screen.findByLabelText("Step 1 title");

    // A live refresh has read version 3 and the old step, but waits on taxonomy.
    let finishOldRead!: (value: Taxonomy) => void;
    mocks.getTaxonomy.mockImplementationOnce(
      () => new Promise((resolve) => (finishOldRead = resolve)),
    );
    await act(async () => ping({ resource: "catalog" } as InvalidatePing));
    await waitFor(() => expect(mocks.getCatalogItem).toHaveBeenCalledTimes(2));

    // The save is stored at version 4; the reread queued behind the old read fails.
    mocks.updateCatalogItemPrepStep.mockImplementation(async () => {
      mocks.getCatalogItem.mockRejectedValueOnce(new ApiError(503, { error: "unavailable" }));
      mocks.listCatalogItemPrepSteps.mockRejectedValueOnce(
        new ApiError(503, { error: "unavailable" }),
      );
      return { prepStep: { ...STEPS[0], title: "Flatten every layer" }, itemVersion: 4 };
    });
    await user.clear(title);
    await user.type(title, "Flatten every layer");
    await user.tab();
    await waitFor(() => expect(mocks.updateCatalogItemPrepStep).toHaveBeenCalledTimes(1));
    await act(async () => {});

    await act(async () => finishOldRead(taxonomy));
    await waitFor(() => expect(mocks.getCatalogItem).toHaveBeenCalledTimes(3));
    await act(async () => {});
    expect(screen.getByLabelText("Step 1 title")).toHaveValue("Flatten every layer");

    await openEditorStep("About");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flyers A5" } });
    await waitFor(
      () =>
        expect(mocks.updateCatalogItem).toHaveBeenCalledWith(
          "sci_1",
          4,
          expect.objectContaining({ name: "Flyers A5" }),
        ),
      AUTOSAVE_WAIT,
    );
  }, 15_000);
});

describe("listing editor section numbers", () => {
  it("gives every section its own number, Print layouts included", async () => {
    stubLoad(catalogItem({ printLayouts: [] }));
    render(<ListingEditorPage />);
    const seen: string[] = [];
    for (const label of ["Pick", "About", "Price", "Speed", "Steps", "Artwork", "Review"]) {
      await openEditorStep(label);
      const panel = document.getElementById("listing-step-panel")!;
      for (const section of panel.querySelectorAll("section[id^='section-']")) {
        seen.push(section.querySelector("p")!.textContent ?? "");
      }
    }
    expect(new Set(seen).size).toBe(seen.length);
    await openEditorStep("Artwork");
    const eyebrow = (id: string) => document.getElementById(id)!.querySelector("p")!.textContent;
    expect(["section-prep", "section-artwork", "section-print-layouts"].map(eyebrow)).toEqual([
      "06.1",
      "06.2",
      "06.3",
    ]);
  });
});

// Many keystrokes and an autosave pause each: slower than the default five seconds.
describe("listing editor colour pricing (report 0BE07331)", { timeout: 30_000 }, () => {
  function documentListing(partial: Record<string, unknown> = {}) {
    return catalogItem({
      pricingUnit: "per_page",
      packageQty: null,
      printLayouts: ["fit_to_paper"],
      pricedByColour: false,
      oneColour: false,
      colourPricing: null,
      optionGroups: [
        {
          id: "grp_1",
          version: 1,
          name: "Paper",
          kind: "spec",
          required: true,
          options: [
            // The binding names the paper, as the API reads it.
            { id: "opt_20x30", label: "Whiteprint 20 by 30", priceModifierMinor: 0, sortOrder: 0, specBinding: { fieldCode: "size", value: "20x30" } },
            { id: "opt_a3", label: "A3", priceModifierMinor: 0, sortOrder: 1, specBinding: { fieldCode: "size", value: "A3" } },
            { id: "opt_note", label: "Rush", priceModifierMinor: 0, sortOrder: 2 },
          ],
        },
      ],
      ...partial,
    });
  }

  it("prices each tier per paper, leaves a blank tier not offered, and saves the table", async () => {
    stubLoad(documentListing());
    mocks.getSettings.mockResolvedValue({ version: 1, colourDetection: { minSaturationBps: 2500, minLightnessBps: 500, maxLightnessBps: 8500, a3MonochromeMaxBps: 1500 } });
    render(<ListingEditorPage />);
    await openEditorStep("Price");

    fireEvent.click(screen.getByRole("radio", { name: "Priced by colour" }));
    expect(screen.queryByLabelText("Your price")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "20x30" }));
    fireEvent.click(screen.getByRole("button", { name: "A3" }));

    const large = screen.getByRole("group", { name: "20x30 prices per sheet" });
    expect(within(large).getAllByRole("textbox")).toHaveLength(4);
    fireEvent.change(within(large).getByLabelText("No strong colour"), { target: { value: "30" } });
    fireEvent.change(within(large).getByLabelText("Up to 25%"), { target: { value: "60" } });
    fireEvent.change(within(large).getByLabelText("Above 50%"), { target: { value: "200" } });
    expect(within(large).getByLabelText("Up to 50%")).toHaveAttribute("placeholder", "Not offered");

    const a3 = screen.getByRole("group", { name: "A3 prices per sheet" });
    // The A3 limit in force is a Super Admin setting.
    fireEvent.change(await within(a3).findByLabelText("Up to 15%, monochrome"), { target: { value: "10" } });

    // Autosave may land partway through the typing; the last save carries it all.
    await waitFor(
      () =>
        expect(mocks.updateCatalogItem.mock.calls.at(-1)?.[2]?.colourPricing?.sizes?.[1]?.prices).toEqual({
          monochrome: 1000,
        }),
      AUTOSAVE_WAIT,
    );
    const body = mocks.updateCatalogItem.mock.calls.at(-1)![2];
    expect(body).not.toHaveProperty("oneColour");
    expect(body).toMatchObject({
      pricedByColour: true,
      colourPricing: {
        sizes: [
          { paperSize: "20x30", tierSet: "large_format", prices: { none: 3000, up_to_25: 6000, above_50: 20000 } },
          { paperSize: "A3", tierSet: "a3", prices: { monochrome: 1000 } },
        ],
      },
    });
    expect(body.colourPricing.sizes[0].prices).not.toHaveProperty("up_to_50");
  });

  it("holds the save while no print layout is marked, and says why", async () => {
    stubLoad(documentListing({ printLayouts: [] }));
    render(<ListingEditorPage />);
    await openEditorStep("Price");
    fireEvent.click(screen.getByRole("radio", { name: "Priced by colour" }));
    fireEvent.click(screen.getByRole("button", { name: "A3" }));
    fireEvent.change(screen.getByLabelText(/monochrome/), { target: { value: "10" } });
    expect(screen.getByText(/Pricing by colour needs at least one print layout/)).toBeVisible();
    expect(
      await screen.findByText(/keep at least one print layout/, undefined, AUTOSAVE_WAIT),
    ).toBeVisible();
    expect(mocks.updateCatalogItem).not.toHaveBeenCalled();
  });

  it("marks a fixed-price listing as one colour", async () => {
    stubLoad(documentListing());
    render(<ListingEditorPage />);
    await openEditorStep("Price");
    fireEvent.click(screen.getByRole("switch", { name: "Prints in one colour" }));
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalledTimes(1), AUTOSAVE_WAIT);
    const body = mocks.updateCatalogItem.mock.calls[0][2];
    expect(body).toMatchObject({ oneColour: true });
    expect(body).not.toHaveProperty("pricedByColour");
    expect(body).not.toHaveProperty("colourPricing");
  });

  it("turns colour pricing off when the unit leaves per page", async () => {
    stubLoad(
      documentListing({
        pricedByColour: true,
        colourPricing: { sizes: [{ paperSize: "A3", tierSet: "a3", prices: { monochrome: 1000 }, widthMilli: 297000, heightMilli: 420000 }] },
      }),
    );
    render(<ListingEditorPage />);
    await openEditorStep("Price");
    expect(screen.getByRole("radio", { name: "Priced by colour" })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(screen.getByLabelText(/monochrome/), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("radio", { name: /piece/i }));
    fireEvent.change(await screen.findByLabelText("Your price"), { target: { value: "5" } });
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalledTimes(1), AUTOSAVE_WAIT);
    const body = mocks.updateCatalogItem.mock.calls[0][2];
    expect(body).toMatchObject({ pricedByColour: false, basePriceMinor: 500 });
    expect(body).not.toHaveProperty("colourPricing");
  });

  it("never previews option add-ons on a colour-priced listing, since none apply", async () => {
    const listing = documentListing({
      pricedByColour: true,
      colourPricing: { sizes: [{ paperSize: "A3", tierSet: "a3", prices: { monochrome: 1000 }, widthMilli: 297000, heightMilli: 420000 }] },
    });
    listing.item.optionGroups[0].options[1].priceModifierMinor = 1000;
    stubLoad(listing);
    render(<ListingEditorPage />);
    await openEditorStep("Price");
    expect(screen.getByText(/whole rate for a sheet/)).toBeVisible();
    expect(screen.queryByText("+₱10.00")).not.toBeInTheDocument();
  });

  it("shows nothing about colour against an API that predates it", async () => {
    stubLoad(catalogItem({ pricingUnit: "per_page", packageQty: null }));
    render(<ListingEditorPage />);
    await openEditorStep("Price");
    expect(screen.queryByText("How each page is priced")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Prints in one colour" })).not.toBeInTheDocument();
  });
});
