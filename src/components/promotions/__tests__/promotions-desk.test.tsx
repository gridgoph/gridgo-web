// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { readAdminPromotions } from "@/lib/api/promotions";
import { rawPromotions } from "@/test/promotions";

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/promotions",
  useRouter: () => ({ replace: vi.fn() }),
}));
const { getAdminPromotions, updateAdminPromotions } = vi.hoisted(() => ({
  getAdminPromotions: vi.fn(),
  updateAdminPromotions: vi.fn(),
}));
vi.mock("@/lib/api/promotions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/promotions")>()),
  getAdminPromotions,
  updateAdminPromotions,
}));
const { PromotionsDesk } = await import("@/components/promotions/PromotionsDesk");

const fresh = () => readAdminPromotions(rawPromotions());
const founding = () => within(screen.getByRole("region", { name: "Founding 30" }));
const loaded = async () => within(await screen.findByRole("region", { name: "Founding 30" }));
const saveButton = () => screen.queryByRole("button", { name: "Save changes" });

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("Super Admin", () => {
  it("shows the seats, the budget and both tables' counts", async () => {
    getAdminPromotions.mockResolvedValue(fresh());
    render(<PromotionsDesk tree="admin" />);
    expect(await screen.findByRole("img", { name: /30 slots: 1 used, 1 claimed/ })).toBeInTheDocument();
    expect(founding().getByText("Open to claim")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /₱500\.00 committed of a ₱9,000\.00 cap/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Founding claims (2)" })).toBeInTheDocument();
    expect(screen.getAllByText("Ven Cruz").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Open order" })[0]).toHaveAttribute(
      "href",
      "/admin/orders/ord_1",
    );
  });

  it("says beside the amounts that changes apply to new claims only", async () => {
    getAdminPromotions.mockResolvedValue(fresh());
    render(<PromotionsDesk tree="admin" />);
    const card = await loaded();
    expect(card.getByText(/Applies to new claims only/)).toBeInTheDocument();
  });

  it("saves only what changed, in centavos, with the version it read", async () => {
    getAdminPromotions.mockResolvedValue(fresh());
    const saved = readAdminPromotions(
      rawPromotions({ version: 4, settings: { ...rawPromotions().settings, budgetCapMinor: 1000000 } }),
    );
    updateAdminPromotions.mockResolvedValue(saved);
    render(<PromotionsDesk tree="admin" />);
    const cap = await screen.findByLabelText("Cap (pesos)");
    expect(saveButton()).toBeNull();
    fireEvent.change(cap, { target: { value: "10000" } });
    expect(screen.getByText("Budget cap ₱9,000.00 to ₱10,000.00")).toBeInTheDocument();
    fireEvent.click(saveButton()!);
    await waitFor(() => expect(updateAdminPromotions).toHaveBeenCalledTimes(1));
    expect(updateAdminPromotions).toHaveBeenCalledWith(
      { budgetCapMinor: 1000000 },
      3,
      "Launch promotions: Budget cap ₱9,000.00 to ₱10,000.00",
    );
    expect(await screen.findByText(/Saved 1 change/)).toBeInTheDocument();
    expect(screen.getByLabelText("Cap (pesos)")).toHaveValue("10000");
  });

  it("will not save a zero amount or an end before the start", async () => {
    getAdminPromotions.mockResolvedValue(fresh());
    render(<PromotionsDesk tree="admin" />);
    fireEvent.change((await loaded()).getByLabelText("Amount (pesos)"), { target: { value: "0" } });
    expect(founding().getByText("Enter an amount above ₱0.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.change(founding().getByLabelText("Amount (pesos)"), { target: { value: "200" } });
    fireEvent.change(founding().getByLabelText("Ends (Philippine time)"), {
      target: { value: "2026-10-26T08:00" },
    });
    expect(founding().getByText("End after the start.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(updateAdminPromotions).not.toHaveBeenCalled();
  });

  it("explains a version conflict and reloads, dropping the stale edit", async () => {
    getAdminPromotions.mockResolvedValueOnce(fresh());
    updateAdminPromotions.mockRejectedValue(new ApiError(409, { error: "settings_version_conflict" }));
    render(<PromotionsDesk tree="admin" />);
    fireEvent.change((await loaded()).getByLabelText("Amount (pesos)"), { target: { value: "250" } });
    fireEvent.click(saveButton()!);
    expect(await screen.findByText(/Someone else changed these promotions/)).toBeInTheDocument();
    expect(founding().getByLabelText("Amount (pesos)")).toBeDisabled();

    const theirs = readAdminPromotions(
      rawPromotions({
        version: 5,
        settings: {
          ...rawPromotions().settings,
          founding: { ...rawPromotions().settings.founding, amountMinor: 30000 },
        },
      }),
    );
    getAdminPromotions.mockResolvedValueOnce(theirs);
    fireEvent.click(screen.getByRole("button", { name: "Reload promotions" }));
    await waitFor(() => expect(founding().getByLabelText("Amount (pesos)")).toHaveValue("300"));
    expect(founding().getByLabelText("Amount (pesos)")).toBeEnabled();
    expect(screen.queryByText(/Someone else changed these promotions/)).toBeNull();
    expect(saveButton()).toBeNull();
  });

  it("shows a load failure with a way to retry", async () => {
    getAdminPromotions.mockRejectedValueOnce(new ApiError(500, { error: "internal" }));
    render(<PromotionsDesk tree="admin" />);
    expect(await screen.findByText("Promotions could not be loaded")).toBeInTheDocument();
    getAdminPromotions.mockResolvedValueOnce(fresh());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Founding 30" })).toBeInTheDocument();
  });
});

describe("Operations", () => {
  it("reads every figure with no way to change them", async () => {
    getAdminPromotions.mockResolvedValue(fresh());
    render(<PromotionsDesk tree="ops" />);
    expect(await screen.findByText("Read only")).toBeInTheDocument();
    expect(founding().getByText("₱200.00")).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByRole("searchbox", { name: "Search claims" })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(saveButton()).toBeNull();
    expect(screen.getAllByRole("link", { name: "Open order" })[0]).toHaveAttribute(
      "href",
      "/ops/orders/ord_1",
    );
  });
});
