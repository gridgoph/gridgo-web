// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  vi.useRealTimers();
});

const at = (version: number, amountMinor: number, extra: Record<string, unknown> = {}) => {
  const raw = rawPromotions();
  return readAdminPromotions({
    ...raw,
    version,
    settings: { ...raw.settings, founding: { ...raw.settings.founding, amountMinor } },
    ...extra,
  });
};

async function conflictAt250() {
  getAdminPromotions.mockResolvedValueOnce(fresh());
  updateAdminPromotions.mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }));
  render(<PromotionsDesk tree="admin" />);
  fireEvent.change((await loaded()).getByLabelText("Amount (pesos)"), { target: { value: "250" } });
  fireEvent.click(saveButton()!);
  await screen.findByText(/Someone else changed these promotions/);
}

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
    expect(screen.getByText("Fix Founding amount to save.")).toBeInTheDocument();
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

  it("searches claims by name or email", async () => {
    getAdminPromotions.mockResolvedValue(fresh());
    render(<PromotionsDesk tree="admin" />);
    const search = await screen.findByRole("searchbox", { name: "Search by name or email" });
    fireEvent.change(search, { target: { value: "ana@example" } });
    await waitFor(() => expect(screen.queryAllByText("Ven Cruz")).toHaveLength(0));
    expect(screen.getAllByText("Ana Reyes").length).toBeGreaterThan(0);
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

describe("after a save conflict", () => {
  it("keeps the lock and the stale edit when the reload fails, and retries", async () => {
    await conflictAt250();
    getAdminPromotions.mockRejectedValueOnce(new ApiError(500, { error: "internal" }));
    fireEvent.click(screen.getByRole("button", { name: "Reload promotions" }));
    expect(await screen.findByText("The service had a problem. Try again in a moment.")).toBeInTheDocument();
    expect(screen.getByText(/Someone else changed these promotions/)).toBeInTheDocument();
    expect(founding().getByLabelText("Amount (pesos)")).toBeDisabled();
    expect(founding().getByLabelText("Amount (pesos)")).toHaveValue("250");
    expect(saveButton()).toBeNull();

    getAdminPromotions.mockResolvedValueOnce(at(5, 30000));
    fireEvent.click(screen.getByRole("button", { name: "Try reloading again" }));
    await waitFor(() => expect(founding().getByLabelText("Amount (pesos)")).toHaveValue("300"));
    expect(founding().getByLabelText("Amount (pesos)")).toBeEnabled();

    updateAdminPromotions.mockResolvedValueOnce(at(6, 35000));
    fireEvent.change(founding().getByLabelText("Amount (pesos)"), { target: { value: "350" } });
    fireEvent.click(saveButton()!);
    await waitFor(() => expect(updateAdminPromotions).toHaveBeenCalledTimes(2));
    expect(updateAdminPromotions.mock.calls[1]?.[1]).toBe(5);
  });

  it("stays locked while the reload is still on its way", async () => {
    await conflictAt250();
    let answer!: (value: ReturnType<typeof fresh>) => void;
    getAdminPromotions.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    fireEvent.click(screen.getByRole("button", { name: "Reload promotions" }));
    expect(await screen.findByRole("button", { name: "Reloading…" })).toBeDisabled();
    expect(founding().getByLabelText("Amount (pesos)")).toBeDisabled();
    expect(screen.getByText(/Someone else changed these promotions/)).toBeInTheDocument();

    await act(async () => answer(at(5, 30000)));
    await waitFor(() => expect(founding().getByLabelText("Amount (pesos)")).toBeEnabled());
    expect(founding().getByLabelText("Amount (pesos)")).toHaveValue("300");
    expect(screen.queryByText(/Someone else changed these promotions/)).toBeNull();
  });
});

describe("during a visit", () => {
  const withClaims = (available: number, remainingMinor: number) => {
    const raw = rawPromotions();
    return readAdminPromotions({
      ...raw,
      founding: { ...raw.founding, available, claimed: 30 - available },
      budget: { ...raw.budget, remainingMinor },
    });
  };

  it("re-reads on Refresh and shows the new counts", async () => {
    getAdminPromotions.mockResolvedValueOnce(fresh()).mockResolvedValueOnce(withClaims(0, 850000));
    render(<PromotionsDesk tree="ops" />);
    expect((await loaded()).getByText("Open to claim")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await founding().findByText("All slots taken")).toBeInTheDocument();
    expect(getAdminPromotions).toHaveBeenCalledTimes(2);
  });

  it("re-reads when the window regains focus or the tab becomes visible", async () => {
    getAdminPromotions
      .mockResolvedValueOnce(fresh())
      .mockResolvedValueOnce(withClaims(0, 850000))
      .mockResolvedValueOnce(withClaims(0, 0));
    render(<PromotionsDesk tree="ops" />);
    await loaded();
    await act(async () => void window.dispatchEvent(new Event("focus")));
    expect(await founding().findByText("All slots taken")).toBeInTheDocument();
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(getAdminPromotions).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("Cap reached")).toBeInTheDocument();
  });

  it("keeps the last figures when a refresh fails, and says so", async () => {
    getAdminPromotions
      .mockResolvedValueOnce(fresh())
      .mockRejectedValueOnce(new ApiError(503, { error: "unavailable" }));
    render(<PromotionsDesk tree="ops" />);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Could not refresh")).toBeInTheDocument();
    expect(founding().getByText("Open to claim")).toBeInTheDocument();
  });

  it("keeps an edit on the version it started from when someone else saves", async () => {
    getAdminPromotions.mockResolvedValueOnce(fresh()).mockResolvedValueOnce(at(4, 30000));
    updateAdminPromotions.mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }));
    render(<PromotionsDesk tree="admin" />);
    fireEvent.change((await loaded()).getByLabelText("Amount (pesos)"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/Someone else saved these promotions while you were editing/)).toBeInTheDocument();
    expect(founding().getByLabelText("Amount (pesos)")).toHaveValue("250");
    expect(screen.getByText("Founding amount ₱200.00 to ₱250.00")).toBeInTheDocument();
    fireEvent.click(saveButton()!);
    await waitFor(() => expect(updateAdminPromotions).toHaveBeenCalledTimes(1));
    expect(updateAdminPromotions.mock.calls[0]?.[1]).toBe(3);
  });

  it("moves the clock on, so the status changes at the end time", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse("2026-11-08T15:59:58.000Z") });
    getAdminPromotions
      .mockImplementationOnce(async () =>
        readAdminPromotions(rawPromotions({ serverTime: new Date(Date.now()).toISOString() })),
      )
      .mockRejectedValue(new ApiError(503, { error: "unavailable" }));
    render(<PromotionsDesk tree="ops" />);
    expect((await loaded()).getByText("Open to claim")).toBeInTheDocument();
    await act(async () => void vi.advanceTimersByTime(5_000));
    expect(founding().getByText("Ended")).toBeInTheDocument();
    // The wake-up at the end time re-read the counts too.
    expect(getAdminPromotions.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("a read that started before a write", () => {
  /** A Refresh whose GET waits until the test answers it. */
  async function refreshHeld() {
    let answer!: (value: ReturnType<typeof fresh>) => void;
    getAdminPromotions.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("button", { name: "Refreshing…" });
    return (value: ReturnType<typeof fresh>) => act(async () => answer(value));
  }

  it("cannot take the form back after the save it overlapped", async () => {
    getAdminPromotions.mockResolvedValueOnce(fresh());
    updateAdminPromotions.mockResolvedValueOnce(at(4, 25000));
    render(<PromotionsDesk tree="admin" />);
    fireEvent.change((await loaded()).getByLabelText("Amount (pesos)"), { target: { value: "250" } });
    const late = await refreshHeld();
    fireEvent.click(saveButton()!);
    expect(await screen.findByText(/Saved 1 change/)).toBeInTheDocument();

    await late(at(3, 20000));
    expect(founding().getByLabelText("Amount (pesos)")).toHaveValue("250");
    expect(screen.getByText(/Saved 1 change/)).toBeInTheDocument();
    expect(screen.queryByText(/Someone else saved these promotions/)).toBeNull();

    updateAdminPromotions.mockResolvedValueOnce(at(5, 30000));
    fireEvent.change(founding().getByLabelText("Amount (pesos)"), { target: { value: "300" } });
    fireEvent.click(saveButton()!);
    await waitFor(() => expect(updateAdminPromotions).toHaveBeenCalledTimes(2));
    expect(updateAdminPromotions.mock.calls[1]?.[1]).toBe(4);
  });

  it("cannot undo a conflict reload", async () => {
    getAdminPromotions.mockResolvedValueOnce(fresh());
    updateAdminPromotions.mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }));
    render(<PromotionsDesk tree="admin" />);
    fireEvent.change((await loaded()).getByLabelText("Amount (pesos)"), { target: { value: "250" } });
    const late = await refreshHeld();
    fireEvent.click(saveButton()!);
    await screen.findByText(/Someone else changed these promotions/);

    getAdminPromotions.mockResolvedValueOnce(at(5, 30000));
    fireEvent.click(screen.getByRole("button", { name: "Reload promotions" }));
    await waitFor(() => expect(founding().getByLabelText("Amount (pesos)")).toHaveValue("300"));

    await late(fresh());
    expect(founding().getByLabelText("Amount (pesos)")).toHaveValue("300");
    expect(founding().getByLabelText("Amount (pesos)")).toBeEnabled();
    expect(screen.queryByText(/Someone else changed these promotions/)).toBeNull();

    updateAdminPromotions.mockResolvedValueOnce(at(6, 35000));
    fireEvent.change(founding().getByLabelText("Amount (pesos)"), { target: { value: "350" } });
    fireEvent.click(saveButton()!);
    await waitFor(() => expect(updateAdminPromotions).toHaveBeenCalledTimes(2));
    expect(updateAdminPromotions.mock.calls[1]?.[1]).toBe(5);
  });

  it("never installs an older settings version", async () => {
    getAdminPromotions.mockResolvedValueOnce(at(4, 25000)).mockResolvedValueOnce(at(3, 20000));
    render(<PromotionsDesk tree="admin" />);
    expect((await loaded()).getByLabelText("Amount (pesos)")).toHaveValue("250");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(getAdminPromotions).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "Refresh" });
    expect(founding().getByLabelText("Amount (pesos)")).toHaveValue("250");

    updateAdminPromotions.mockResolvedValueOnce(at(5, 30000));
    fireEvent.change(founding().getByLabelText("Amount (pesos)"), { target: { value: "300" } });
    fireEvent.click(saveButton()!);
    await waitFor(() => expect(updateAdminPromotions).toHaveBeenCalledTimes(1));
    expect(updateAdminPromotions.mock.calls[0]?.[1]).toBe(4);
  });
});

