// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";
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
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
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
  };
});

import ListingEditorPage from "@/app/supplier/catalogue/[id]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
  mocks.updateCatalogItem.mockImplementation(async (_id, _version, body) => ({
    item: { ...item.item, ...body, version: 4 },
  }));
}

describe("listing editor printer cap", () => {
  it("hides max printer width on families that are not tarpaulin", async () => {
    stubLoad(catalogItem());
    render(<ListingEditorPage />);

    expect(await screen.findByLabelText("Name")).toHaveValue("Flyers");
    expect(screen.queryByLabelText("Max printer width")).not.toBeInTheDocument();
    expect(screen.queryByText(/^feet$/)).not.toBeInTheDocument();
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
    expect(
      screen.getAllByText("Set the max printer width in feet before it can go on the board.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Put it on the board" })[0],
    ).toBeDisabled();
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
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalled());
    const tarpBody = mocks.updateCatalogItem.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(tarpBody).toMatchObject({ printerMaxWidthFeet: 5 });
    expect(Object.keys(tarpBody)).toContain("printerMaxWidthFeet");
    expect(tarpBody.printerMaxWidthFeet).not.toBeUndefined();

    await user.click(screen.getByRole("button", { name: "Flyers" }));
    expect(screen.queryByLabelText("Max printer width")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalledTimes(2));
    const flyersBody = mocks.updateCatalogItem.mock.calls[1]?.[2] as Record<string, unknown>;
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
  const live: LiveContextValue = {notifications:[],unreadCount:0,snapshot:null,live:true,
    subscribe: next => {listener=next;return () => undefined;},
    markRead:async()=>{},markAllRead:async()=>{},remove:async()=>{},refreshInbox:async()=>{}};
  render(<LiveContext.Provider value={live}><ListingEditorPage/></LiveContext.Provider>);
  expect(await screen.findByLabelText("Name")).toHaveValue("Flyers");
  fireEvent.change(screen.getByLabelText("Name"),{target:{value:"My unsaved draft"}});
  mocks.getCatalogItem.mockResolvedValue(catalogItem({name:"Remote edit",basePriceMinor:50000,version:4}));
  await act(async()=>{listener({resource:"catalog"});});
  await waitFor(()=>expect(mocks.getCatalogItem).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("Name")).toHaveValue("My unsaved draft");
  mocks.updateCatalogItem.mockRejectedValueOnce(new ApiError(409, { error: "version_conflict" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
  await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalledWith(
    "sci_1", 3, expect.objectContaining({ name: "My unsaved draft", basePriceMinor: 40000 }),
  ));
  expect(screen.getByLabelText("Name")).toHaveValue("My unsaved draft");
});


it.each([true, false])("keeps option price ownership across refresh (edited: %s)", async edited => {
  stubLoad(catalogItem());
  let listener!: (ping: InvalidatePing) => void;
  const live: LiveContextValue = {
    notifications: [], unreadCount: 0, snapshot: null, live: true,
    subscribe: next => { listener = next; return () => undefined; },
    markRead: async () => {}, markAllRead: async () => {},
    remove: async () => {}, refreshInbox: async () => {},
  };
  render(<LiveContext.Provider value={live}><ListingEditorPage /></LiveContext.Provider>);
  const price = await screen.findByLabelText("A5 extra pesos");
  if (edited) fireEvent.change(price, { target: { value: "12.50" } });
  const remote = catalogItem();
  remote.item.optionGroups[0].version = 2;
  remote.item.optionGroups[0].options[0].priceModifierMinor = 2000;
  mocks.getCatalogItem.mockResolvedValue(remote);
  await act(async () => { listener({ resource: "catalog" }); });
  await waitFor(() => expect(mocks.getCatalogItem).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(price).toHaveValue(edited ? "12.50" : "20.00"));
  if (!edited) fireEvent.change(price, { target: { value: "12.50" } });
  mocks.updateCatalogOption.mockRejectedValueOnce(new ApiError(409, { error: "version_conflict" }));
  fireEvent.blur(price);
  await waitFor(() => expect(mocks.updateCatalogOption).toHaveBeenCalledWith(
    "grp_1", "opt_a", edited ? 1 : 2, { priceModifierMinor: 1250 },
  ));
  expect(price).toHaveValue("12.50");
});


function renderLiveListing() {
  stubLoad(catalogItem());
  let listener!: (ping: InvalidatePing) => void;
  const live: LiveContextValue = {
    notifications: [], unreadCount: 0, snapshot: null, live: true,
    subscribe: next => { listener = next; return () => undefined; },
    markRead: async () => {}, markAllRead: async () => {},
    remove: async () => {}, refreshInbox: async () => {},
  };
  render(<LiveContext.Provider value={live}><ListingEditorPage /></LiveContext.Provider>);
  return async () => {
    const calls = mocks.getTaxonomy.mock.calls.length;
    await act(async () => { listener({ resource: "catalog" }); });
    await waitFor(() => expect(mocks.getTaxonomy).toHaveBeenCalledTimes(calls + 1));
  };
}

it("retains an option price draft and its version through transient failure and recovery", async () => {
  const ping = renderLiveListing();
  const price = await screen.findByLabelText("A5 extra pesos");
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
  mocks.updateCatalogOption.mockRejectedValueOnce(new ApiError(409, { error: "version_conflict" }));
  fireEvent.blur(price);
  await waitFor(() => expect(mocks.updateCatalogOption).toHaveBeenCalledWith(
    "grp_1", "opt_a", 1, { priceModifierMinor: 1250 },
  ));
});

it.each([401, 403, 404])("clears the loaded listing on HTTP %s and keeps it hidden during a failed retry", async status => {
  const ping = renderLiveListing();
  const price = await screen.findByLabelText("A5 extra pesos");
  fireEvent.change(price, { target: { value: "12.50" } });
  mocks.getTaxonomy.mockRejectedValueOnce(new ApiError(status, {
    error: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "not_found",
  }));
  await ping();
  expect(await screen.findByText("This listing could not open")).toBeVisible();
  expect(screen.queryByLabelText("A5 extra pesos")).not.toBeInTheDocument();

  mocks.getTaxonomy.mockRejectedValueOnce(new TypeError("Offline"));
  await ping();
  expect(screen.getByText("This listing could not open")).toBeVisible();
  expect(screen.queryByLabelText("A5 extra pesos")).not.toBeInTheDocument();

  await ping();
  expect(await screen.findByLabelText("A5 extra pesos")).toHaveValue("0.00");
});

it("shows a recoverable error when the initial listing load fails", async () => {
  stubLoad(catalogItem());
  mocks.getTaxonomy.mockRejectedValueOnce(new TypeError("Offline"));
  render(<ListingEditorPage />);
  expect(await screen.findByText("This listing could not open")).toBeVisible();
  expect(screen.queryByLabelText("A5 extra pesos")).not.toBeInTheDocument();
});
