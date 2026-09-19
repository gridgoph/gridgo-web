// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { orderRows } from "@/app/ops/rankings/_lib/rankings";
import OpsRankingsPage from "@/app/ops/rankings/page";
import { setTokenProvider } from "@/lib/api/client";
import type { ShopRankingRow, ShopRankings } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

function row(
  supplierId: string,
  shopName: string,
  p: Partial<ShopRankingRow> = {},
): ShopRankingRow {
  return {
    supplierId,
    shopName,
    position: null,
    count: 0,
    quality: null,
    speed: null,
    value: null,
    overall: null,
    onTime: null,
    fromPriceMinor: null,
    ...p,
  };
}

const table: ShopRankings = {
  categories: [{ code: "marketing_collateral", name: "Marketing collateral" }],
  categoryCode: null,
  rankedCount: 2,
  rows: [
    row("s_a", "Lovis Print", {
      position: 1,
      count: 5,
      quality: 4.8,
      speed: 4.2,
      value: 3.9,
      overall: 4.3,
      onTime: { count: 6, rate: 0.5 },
    }),
    row("s_b", "Davao Copy Centre", {
      position: 2,
      count: 3,
      quality: 4.0,
      speed: 3.5,
      value: 4.9,
      overall: 4.13,
      onTime: { count: 3, rate: 1 },
    }),
    row("s_c", "Quiet Press"),
  ],
};

beforeEach(() => {
  vi.stubGlobal("React", React);
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/admin/shop-rankings")) {
        return new Response(JSON.stringify(table), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ops shop rankings", () => {
  it("lists every shop with its rank, and leaves an unrated shop unranked rather than last", async () => {
    render(<OpsRankingsPage />);

    expect(await screen.findByText("Lovis Print")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("Quiet Press")).toBeInTheDocument();
    expect(screen.getByText("Not yet rated")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 shops rated")).toBeInTheDocument();
    // Price is meaningless across all work, so the column is not offered.
    expect(screen.queryByRole("button", { name: "Sort by from price" })).not.toBeInTheDocument();
  });

  it("reorders by a column without moving the rank numbers", async () => {
    render(<OpsRankingsPage />);
    await screen.findByText("Lovis Print");

    fireEvent.click(screen.getByRole("button", { name: "Sort by value" }));

    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((tr) => tr.textContent ?? "");
    expect(names[0]).toContain("Davao Copy Centre");
    expect(names[0]).toContain("#2");
    expect(names[1]).toContain("Lovis Print");
    expect(names[2]).toContain("Quiet Press");
  });
});

describe("ordering rows", () => {
  it("sorts price low first and keeps shops without one at the end", () => {
    const ordered = orderRows(
      [
        row("a", "A", { position: 1, count: 2, overall: 4.5, fromPriceMinor: 30000 }),
        row("b", "B", { position: 2, count: 2, overall: 4.0, fromPriceMinor: 10000 }),
        row("c", "C", { position: 3, count: 1, overall: 3.0, fromPriceMinor: null }),
      ],
      "price",
    ).map((r) => r.supplierId);
    expect(ordered).toEqual(["b", "a", "c"]);
  });
});
