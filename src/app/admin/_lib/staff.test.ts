import { describe, expect, it } from "vitest";

import type { StaffInvite } from "@/lib/api/types";
import {
  inviteDaysProblem,
  inviteState,
  roleCodeFromName,
  roleName,
  roleProblem,
  sortInvites,
} from "./staff";

const NOW = Date.parse("2026-10-06T00:00:00.000Z");
const invite = (patch: Partial<StaffInvite>): StaffInvite => ({
  id: "inv",
  roleCode: "hub_staff",
  createdBy: "admin",
  createdAt: "2026-10-01T00:00:00.000Z",
  expiresAt: "2026-10-08T00:00:00.000Z",
  redeemedBy: null,
  redeemedAt: null,
  revokedAt: null,
  ...patch,
});

describe("inviteState", () => {
  it("is used, revoked, expired or still waiting", () => {
    expect(inviteState(invite({}), NOW)).toBe("waiting");
    expect(
      inviteState(
        invite({ redeemedBy: "u", redeemedAt: "2026-10-02T00:00:00.000Z" }),
        NOW,
      ),
    ).toBe("used");
    expect(inviteState(invite({ revokedAt: "2026-10-02T00:00:00.000Z" }), NOW)).toBe(
      "revoked",
    );
    expect(inviteState(invite({ expiresAt: "2026-10-05T00:00:00.000Z" }), NOW)).toBe(
      "expired",
    );
  });

  it("lists waiting invites first, soonest to expire", () => {
    const sorted = sortInvites(
      [
        invite({
          id: "old-used",
          redeemedBy: "u",
          redeemedAt: "x",
          createdAt: "2026-09-01T00:00:00.000Z",
        }),
        invite({ id: "later", expiresAt: "2026-10-20T00:00:00.000Z" }),
        invite({ id: "sooner", expiresAt: "2026-10-07T00:00:00.000Z" }),
        invite({
          id: "new-revoked",
          revokedAt: "x",
          createdAt: "2026-10-03T00:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(sorted.map((row) => row.id)).toEqual([
      "sooner",
      "later",
      "new-revoked",
      "old-used",
    ]);
  });
});

describe("roles", () => {
  const roles = [{ code: "hub_staff", name: "Hub staff", canHandout: true }];

  it("derives the API's role code from a plain name", () => {
    expect(roleCodeFromName("Front desk")).toBe("front_desk");
    expect(roleCodeFromName("  Señor Runner #2 ")).toBe("senor_runner_2");
    expect(roleCodeFromName("2nd shift")).toBe("nd_shift");
  });

  it("refuses an empty, duplicate or code-less name", () => {
    expect(roleProblem("", roles)).toBe("Name the role.");
    expect(roleProblem("Hub staff", roles)).toBe("A role with this name already exists.");
    expect(roleProblem("1", roles)).toBe("Use at least two letters in the name.");
    expect(roleProblem("Front desk", roles)).toBeNull();
  });

  it("names a role by code, and an unknown code readably", () => {
    expect(roleName(roles, "hub_staff")).toBe("Hub staff");
    expect(roleName(roles, "night_guard")).toBe("night guard");
  });

  it("keeps an invite between 1 and 30 days", () => {
    expect(inviteDaysProblem("7")).toBeNull();
    expect(inviteDaysProblem("0")).toMatch(/1 to 30/);
    expect(inviteDaysProblem("31")).toMatch(/1 to 30/);
    expect(inviteDaysProblem("2.5")).toMatch(/1 to 30/);
  });
});
