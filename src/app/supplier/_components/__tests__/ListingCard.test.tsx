// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListingCard } from "@/app/supplier/_components/ListingCard";
import { normalizeListing } from "@/lib/listings";

vi.stubGlobal("React", React);

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

afterEach(() => {
  cleanup();
});

function listing(partial: Record<string, unknown> = {}) {
  return normalizeListing({
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
    photos: [],
    optionGroups: [],
    ...partial,
  })!;
}

describe("ListingCard printer cap", () => {
  it("shows max printer width in feet when the listing has a cap", () => {
    render(
      <ListingCard
        listing={listing({
          subcategoryCode: "tarpaulins_outdoor_banners",
          name: "Storefront tarpaulin",
          printerMaxWidthFeet: 5,
        })}
        taxonomy={null}
        services={[]}
        shopApproved
      />,
    );
    expect(screen.getByText("Max printer width 5 feet")).toBeVisible();
  });

  it("does not invent a cap on other families", () => {
    render(
      <ListingCard listing={listing()} taxonomy={null} services={[]} shopApproved />,
    );
    expect(screen.queryByText(/Max printer width/)).not.toBeInTheDocument();
  });
});
