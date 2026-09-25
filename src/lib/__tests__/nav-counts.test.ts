import { describe, expect, it } from "vitest";

import {
  navGroupsForRole,
  navSectionsForRole,
  ROLE_NAV,
  ROLE_NAV_GROUPS,
  type NavGroup,
} from "@/lib/nav";
import {
  compactCount,
  countedName,
  groupCount,
  groupCountPhrase,
  groupNeedsAttention,
  itemCount,
  showOpenGroupTotal,
  itemCountPhrase,
  type NavCounts,
} from "@/lib/nav-counts";

function group(role: "ops_admin" | "super_admin" | "supplier", id: string): NavGroup {
  const found = navGroupsForRole(role).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing group ${id}`);
  return found;
}

describe("rail section headings", () => {
  it("heads each role's rail with honest sections, in rail order", () => {
    const shape = (role: "ops_admin" | "super_admin" | "supplier") =>
      navSectionsForRole(role).map((section) => [
        section.label,
        section.groups.map((g) => g.label ?? g.id),
      ]);
    expect(shape("ops_admin")).toEqual([
      ["Desk", ["ops-top"]],
      ["Work", ["Queue", "Field", "Money"]],
      ["Platform", ["System"]],
    ]);
    expect(shape("super_admin")).toEqual([
      ["Desk", ["admin-top"]],
      ["Manage", ["People", "Catalog", "Money"]],
      ["Platform", ["System"]],
    ]);
    expect(shape("supplier")).toEqual([
      ["Work", ["supplier-top"]],
      ["Business", ["Shop", "Money"]],
    ]);
  });

  it("never splits a heading: each section's groups are contiguous", () => {
    for (const groups of Object.values(ROLE_NAV_GROUPS)) {
      const labels = groups.map((g) => g.section);
      const seen = new Set<string>();
      labels.forEach((label, index) => {
        if (index > 0 && labels[index - 1] !== label) {
          expect(seen.has(label)).toBe(false);
        }
        seen.add(label);
      });
    }
  });

  it("keeps every page, in the same order, under some heading", () => {
    for (const role of ["ops_admin", "super_admin", "supplier"] as const) {
      const hrefs = navSectionsForRole(role).flatMap((section) =>
        section.groups.flatMap((g) => g.items.map((item) => item.href)),
      );
      expect(hrefs).toEqual(ROLE_NAV[role].map((item) => item.href));
    }
  });
});

describe("rail counts", () => {
  it("counts only rows with an existing source", () => {
    const counted = Object.fromEntries(
      Object.entries(ROLE_NAV).map(([role, items]) => [
        role,
        items.filter((item) => item.count).map((item) => `${item.id}:${item.count}`),
      ]),
    );
    expect(counted).toEqual({
      supplier: ["supplier-jobs:jobs-need-action"],
      ops_admin: [
        "ops-chat:chat-unread",
        "ops-issue-reports:issue-reports-new",
        "ops-orders:orders-waiting",
        "ops-approvals:signups-waiting",
        "ops-escalations:escalations-open",
        "ops-claims:claims-open",
      ],
      super_admin: [
        "admin-chat:chat-unread",
        "admin-issue-reports:issue-reports-new",
        "admin-verification:signups-waiting",
      ],
    });
  });

  it("sums a group's pages and marks it yellow only for order-blocking work", () => {
    const queue = group("ops_admin", "ops-queue");
    const counts: NavCounts = { "orders-waiting": 3, "signups-waiting": 2 };
    expect(groupCount(queue, counts)).toBe(5);
    expect(groupNeedsAttention(queue, counts)).toBe(true);
    expect(groupCountPhrase(queue, counts)).toBe("5 need action");

    expect(groupNeedsAttention(queue, { "signups-waiting": 2 })).toBe(false);
    expect(groupCount(group("ops_admin", "ops-field"), { "escalations-open": 1 })).toBe(1);
    expect(groupCount(group("ops_admin", "ops-system"), counts)).toBe(0);
  });

  it("keeps an open group's total only when it sums more than one row", () => {
    const queue = group("ops_admin", "ops-queue");
    expect(showOpenGroupTotal(queue, { "orders-waiting": 3, "signups-waiting": 2 })).toBe(true);
    expect(showOpenGroupTotal(queue, { "orders-waiting": 3 })).toBe(false);
    expect(showOpenGroupTotal(queue, { "orders-waiting": 3, "signups-waiting": 0 })).toBe(false);
  });

  it("hides zero: no count, no phrase, the bare label", () => {
    const queue = group("ops_admin", "ops-queue");
    const orders = queue.items[0]!;
    const zero: NavCounts = { "orders-waiting": 0, "signups-waiting": 0 };
    expect(itemCount(orders, zero)).toBe(0);
    expect(itemCountPhrase(orders, zero)).toBeNull();
    expect(groupCountPhrase(queue, zero)).toBeNull();
    expect(countedName("Queue", groupCountPhrase(queue, zero))).toBe("Queue");
    // Not read yet reads the same as zero.
    expect(groupCount(queue, {})).toBe(0);
  });

  it("caps the figure at 99+ and names the count after the label", () => {
    expect(compactCount(99)).toBe("99");
    expect(compactCount(100)).toBe("99+");
    const [orders, approvals] = group("ops_admin", "ops-queue").items;
    expect(countedName("Orders", itemCountPhrase(orders!, { "orders-waiting": 3 }))).toBe(
      "Orders, 3 need action",
    );
    expect(itemCountPhrase(orders!, { "orders-waiting": 1 })).toBe("1 needs action");
    expect(itemCountPhrase(orders!, { "orders-waiting": 250 })).toBe("99+ need action");
    expect(itemCountPhrase(approvals!, { "signups-waiting": 4 })).toBe("4 waiting for review");
  });
});