describe("the Friend Pass follows the Founding 30", () => {
  it("shows the Friend Pass off, and why, when the Founding 30 is off", async () => {
    const raw = rawPromotions();
    getAdminPromotions.mockResolvedValue(
      readAdminPromotions({
        ...raw,
        settings: { ...raw.settings, founding: { ...raw.settings.founding, enabled: false } },
      }),
    );
    render(<PromotionsDesk tree="ops" />);
    const friend = within(await screen.findByRole("region", { name: "Friend Pass" }));
    expect(friend.getByText("Off with the Founding 30")).toBeInTheDocument();
    expect(friend.getByText(/The Founding 30 is off, so Friend Pass invites, claims and upgrades are off too/)).toBeInTheDocument();
    expect(friend.getByText(/Upgrades wait while either promotion is off/)).toBeInTheDocument();
  });

  it("says upgrades are eligible from the date and counts only real ones", async () => {
    getAdminPromotions.mockResolvedValue(fresh());
    render(<PromotionsDesk tree="ops" />);
    const friend = within(await screen.findByRole("region", { name: "Friend Pass" }));
    expect(friend.getByText(/^From Nov 1, 2026, 11:59 PM, unused Friend Passes upgrade to ₱200\.00/)).toBeInTheDocument();
    expect(friend.getByText(/No pass has been upgraded yet/)).toBeInTheDocument();
  });
});

describe("Operations", () => {
  it("reads every figure with no way to change them", async () => {
    getAdminPromotions.mockResolvedValue(fresh());
    render(<PromotionsDesk tree="ops" />);
    expect(await screen.findByText("Read only")).toBeInTheDocument();
    expect(founding().getByText("₱200.00")).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByRole("searchbox", { name: "Search by name or email" })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText("Friend Pass: turned on")).toBeInTheDocument();
    expect(saveButton()).toBeNull();
    expect(screen.getAllByRole("link", { name: "Open order" })[0]).toHaveAttribute(
      "href",
      "/ops/orders/ord_1",
    );
  });
});
