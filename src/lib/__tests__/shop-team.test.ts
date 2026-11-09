import { describe, expect, it } from "vitest";

import type { ShopInvite, ShopMember } from "@/lib/api/types";
import {
  SHOP_STAFF_HOME,
  SHOP_STAFF_NAV_IDS,
  navForRole,
  navGroupsForRole,
  shopStaffAllowsPath,
} from "@/lib/nav";
import {
  actionLabel,
  actorLine,
  inviteExpiresIn,
  inviteTitle,
  isLastOwner,
  isShopStaff,
  joinTeamUrl,
  joinTokenFromHash,
  normalizeInvitePhone,
  openInvites,
  orderActionRows,
  parseInviteIdentity,
  shopTeamErrorCopy,
  teamRows,
} from "@/lib/shop-team";

const TOKEN = "A".repeat(20) + "b_-" + "9".repeat(20);

function member(partial: Partial<ShopMember>): ShopMember {
  return { userId: "u", name: "Name", role: "staff", status: "active", ...partial };
}

function invite(partial: Partial<ShopInvite>): ShopInvite {
  return {
    id: "shi_1",
    shopId: "shop",
    kind: "link",
    identity: null,
    createdAt: "2026-11-09T00:00:00.000Z",
    expiresAt: "2026-11-11T00:00:00.000Z",
    status: "open",
    ...partial,
  };
}

