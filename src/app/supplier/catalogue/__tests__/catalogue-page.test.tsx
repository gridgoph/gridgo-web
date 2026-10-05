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
});
