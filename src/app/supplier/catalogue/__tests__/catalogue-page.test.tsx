// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Taxonomy } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  listCatalogItems: vi.fn(),
  listMySupplierServices: vi.fn(),
  getTaxonomy: vi.fn(),
  getSupplierReadiness: vi.fn(),
  getFileDownloadUrl: vi.fn(),
  updateCatalogItem: vi.fn(),
  submitCatalogItemForReview: vi.fn(),
  listCatalogItemPrepSteps: vi.fn(),
  listAcceptedFileFormats: vi.fn(),
}));

vi.stubGlobal("React", React);

class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { verificationStatus: "approved" } }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...mocks };
});

import SupplierCataloguesPage from "@/app/supplier/catalogue/page";
import { CHANGES_IN_REVIEW_NOTE } from "@/lib/listings";

const taxonomy: Taxonomy = {
  categories: [],
  materials: [],
  finishes: [],
  subcategories: [
    {
      id: "job_flyers",
      code: "flyers",
      categoryCode: "marketing",
      name: "Flyers",
      active: true,
    },
  ],
} as Taxonomy;

function item(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    supplierServiceId: "svc_1",
    subcategoryCode: "flyers",
    name,
    description: "Printed.",
    basePriceMinor: 40000,
    pricingUnit: "per_unit",
    turnaroundMode: "inherit",
    fileFormatMode: "inherit",
    active: true,
    reviewStatus: "approved",
    hasApprovedVersion: true,
    photos: [{ fileId: `file_${id}`, sortOrder: 0 }],
    optionGroups: [
      {
        id: `grp_${id}`,
        name: "Size",
        kind: "spec",
        required: true,
        options: [{ id: `opt_${id}`, label: "A5", priceModifierMinor: 0 }],
      },
    ],
    version: 1,
    ...overrides,
  };
}

const step = (code: string, message: string) => ({
  code,
  message,
  action: "edit_listing",
});

