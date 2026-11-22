// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { personRights } from "@/components/shop-team/PersonPanel";
import { TeamManager } from "@/components/shop-team/TeamManager";
import type { ShopRole } from "@/lib/api/types";
import { shopCapabilities, type TeamPerson } from "@/lib/shop-team";

const api = vi.hoisted(() => ({
  getMyShopTeam: vi.fn(),
  createShopInvite: vi.fn(),
  revokeShopInvite: vi.fn(),
  replaceShopInvite: vi.fn(),
  approveShopMember: vi.fn(),
  setShopMemberRole: vi.fn(),
  removeShopMember: vi.fn(),
  setShopMemberAlerts: vi.fn(),
  setMyTeamAlerts: vi.fn(),
  updatePinStaff: vi.fn(),
  removePinStaff: vi.fn(),
  createPinStaff: vi.fn(),
  resetPinStaffPin: vi.fn(),
  updateShopTeamSettings: vi.fn(),
  lockWorkingDevice: vi.fn(),
}));
const access = vi.hoisted(() => ({ role: "owner" as string, userId: "user_owner" }));
const device = vi.hoisted(() => ({ enterSharedPc: vi.fn(async () => undefined) }));

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
vi.mock("@/lib/api/shop-team", () => api);
vi.mock("@/components/shop-device/enterSharedPc", () => device);
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: access.userId, name: "Me" } }),
}));
vi.mock("@/lib/auth/shop-access", async () => {
  const { shopCapabilities: caps } = await import("@/lib/shop-team");
  return {
    useShopAccess: () => ({
      shop: { id: "shop_1", name: "Test Print Shop", role: access.role, status: "active" },
      staff: access.role !== "owner",
      manager: access.role === "manager",
      role: access.role,
      worker: null,
      can: caps(access.role as ShopRole),
    }),
  };
});
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => undefined }));
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));

const owner = { userId: "user_owner", name: "Olive Owner", role: "owner", status: "active", kind: "account", jobAlerts: true };
const rey = { userId: "user_rey", name: "Rey Manager", role: "manager", status: "active", kind: "account", jobAlerts: true };
const bea = { userId: "user_bea", name: "Bea Staff", role: "staff", status: "active", kind: "account", jobAlerts: true };
const ana = { id: "shp_ana", shopId: "shop_1", kind: "pin", name: "Ana", role: "staff", status: "active", jobAlerts: true, photoFileId: null, onShift: true };

function extended(role: string) {
  const runs = role !== "staff";
  return {
    members: [owner, rey, bea],
    invites: [],
    pinStaff: [ana],
    stats: {
      weekStartsAt: "2026-11-16T16:00:00Z",
      weekEndsAt: "2026-11-23T16:00:00Z",
      fastestThisWeek: { pinStaffId: "shp_ana", name: "Ana", badge: "fastest_this_week" },
      mission: { code: "accept_within_five_minutes", targetJobs: 10, acceptedJobs: 6, quickAcceptedJobs: 4, completed: false },
      ...(runs
        ? { members: [{ pinStaffId: "shp_ana", name: "Ana", jobsThisWeek: 23, acceptedJobs: 9, averageAcceptSeconds: 38 }] }
        : {}),
    },
    settings: { jobsHandledBy: "me_and_staff", showRankingToStaff: true },
  };
}

