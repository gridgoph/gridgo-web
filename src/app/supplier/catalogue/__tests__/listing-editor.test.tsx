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
  mocks.updateCatalogItem.mockImplementation(async (_id, _version, body) => ({
    item: { ...item.item, ...body, version: 4 },
  }));
}

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

  /** The wide sample in "What clients see". */
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

    for (const name of ["Edit wide sample", "Edit photo 2", "Edit photo 3"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
    await user.click(screen.getByRole("button", { name: "Edit wide sample" }));
    const wideItems = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(wideItems).toEqual(["Move later", "Replace photo…", "Remove photo…"]);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Edit photo 3" }));
    const lastItems = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(lastItems).toEqual([
      "Make wide sample",
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

  it("removes the wide sample, says the next photo took its place, and updates the preview", async () => {
    const user = userEvent.setup();
    stubPhotos();
    render(<ListingEditorPage />);
    await openEditorStep("About");
    await previewSample("file_1");

    await choose(user, "wide sample", "Remove photo…");
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", { name: "Remove the wide sample?" }),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Photo 2 becomes the wide sample clients see first\./),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Remove photo" }));

    await waitFor(() =>
      expect(mocks.reorderCatalogPhotos).toHaveBeenCalledWith("sci_1", ["file_2", "file_3"], 3),
    );
    expect(
      await screen.findByText("Wide sample removed. The next photo is now the wide sample."),
    ).toBeVisible();
    await previewSample("file_2");
  });

  it("does not call the API when the shop keeps the photo", async () => {
    const user = userEvent.setup();
    stubPhotos();
    render(<ListingEditorPage />);
    await openEditorStep("About");

    await choose(user, "wide sample", "Remove photo…");
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

    await choose(user, "wide sample", "Remove photo…");
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Remove the only photo?" })).toBeVisible();
    expect(within(dialog).getByText(/clients stop seeing it until you add another/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Remove photo" }));

    await waitFor(() =>
      expect(mocks.reorderCatalogPhotos).toHaveBeenCalledWith("sci_1", [], 3),
    );
    expect(await screen.findByRole("button", { name: /Add the wide sample/ })).toBeVisible();
  });

  it("makes a later photo the wide sample in one step and the preview follows", async () => {
    const user = userEvent.setup();
    stubPhotos();
    render(<ListingEditorPage />);
    await openEditorStep("About");

    await choose(user, "photo 3", "Make wide sample");

    await waitFor(() =>
      expect(mocks.reorderCatalogPhotos).toHaveBeenCalledWith(
        "sci_1",
        ["file_3", "file_1", "file_2"],
        3,
      ),
    );
    expect(await screen.findByText("Photo 3 is now the wide sample.")).toBeVisible();
    await previewSample("file_3");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit wide sample" })).toHaveFocus(),
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

    await choose(user, "wide sample", "Replace photo…");
    const picked = new File(["x"], "sharper.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Choose a replacement photo"), picked);

    await waitFor(() =>
      expect(mocks.attachCatalogItemPhoto).toHaveBeenCalledWith("file_new", "sci_1", 0, undefined),
    );
    expect(mocks.uploadCatalogItemPhoto).toHaveBeenCalledWith(picked);
    expect(mocks.reorderCatalogPhotos).not.toHaveBeenCalled();
    expect(await screen.findByText("Wide sample replaced. It kept its place.")).toBeVisible();
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