beforeEach(() => {
  // Two pages: the board is read whole before standings are counted.
  mocks.listCatalogItems.mockImplementation(
    async ({ cursor }: { cursor?: string | null }) =>
      cursor
        ? {
            items: [
              item("taken", "Taken flyers", {
                active: false,
                suspendReason: "Blurry sample",
              }),
              item("unready", "Unready flyers"),
            ],
            total: 6,
          }
        : {
            items: [
              item("live", "Live flyers"),
              item("pending", "New flyers", {
                reviewStatus: "pending",
                hasApprovedVersion: false,
              }),
              item("back", "Sent-back flyers", {
                reviewStatus: "needs_revision",
                reviewReason: "Replace photo 1.",
              }),
              item("hidden", "Hidden flyers", { active: false }),
            ],
            total: 6,
            nextCursor: "page2",
          },
  );
  mocks.listMySupplierServices.mockResolvedValue({
    services: [
      {
        id: "svc_1",
        categoryCode: "marketing",
        state: "live",
        turnaroundHours: 48,
        formatCodes: ["pdf"],
      },
    ],
  });
  mocks.getTaxonomy.mockResolvedValue(taxonomy);
  mocks.getFileDownloadUrl.mockResolvedValue("https://files.test/x");
  mocks.updateCatalogItem.mockResolvedValue({ item: item("live", "Live flyers") });
  mocks.submitCatalogItemForReview.mockResolvedValue({});
  mocks.listCatalogItemPrepSteps.mockResolvedValue({ prepSteps: [] });
  mocks.listAcceptedFileFormats.mockResolvedValue([
    { code: "pdf", displayName: "PDF", inputKind: "file", uploadable: true },
  ]);
  mocks.getSupplierReadiness.mockResolvedValue({
    operational: {
      ready: true,
      missing: [],
      listings: [
        { catalogItemId: "live", ready: true, missing: [] },
        {
          catalogItemId: "pending",
          ready: false,
          missing: [
            step("listing_not_approved", "Operations must approve this listing."),
          ],
        },
        {
          catalogItemId: "back",
          ready: false,
          missing: [
            step("listing_not_approved", "Operations must approve this listing."),
          ],
        },
        {
          catalogItemId: "hidden",
          ready: false,
          missing: [step("item_inactive", "This listing is hidden.")],
        },
        {
          catalogItemId: "taken",
          ready: false,
          missing: [step("item_inactive", "This listing is hidden.")],
        },
        {
          catalogItemId: "unready",
          ready: false,
          missing: [
            step(
              "service_not_live",
              "The parent service line is not live. Operations must approve or restore it before this listing can match.",
            ),
          ],
        },
      ],
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function card(name: string): HTMLElement {
  const title = screen.getByText(name);
  return title.closest(".rounded-card") as HTMLElement;
}

describe("supplier Catalogues standings (gridgo-web#111)", () => {
  it("labels every listing the way the supplier app does, Live included", async () => {
    render(<SupplierCataloguesPage />);
    expect(await screen.findByText("Live flyers")).toBeVisible();
    expect(mocks.listCatalogItems).toHaveBeenCalledTimes(2);
    expect(mocks.listCatalogItems.mock.calls[0][0]).not.toHaveProperty("active");
    expect(within(card("Live flyers")).getByText("Live")).toBeVisible();
    expect(within(card("New flyers")).getByText("Pending review")).toBeVisible();
    expect(within(card("Sent-back flyers")).getByText("Needs changes")).toBeVisible();
    expect(within(card("Sent-back flyers")).getByText("Replace photo 1.")).toBeVisible();
    expect(within(card("Hidden flyers")).getByText("Hidden by you")).toBeVisible();
    expect(within(card("Taken flyers")).getByText("Taken down by GRIDGO")).toBeVisible();
    expect(within(card("Unready flyers")).getByText("Not ready yet")).toBeVisible();
    expect(
      within(card("Unready flyers")).getByText(/parent service line is not live/),
    ).toBeVisible();
    const order = [
      "Sent-back flyers",
      "New flyers",
      "Live flyers",
      "Hidden flyers",
      "Taken flyers",
      "Unready flyers",
    ].map((name) => (document.body.textContent ?? "").indexOf(name));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
  });

  it("filters by standing with a count on each choice", async () => {
    const user = userEvent.setup();
    render(<SupplierCataloguesPage />);
    await screen.findByText("Live flyers");
    for (const name of [
      "All · 6",
      "Live · 1",
      "Pending review · 1",
      "Needs changes · 1",
      "Hidden by you · 1",
      "Taken down by GRIDGO · 1",
      "Not ready yet · 1",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    await user.click(screen.getByRole("button", { name: "Hidden by you · 1" }));
    await waitFor(() => expect(screen.queryByText("Live flyers")).toBeNull());
    expect(screen.getByText("Hidden flyers")).toBeVisible();
    expect(screen.getByText("1 of 6 listings.")).toBeVisible();
    // The cut is applied to the board already read; nothing new is asked for.
    expect(mocks.listCatalogItems).toHaveBeenCalledTimes(2);
  });

  it("falls back to the board's own checklist when readiness cannot be read", async () => {
    mocks.getSupplierReadiness.mockRejectedValue(new Error("offline"));
    render(<SupplierCataloguesPage />);
    expect(await screen.findByText("Live flyers")).toBeVisible();
    expect(within(card("Live flyers")).getByText("Live")).toBeVisible();
    expect(within(card("Unready flyers")).getByText("Live")).toBeVisible();
    expect(within(card("Hidden flyers")).getByText("Hidden by you")).toBeVisible();
  });

  it("leaves a status with nothing in it out of the row and the phone select", async () => {
    const user = userEvent.setup();
    mocks.listCatalogItems.mockResolvedValue({
      items: [item("live", "Live flyers")],
      total: 1,
    });
    mocks.getSupplierReadiness.mockResolvedValue({
      operational: {
        ready: true,
        missing: [],
        listings: [{ catalogItemId: "live", ready: true, missing: [] }],
      },
    });
    render(<SupplierCataloguesPage />);
    expect(await screen.findByText("Live flyers")).toBeVisible();
    expect(screen.getByRole("button", { name: "All · 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Live · 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /· 0/ })).toBeNull();
    for (const label of [
      "Pending review",
      "Needs changes",
      "Hidden by you",
      "Taken down by GRIDGO",
      "Not ready yet",
    ]) {
      expect(screen.queryByRole("button", { name: new RegExp(label) })).toBeNull();
    }
    await user.click(screen.getByRole("combobox", { name: "Show listings by status" }));
    expect(await screen.findByRole("option", { name: "All · 1" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Live · 1" })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Pending review/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /· 0/ })).toBeNull();
  });

  it("keeps a live edit in review to one status line", async () => {
    mocks.listCatalogItems.mockResolvedValue({
      items: [
        item("revised", "Revised flyers", {
          reviewStatus: "pending",
          hasApprovedVersion: true,
        }),
      ],
      total: 1,
    });
    mocks.getSupplierReadiness.mockResolvedValue({
      operational: {
        ready: true,
        missing: [],
        listings: [{ catalogItemId: "revised", ready: true, missing: [] }],
      },
    });
    render(<SupplierCataloguesPage />);
    expect(await screen.findByText("Revised flyers")).toBeVisible();
    const tile = card("Revised flyers");
    const line = within(tile).getByText("Live").closest("[data-status-line]");
    expect(line).toHaveTextContent("Live");
    expect(line).toHaveTextContent(CHANGES_IN_REVIEW_NOTE);
    expect(within(tile).getByText(CHANGES_IN_REVIEW_NOTE)).toBeVisible();
    expect(within(tile).queryByText("Changes in review")).not.toBeInTheDocument();
    expect(within(tile).getAllByRole("status")).toHaveLength(1);
    expect(within(tile).getByText("₱400.00 per piece")).toBeVisible();
    expect(within(tile).getByText("Ready in 2 days")).toBeVisible();
  });

  it("edits, hides, and previews from the card without a review or a take-down clear", async () => {
    const user = userEvent.setup();
    render(<SupplierCataloguesPage />);
    expect(await screen.findByText("Live flyers")).toBeVisible();

    expect(within(card("Live flyers")).getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/supplier/catalogue/live",
    );
    expect(within(card("Hidden flyers")).getByRole("button", { name: "Put it back" })).toBeEnabled();
    expect(within(card("Taken flyers")).getByRole("button", { name: "Hide" })).toBeDisabled();
    await user.click(within(card("Taken flyers")).getByRole("button", { name: "Hide" }));
    expect(mocks.updateCatalogItem).not.toHaveBeenCalled();
    expect(mocks.submitCatalogItemForReview).not.toHaveBeenCalled();

    mocks.getSupplierReadiness.mockResolvedValue({
      operational: {
        ready: true,
        missing: [],
        listings: [
          {
            catalogItemId: "live",
            ready: false,
            missing: [step("item_inactive", "This listing is hidden.")],
          },
          {
            catalogItemId: "pending",
            ready: false,
            missing: [step("listing_not_approved", "Operations must approve this listing.")],
          },
          {
            catalogItemId: "back",
            ready: false,
            missing: [step("listing_not_approved", "Operations must approve this listing.")],
          },
          {
            catalogItemId: "hidden",
            ready: false,
            missing: [step("item_inactive", "This listing is hidden.")],
          },
          {
            catalogItemId: "taken",
            ready: false,
            missing: [step("item_inactive", "This listing is hidden.")],
          },
          {
            catalogItemId: "unready",
            ready: false,
            missing: [
              step(
                "service_not_live",
                "The parent service line is not live. Operations must approve or restore it before this listing can match.",
              ),
            ],
          },
        ],
      },
    });
    mocks.updateCatalogItem.mockResolvedValue({
      item: item("live", "Live flyers", { active: false, version: 2 }),
    });
    await user.click(within(card("Live flyers")).getByRole("button", { name: "Hide" }));
    await waitFor(() =>
      expect(within(card("Live flyers")).getByText("Hidden by you")).toBeVisible(),
    );
    expect(mocks.updateCatalogItem).toHaveBeenCalledTimes(1);
    expect(mocks.updateCatalogItem).toHaveBeenCalledWith("live", 1, { active: false });
    expect(mocks.submitCatalogItemForReview).not.toHaveBeenCalled();

    mocks.updateCatalogItem.mockResolvedValue({
      item: item("live", "Live flyers", { active: true, version: 3 }),
    });
    await user.click(within(card("Live flyers")).getByRole("button", { name: "Put it back" }));
    await waitFor(() => expect(mocks.updateCatalogItem).toHaveBeenCalledTimes(2));
    expect(mocks.updateCatalogItem).toHaveBeenLastCalledWith("live", 2, { active: true });
    expect(mocks.submitCatalogItemForReview).not.toHaveBeenCalled();

    await user.click(within(card("Live flyers")).getByRole("button", { name: "View as client" }));
    expect(await screen.findByTestId("listing-preview")).toBeVisible();
    expect(screen.getByRole("heading", { name: "What clients see" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /catalog\/items/ })).toBeNull();
  });
});