beforeEach(() => {
  access.role = "owner";
  access.userId = "user_owner";
  api.getMyShopTeam.mockImplementation(async () => extended(access.role));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function person(over: Partial<TeamPerson>): TeamPerson {
  return { key: "pin:x", kind: "pin", id: "x", name: "X", role: "staff", status: "active", jobAlerts: true, onShift: false, ...over };
}

describe("who may change whom", () => {
  it("lets the Owner change anyone but themselves, never the last Owner", () => {
    expect(personRights("owner", person({}), false, false)).toEqual({ changeRole: true, changeAlerts: true, newPin: true, remove: true });
    expect(personRights("owner", person({ kind: "account", role: "owner" }), false, true)).toMatchObject({ changeRole: false, remove: false });
    expect(personRights("owner", person({ kind: "account", role: "owner" }), true, false)).toEqual({ changeRole: false, changeAlerts: true, newPin: false, remove: false });
  });

  it("lets a Manager change Staff only, and never promote", () => {
    expect(personRights("manager", person({}), false, false)).toEqual({ changeRole: false, changeAlerts: true, newPin: true, remove: true });
    expect(personRights("manager", person({ role: "manager" }), false, false)).toEqual({ changeRole: false, changeAlerts: false, newPin: false, remove: false });
  });

  it("gives Staff their own alerts and nothing else", () => {
    expect(personRights("staff", person({}), false, false)).toEqual({ changeRole: false, changeAlerts: false, newPin: false, remove: false });
    expect(personRights("staff", person({}), true, false).changeAlerts).toBe(true);
    expect(shopCapabilities("staff")).toMatchObject({ money: false, manageTeam: false, personStats: false });
    expect(shopCapabilities("manager")).toMatchObject({ money: false, editStatus: false, editHours: true, editProducts: true, manageTeam: true, ownerSettings: false });
    expect(shopCapabilities("owner").money).toBe(true);
  });
});

describe("Team page by role", () => {
  it("gives the Owner the three ways to add, the shared PC and the ranking switch", async () => {
    render(<TeamManager />);
    expect(await screen.findByRole("button", { name: "Show QR" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send link" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add with PIN" })).toBeVisible();
    expect(screen.getByText("Use this PC for PIN staff")).toBeVisible();
    expect(screen.getByRole("switch", { name: /Show the fastest badge to staff/ })).toBeVisible();
    expect(screen.getByText("Fastest this week: Ana")).toBeVisible();
    expect(screen.getByText("4 of 10 jobs accepted within 5 minutes")).toBeVisible();
    expect(screen.getByText("1 on shift")).toBeVisible();
  });

  it("adds a PIN person with the PIN as a string", async () => {
    api.createPinStaff.mockResolvedValue({ ...ana, id: "shp_new", name: "Mika" });
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Add with PIN" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Mika");
    await userEvent.type(within(dialog).getByLabelText("4-digit PIN"), "0071");
    await userEvent.type(within(dialog).getByLabelText("Type the PIN again"), "0071");
    await userEvent.click(within(dialog).getByRole("button", { name: "Manager" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(api.createPinStaff).toHaveBeenCalledWith({ name: "Mika", pin: "0071", role: "manager", jobAlerts: true });
  });

  it("refuses PINs that differ without asking GRIDGO", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Add with PIN" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Mika");
    await userEvent.type(within(dialog).getByLabelText("4-digit PIN"), "1234");
    await userEvent.type(within(dialog).getByLabelText("Type the PIN again"), "1243");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByText(/two PINs are different/)).toBeVisible();
    expect(api.createPinStaff).not.toHaveBeenCalled();
  });

  it("shows the Owner a PIN person's week and gives them a new PIN", async () => {
    api.resetPinStaffPin.mockResolvedValue(ana);
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: /^Ana/ }));
    const panel = await screen.findByTestId("person-panel");
    expect(within(panel).getByText("23")).toBeVisible();
    expect(within(panel).getByText("38 sec")).toBeVisible();
    await userEvent.click(within(panel).getByRole("button", { name: "Give a new PIN" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("4-digit PIN"), "9876");
    await userEvent.type(within(dialog).getByLabelText("Type the PIN again"), "9876");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save new PIN" }));
    await waitFor(() => expect(api.resetPinStaffPin).toHaveBeenCalledWith("shp_ana", "9876"));
  });

  it("shares the PC only after a confirmation that says how to get back", async () => {
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Share this PC" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/sign out and sign in again/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Share this PC" }));
    expect(device.enterSharedPc).toHaveBeenCalledTimes(1);
  });

  it("lets a Manager add Staff but not grant Manager, change roles or hide the ranking", async () => {
    access.role = "manager";
    access.userId = "user_rey";
    render(<TeamManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Add with PIN" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Manager" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("switch", { name: /Show the fastest badge/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Ana/ }));
    const panel = await screen.findByTestId("person-panel");
    expect(within(panel).queryByRole("group", { name: /Role for/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Remove from shop" })).toBeVisible();
  });

  it("gives Staff the positive view only: no adding, no speeds, no settings", async () => {
    access.role = "staff";
    access.userId = "user_bea";
    render(<TeamManager />);
    expect(await screen.findByText("Fastest this week: Ana")).toBeVisible();
    expect(screen.getByText("Team mission")).toBeVisible();
    for (const name of ["Show QR", "Send link", "Add with PIN", "Share this PC"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("button", { name: /^Ana/ }));
    const panel = await screen.findByTestId("person-panel");
    expect(within(panel).queryByText("Jobs this week")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Remove from shop" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("switch", { name: "Gets job alerts" })).toHaveAttribute("aria-disabled", "true");
  });

  it("drops the fastest card when the Owner hides the ranking from Staff", async () => {
    access.role = "staff";
    api.getMyShopTeam.mockImplementation(async () => ({
      ...extended("staff"),
      stats: { ...extended("staff").stats, fastestThisWeek: null },
    }));
    render(<TeamManager />);
    expect(await screen.findByText("Team mission")).toBeVisible();
    expect(screen.queryByText(/Fastest this week/)).not.toBeInTheDocument();
  });
});
