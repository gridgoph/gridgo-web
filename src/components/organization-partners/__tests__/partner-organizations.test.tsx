// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PartnerChanges } from "@/app/admin/partner-organizations/_components/PartnerChanges";
import { PartnerDetail } from "@/components/organization-partners/PartnerDetail";
import { PartnersDesk } from "@/components/organization-partners/PartnersDesk";
import {
  PartnerPerkPage,
  StandardPerkPage,
} from "@/components/organization-partners/PerkPages";
import { ApiError } from "@/lib/api/client";
import { memberPerk, partner } from "@/test/organization-partners";

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const api = vi.hoisted(() => ({
  listOrganizationPartners: vi.fn(),
  getOrganizationPartner: vi.fn(),
  saveOrganizationPartner: vi.fn(),
  getStandardPerk: vi.fn(),
  saveStandardPerk: vi.fn(),
  savePartnerPerk: vi.fn(),
  removePartnerPerk: vi.fn(),
}));
vi.mock("@/lib/api/organization-partners", () => api);

const client = vi.hoisted(() => ({
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  listAuditPage: vi.fn(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...client,
}));

const organization = (over = {}) => ({
  userId: "user_new",
  name: "Sample Robotics Circle",
  school: "Example College",
  email: null,
  currentOfficer: { id: "o1", fullName: "Officer One" },
  approvalCase: { id: "a1", status: "approved", version: 1, applicationRevision: 1 },
  ...over,
});

const notFound = (error: string) => new ApiError(404, { error });
const reason = () => screen.getByLabelText("Why");
const dialog = () => within(screen.getByRole("alertdialog"));

beforeEach(() => {
  api.listOrganizationPartners.mockResolvedValue([partner()]);
  api.getOrganizationPartner.mockResolvedValue(partner());
  api.getStandardPerk.mockResolvedValue(memberPerk());
  client.listOrganizations.mockResolvedValue({
    organizations: [organization()],
    nextCursor: null,
  });
  client.getOrganization.mockResolvedValue(organization());
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("the partner list", () => {
  it("shows the standard perk, members, orders and the budget, with no member named", async () => {
    render(<PartnersDesk tree="admin" />);
    const table = await screen.findByRole("table", { name: "Partner organizations" });
    const row = within(table).getByText("SDG").closest("tr")!;
    expect(row).toHaveTextContent("Sample Drafting Guild");
    expect(row).toHaveTextContent("Up to ₱12.34");
    expect(row).toHaveTextContent("41");
    expect(row).toHaveTextContent("19");
    expect(row).toHaveTextContent("₱200.00 of ₱1,000.00");
    expect(screen.getByTestId("perk-preview")).toHaveTextContent(
      "Up to ₱12.34 off an order",
    );
    expect(screen.queryByText("Near the cap")).not.toBeInTheDocument();
  });

  it("warns near the cap, in words, above the list", async () => {
    api.listOrganizationPartners.mockResolvedValue([
      partner({ budgetUsedMinor: 95000, budgetLeftMinor: 5000 }),
    ]);
    render(<PartnersDesk tree="admin" />);
    expect(await screen.findByText(/SDG is near its budget cap/)).toBeInTheDocument();
    expect(screen.getAllByText("Near the cap").length).toBeGreaterThan(0);
  });

  it("starts empty with the perk off and one main action", async () => {
    api.listOrganizationPartners.mockResolvedValue([]);
    api.getStandardPerk.mockResolvedValue(null);
    render(<PartnersDesk tree="admin" />);
    expect(await screen.findByText("No partner organizations yet")).toBeInTheDocument();
    expect(screen.getByText("Off, not set yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add partner" })).toHaveLength(1);
    expect(document.body).not.toHaveTextContent("₱");
  });

  it("lets Operations read and change nothing", async () => {
    render(<PartnersDesk tree="ops" />);
    await screen.findByRole("table", { name: "Partner organizations" });
    expect(screen.queryByRole("button", { name: "Add partner" })).not.toBeInTheDocument();
    expect(screen.queryByText("Change the standard perk")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open SDG" })[0]).toHaveAttribute(
      "href",
      "/ops/partner-organizations/user_org",
    );
  });

  it("offers only verified organizations that are not partners yet", async () => {
    client.listOrganizations
      .mockResolvedValueOnce({
        organizations: [
          organization({ userId: "user_org", name: "Already a partner" }),
          organization({
            userId: "user_wait",
            name: "No officer yet",
            currentOfficer: null,
          }),
        ],
        nextCursor: "user_wait",
      })
      .mockResolvedValueOnce({ organizations: [organization()], nextCursor: null });
    render(<PartnersDesk tree="admin" />);
    await userEvent.click(await screen.findByRole("button", { name: "Add partner" }));
    await userEvent.click(
      await screen.findByRole("button", { name: /Sample Robotics Circle/ }),
    );
    expect(push).toHaveBeenCalledWith("/admin/partner-organizations/user_new");
    expect(screen.queryByText("Already a partner")).not.toBeInTheDocument();
    expect(screen.queryByText("No officer yet")).not.toBeInTheDocument();
  });

  it("says offline and retries", async () => {
    api.listOrganizationPartners.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<PartnersDesk tree="admin" />);
    expect(await screen.findByText(/You seem to be offline/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("table", { name: "Partner organizations" }),
    ).toBeInTheDocument();
  });

  it("is honest about an older API", async () => {
    api.listOrganizationPartners.mockRejectedValue(notFound("not_found"));
    render(<PartnersDesk tree="admin" />);
    expect(await screen.findByText("Not available yet")).toBeInTheDocument();
  });
});

describe("one organization", () => {
  it("makes a verified organization a partner, with a reason, and leaves the perk alone", async () => {
    api.getOrganizationPartner.mockRejectedValue(
      notFound("organization_partner_not_found"),
    );
    api.saveOrganizationPartner.mockResolvedValue(
      partner({
        userId: "user_new",
        label: "SRC",
        organizationName: "Sample Robotics Circle",
      }),
    );
    render(<PartnerDetail tree="admin" userId="user_new" />);

    await userEvent.click(await screen.findByRole("button", { name: "Make partner" }));
    expect(screen.getByText("Write the short name members see.")).toBeInTheDocument();
    expect(screen.getByLabelText("Short name")).toHaveFocus();
    await userEvent.type(screen.getByLabelText("Short name"), " SRC ");
    expect(screen.getByText(/Members show as “SRC member”/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Booth support/ }));
    await userEvent.click(screen.getByRole("button", { name: "Make partner" }));

    await userEvent.click(dialog().getByRole("button", { name: "Make partner" }));
    expect(screen.getByText("Write why, for the audit log.")).toBeInTheDocument();
    expect(api.saveOrganizationPartner).not.toHaveBeenCalled();
    await userEvent.type(reason(), "Membership drive");
    await userEvent.click(dialog().getByRole("button", { name: "Make partner" }));

    await waitFor(() =>
      expect(api.saveOrganizationPartner).toHaveBeenCalledWith(
        "user_new",
        expect.objectContaining({
          label: "SRC",
          status: "active",
          benefits: { badge: false, jointPromos: false, boothSupport: true },
          expectedVersion: 0,
          reason: "Membership drive",
        }),
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "Member perk" }),
    ).toBeInTheDocument();
    expect(api.saveStandardPerk).not.toHaveBeenCalled();
    expect(api.savePartnerPerk).not.toHaveBeenCalled();
  });

  it("explains why an unverified organization cannot be a partner", async () => {
    api.getOrganizationPartner.mockRejectedValue(
      notFound("organization_partner_not_found"),
    );
    client.getOrganization.mockResolvedValue(organization({ currentOfficer: null }));
    render(<PartnerDetail tree="admin" userId="user_new" />);
    expect(await screen.findByText(/cannot be a partner yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Make partner" }),
    ).not.toBeInTheDocument();
  });

  it("shows members, orders, savings and the budget warning", async () => {
    api.getOrganizationPartner.mockResolvedValue(
      partner({ budgetUsedMinor: 100000, budgetLeftMinor: 0 }),
    );
    render(<PartnerDetail tree="admin" userId="user_org" />);
    expect(await screen.findByText("Budget used up")).toBeInTheDocument();
    expect(
      screen.getByText(/members order without the perk until the cap is raised/),
    ).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(screen.getByText("₱180.00")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "₱1,000.00 used of a ₱1,000.00 cap, ₱0.00 left" }),
    ).toBeInTheDocument();
  });

  it("ends a partnership with its consequences and a reason, then offers it again", async () => {
    api.saveOrganizationPartner.mockResolvedValue(
      partner({ status: "ended", live: false, version: 3 }),
    );
    render(<PartnerDetail tree="admin" userId="user_org" />);
    await userEvent.click(await screen.findByRole("button", { name: "End partnership" }));
    expect(dialog().getByText(/erased for good/)).toBeInTheDocument();
    await userEvent.type(reason(), "Agreement ended");
    await userEvent.click(dialog().getByRole("button", { name: "End partnership" }));
    await waitFor(() =>
      expect(api.saveOrganizationPartner).toHaveBeenCalledWith("user_org", {
        label: "SDG",
        status: "ended",
        partnerSince: "2026-10-05",
        benefits: { badge: true, jointPromos: false, boothSupport: false },
        expectedVersion: 2,
        reason: "Agreement ended",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Make partner again" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The partnership has ended, so members get no perk/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Set its own perk" }),
    ).not.toBeInTheDocument();
  });

  it("drops a second press while the first is saving", async () => {
    let finish!: (value: unknown) => void;
    api.saveOrganizationPartner.mockReturnValue(new Promise((done) => (finish = done)));
    render(<PartnerDetail tree="admin" userId="user_org" />);
    await userEvent.click(await screen.findByRole("button", { name: "End partnership" }));
    await userEvent.type(reason(), "Agreement ended");
    await userEvent.click(dialog().getByRole("button", { name: "End partnership" }));
    expect(dialog().getByRole("button", { name: "Ending…" })).toBeDisabled();
    await userEvent.click(dialog().getByRole("button", { name: "Ending…" }));
    expect(api.saveOrganizationPartner).toHaveBeenCalledTimes(1);
    finish(partner({ status: "ended" }));
    await screen.findByRole("button", { name: "Make partner again" });
  });

  it("goes back to the standard perk on the override's own version", async () => {
    api.getOrganizationPartner.mockResolvedValue(
      partner({ perkOverride: memberPerk({ version: 7, amountMinor: 5000 }) }),
    );
    api.removePartnerPerk.mockResolvedValue(partner());
    render(<PartnerDetail tree="admin" userId="user_org" />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Use the standard perk" }),
    );
    expect(dialog().getByTestId("perk-preview")).toHaveTextContent(
      "Up to ₱12.34 off an order",
    );
    await userEvent.type(reason(), "Same as others");
    await userEvent.click(
      dialog().getByRole("button", { name: "Use the standard perk" }),
    );
    await waitFor(() =>
      expect(api.removePartnerPerk).toHaveBeenCalledWith("user_org", {
        expectedVersion: 7,
        reason: "Same as others",
      }),
    );
  });

  it("points at the standard perk first when none is set", async () => {
    api.getStandardPerk.mockResolvedValue(null);
    api.getOrganizationPartner.mockResolvedValue(
      partner({ perk: null, budgetUsedMinor: 0, budgetLeftMinor: null }),
    );
    render(<PartnerDetail tree="admin" userId="user_org" />);
    expect(
      await screen.findByRole("button", { name: "Set the standard perk" }),
    ).toHaveAttribute("href", "/admin/partner-organizations/standard-perk");
    expect(screen.getByText("No budget set yet")).toBeInTheDocument();
  });

  it("lets Operations read and change nothing", async () => {
    render(<PartnerDetail tree="ops" userId="user_org" />);
    await screen.findByRole("heading", { name: "Member perk" });
    for (const name of ["Edit partnership", "End partnership", "Set its own perk"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });
});

describe("the standard perk", () => {
  async function fill() {
    await userEvent.type(
      await screen.findByLabelText("Pesos off an order, at most"),
      "7.25",
    );
    await userEvent.type(screen.getByLabelText("Most orders per member each term"), "2");
    await userEvent.type(screen.getByLabelText("Last day"), "2099-05-31");
    await userEvent.type(
      screen.getByLabelText("Budget cap for each organization"),
      "450",
    );
  }

  it("opens off and blank, and suggests no amount", async () => {
    api.getStandardPerk.mockResolvedValue(null);
    render(<StandardPerkPage />);
    expect(await screen.findByRole("radio", { name: /^Off/ })).toBeChecked();
    for (const label of [
      "Pesos off an order, at most",
      "Most orders per member each term",
      "Last day",
      "Budget cap for each organization",
    ]) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveValue("");
      expect(field).not.toHaveAttribute("placeholder");
    }
    await userEvent.click(screen.getByRole("button", { name: "Review and save" }));
    expect(screen.getByText("Enter the pesos off.")).toBeInTheDocument();
    expect(screen.getByLabelText("Pesos off an order, at most")).toHaveFocus();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("previews, restates every value and saves once with a reason", async () => {
    api.getStandardPerk.mockResolvedValue(null);
    api.saveStandardPerk.mockResolvedValue(memberPerk());
    render(<StandardPerkPage />);
    await fill();
    expect(screen.getByTestId("perk-preview")).toHaveTextContent("No perk");
    await userEvent.click(screen.getByRole("radio", { name: /^On/ }));
    expect(screen.getByTestId("perk-preview")).toHaveTextContent(
      /Up to ₱7.25 off an order.*2 orders per member each term/,
    );
    expect(screen.getByTestId("perk-preview")).toHaveTextContent(
      "When an order's fee is smaller, the member saves the fee and no more.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Review and save" }));
    expect(screen.getByTestId("perk-changes")).toHaveTextContent("Perk: On");
    expect(screen.getByTestId("perk-changes")).toHaveTextContent("₱7.25");
    await userEvent.type(reason(), "Approved for the drive");
    await userEvent.click(dialog().getByRole("button", { name: "Save perk" }));
    await waitFor(() =>
      expect(api.saveStandardPerk).toHaveBeenCalledWith({
        enabled: true,
        amountMinor: 725,
        maxOrdersPerTerm: 2,
        endsAt: "2099-05-31T15:59:59.999Z",
        budgetCapMinor: 45000,
        expectedVersion: 0,
        reason: "Approved for the drive",
      }),
    );
    expect(push).toHaveBeenCalledWith("/admin/partner-organizations");
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });

  it("warns that a lower cap stops the perk for a partner already past it", async () => {
    render(<StandardPerkPage />);
    const cap = await screen.findByLabelText("Budget cap for each organization");
    await userEvent.clear(cap);
    await userEvent.type(cap, "150");
    expect(screen.getByText(/SDG has already used this much/)).toBeInTheDocument();
  });

  it("says when nothing is different", async () => {
    render(<StandardPerkPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Review and save" }));
    expect(
      screen.getByText("Nothing is different from what is in force."),
    ).toBeInTheDocument();
  });

  it("keeps what was typed and rebases after someone else's change", async () => {
    api.saveStandardPerk
      .mockRejectedValueOnce(
        new ApiError(409, { error: "member_perk_stale", currentVersion: 5 }),
      )
      .mockResolvedValueOnce(memberPerk());
    render(<StandardPerkPage />);
    const amount = await screen.findByLabelText("Pesos off an order, at most");
    await userEvent.clear(amount);
    await userEvent.type(amount, "9");
    await userEvent.click(screen.getByRole("button", { name: "Review and save" }));
    await userEvent.type(reason(), "New figure");
    api.getStandardPerk.mockResolvedValue(memberPerk({ version: 5, amountMinor: 3000 }));
    await userEvent.click(dialog().getByRole("button", { name: "Save perk" }));
    expect(await screen.findByText(/Someone else changed this perk/)).toBeInTheDocument();
    expect(amount).toHaveValue("9");

    await userEvent.click(screen.getByRole("button", { name: "Review and save" }));
    expect(screen.getByTestId("perk-changes")).toHaveTextContent("₱30.00 to ₱9.00");
    await userEvent.click(dialog().getByRole("button", { name: "Save perk" }));
    await waitFor(() =>
      expect(api.saveStandardPerk).toHaveBeenLastCalledWith(
        expect.objectContaining({ amountMinor: 900, expectedVersion: 5 }),
      ),
    );
  });

  it("does not claim a dropped connection failed", async () => {
    api.saveStandardPerk.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<StandardPerkPage />);
    await userEvent.click(await screen.findByRole("radio", { name: /^Off/ }));
    await userEvent.click(screen.getByRole("button", { name: "Review and save" }));
    await userEvent.type(reason(), "Pause");
    await userEvent.click(dialog().getByRole("button", { name: "Save perk" }));
    expect(
      await screen.findByText(/we cannot tell whether it saved/),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("one organization's own perk", () => {
  it("starts from the standard figures and can turn the perk off here alone", async () => {
    api.savePartnerPerk.mockResolvedValue(partner());
    render(<PartnerPerkPage userId="user_org" />);
    expect(await screen.findByLabelText("Pesos off an order, at most")).toHaveValue(
      "12.34",
    );
    expect(screen.getByText("SDG member")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("radio", { name: /Off for this organization/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Review and save" }));
    await userEvent.type(reason(), "Paused for this organization");
    await userEvent.click(dialog().getByRole("button", { name: "Save perk" }));
    await waitFor(() =>
      expect(api.savePartnerPerk).toHaveBeenCalledWith(
        "user_org",
        expect.objectContaining({
          enabled: false,
          amountMinor: 1234,
          expectedVersion: 0,
        }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/admin/partner-organizations/user_org");
  });
});

describe("changes", () => {
  it("shows who changed the perk, the old and new values, and why", async () => {
    client.listAuditPage.mockResolvedValue({
      audit: [
        {
          id: "aud_1",
          at: "2026-11-20T02:00:00.000Z",
          actorId: "user_admin",
          actorName: "Admin One",
          actorRole: "super_admin",
          action: "member_perk.set",
          entityType: "member_perk",
          entityId: "standard",
          orderId: null,
          before: { amountMinor: 1000, enabled: false, updatedBy: "user_before" },
          after: { amountMinor: 1234, enabled: true, updatedBy: "user_admin" },
          detail: null,
          reason: "Approved for the drive",
        },
      ],
      nextOffset: null,
    });
    render(<PartnerChanges userId={null} />);
    const list = await screen.findByRole("list", { name: "Changes, newest first" });
    expect(list).toHaveTextContent("Changed a member perk");
    expect(list).toHaveTextContent("Admin One");
    expect(list).toHaveTextContent("₱10.00");
    expect(list).toHaveTextContent("₱12.34");
    expect(list).not.toHaveTextContent("user_before");
    expect(list).toHaveTextContent("Why: Approved for the drive");
    expect(client.listAuditPage).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "member_perk", entityId: "standard" }),
    );
  });
});