describe("join link", () => {
  it("is the shared format the shop app reads, token in the fragment", () => {
    expect(joinTeamUrl("https://gridgo-dash.talasora.com", TOKEN)).toBe(
      `https://gridgo-dash.talasora.com/join-team#token=${TOKEN}`,
    );
    expect(joinTeamUrl("https://gridgo-dash.talasora.com/", TOKEN)).toBe(
      `https://gridgo-dash.talasora.com/join-team#token=${TOKEN}`,
    );
  });

  it("reads only a well-formed 43-character token back", () => {
    expect(joinTokenFromHash(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(joinTokenFromHash(`token=${TOKEN}`)).toBe(TOKEN);
    expect(joinTokenFromHash("#token=short")).toBeNull();
    expect(joinTokenFromHash("")).toBeNull();
    expect(joinTokenFromHash(`#token=${TOKEN}x`)).toBeNull();
  });
});

describe("Staff navigation", () => {
  it("leaves Staff with Jobs only", () => {
    expect([...SHOP_STAFF_NAV_IDS]).toEqual(["supplier-jobs"]);
    expect(navForRole("supplier", { shopStaff: true }).map((i) => i.href)).toEqual([
      "/supplier/jobs",
    ]);
    expect(navGroupsForRole("supplier", { shopStaff: true })).toHaveLength(1);
    expect(SHOP_STAFF_HOME).toBe("/supplier/jobs");
  });

  it("gives the Owner the Team page in the Shop group", () => {
    const hrefs = navForRole("supplier").map((i) => i.href);
    expect(hrefs).toContain("/supplier/team");
    const shopGroup = navGroupsForRole("supplier").find((g) => g.id === "supplier-shop");
    expect(shopGroup?.items.some((i) => i.id === "supplier-team")).toBe(true);
  });

  it("does not change other roles' rails", () => {
    expect(navForRole("ops_admin", { shopStaff: true })).toEqual(navForRole("ops_admin"));
  });

  it.each([
    "/supplier",
    "/supplier/",
    "/supplier/jobs",
    "/supplier/jobs/ord_1",
    "/supplier/phone-app",
    "/supplier/notice",
  ])("lets Staff open %s", (path) => {
    expect(shopStaffAllowsPath(path)).toBe(true);
  });

  it.each([
    "/supplier/dashboard",
    "/supplier/shop",
    "/supplier/shop-hours",
    "/supplier/services",
    "/supplier/catalogue",
    "/supplier/catalogue/new",
    "/supplier/product-types",
    "/supplier/capacity",
    "/supplier/schedule",
    "/supplier/payouts",
    "/supplier/payout-account",
    "/supplier/record",
    "/supplier/report",
    "/supplier/team",
    "/supplier/documents",
    "/supplier/chat",
    "/supplier/legal",
    "/supplier/privacy",
    "/supplier/jobsX",
  ])("keeps Staff out of %s", (path) => {
    expect(shopStaffAllowsPath(path)).toBe(false);
  });
});

describe("team rows", () => {
  const members = [
    member({ userId: "b", name: "Bea", role: "staff" }),
    member({ userId: "o", name: "Olive", role: "owner" }),
    member({ userId: "p", name: "Pia", status: "pending" }),
    member({ userId: "r", name: "Rex", status: "removed" }),
    member({ userId: "a", name: "Ana", role: "staff" }),
  ];

  it("puts waiting people apart, Owners first, and drops removed", () => {
    const rows = teamRows(members);
    expect(rows.pending.map((m) => m.name)).toEqual(["Pia"]);
    expect(rows.active.map((m) => m.name)).toEqual(["Olive", "Ana", "Bea"]);
  });

  it("protects the last active Owner only", () => {
    const owner = members[1];
    expect(isLastOwner(owner, members)).toBe(true);
    const two = [...members, member({ userId: "o2", name: "Oz", role: "owner" })];
    expect(isLastOwner(owner, two)).toBe(false);
    expect(isLastOwner(members[0], members)).toBe(false);
  });

  it("treats only a Staff summary as Staff", () => {
    expect(isShopStaff({ role: "staff" })).toBe(true);
    expect(isShopStaff({ role: "owner" })).toBe(false);
    expect(isShopStaff(null)).toBe(false);
  });
});

describe("invites", () => {
  const now = Date.parse("2026-11-09T12:00:00.000Z");

  it("lists open, unexpired invites, newest first", () => {
    const list = openInvites(
      [
        invite({ id: "old", createdAt: "2026-11-09T00:00:00.000Z" }),
        invite({ id: "new", createdAt: "2026-11-09T06:00:00.000Z" }),
        invite({ id: "used", status: "claimed" }),
        invite({ id: "gone", status: "revoked" }),
        invite({ id: "late", expiresAt: "2026-11-09T11:00:00.000Z" }),
      ],
      now,
    );
    expect(list.map((i) => i.id)).toEqual(["new", "old"]);
  });

  it("says who an invite is for, and how long it has left", () => {
    expect(inviteTitle(invite({ kind: "email", identity: "sam@example.com" }))).toBe(
      "sam@example.com",
    );
    expect(inviteTitle(invite({ kind: "qr" }))).toBe("QR code invite");
    expect(inviteExpiresIn("2026-11-11T12:00:00.000Z", now)).toBe("Expires in 48 h");
    expect(inviteExpiresIn("2026-11-09T12:20:00.000Z", now)).toBe("Expires in 20 min");
    expect(inviteExpiresIn("2026-11-09T11:00:00.000Z", now)).toBe("Expired");
  });

  it("takes an email or a Philippine mobile in one field", () => {
    expect(parseInviteIdentity(" Sam@Example.com ")).toEqual({
      kind: "email",
      identity: "sam@example.com",
    });
    expect(parseInviteIdentity("0917 123 4567")).toEqual({
      kind: "phone",
      identity: "+639171234567",
    });
    expect(normalizeInvitePhone("917-123-4567")).toBe("+639171234567");
    expect(normalizeInvitePhone("+14155550100")).toBe("+14155550100");
    expect(parseInviteIdentity("sam@")).toBeNull();
    expect(parseInviteIdentity("12")).toBeNull();
  });

  it("explains refusals in plain words, never the API's message", () => {
    expect(shopTeamErrorCopy("last_shop_owner")).toMatch(/at least one Owner/);
    expect(shopTeamErrorCopy("shop_invite_expired")).toBe("This invite expired.");
    expect(shopTeamErrorCopy("something_new")).toBe("That did not go through. Try again.");
  });
});

describe("who did it", () => {
  it("names the person and their shop role", () => {
    expect(actorLine({ userId: "u", name: "Sam Santos", role: "staff" })).toBe(
      "Sam Santos · Staff",
    );
    expect(actorLine({ userId: "u", name: "Olive", role: "owner" })).toBe("Olive · Owner");
    expect(actorLine({ userId: "u", name: "Ops Person", role: "ops_admin" })).toBe(
      "Ops Person · Operations",
    );
    expect(actorLine({ userId: null, name: "System", role: "system" })).toBe("GRIDGO");
    expect(actorLine(null)).toBe("");
  });

  it("words every action without a raw code", () => {
    expect(actionLabel("order.transition")).toBe("Moved the order on");
    expect(actionLabel("order.change_requested")).toBe("Handled a change request");
    expect(actionLabel("brand.new_thing")).toBe("Updated the order");
  });

  it("lists actions newest first with who and when", () => {
    const rows = orderActionRows([
      {
        id: "a1",
        at: "2026-11-08T08:00:00.000Z",
        action: "order.created",
        actor: { userId: "c", name: "Client", role: "client" },
      },
      {
        id: "a2",
        at: "2026-11-08T09:00:00.000Z",
        action: "order.transition",
        actor: { userId: "u", name: "Sam Santos", role: "staff" },
      },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a2", "a1"]);
    expect(rows[0]).toMatchObject({ who: "Sam Santos · Staff", what: "Moved the order on" });
    expect(rows[0].when).toBeTruthy();
    expect(orderActionRows(undefined)).toEqual([]);
  });
});
