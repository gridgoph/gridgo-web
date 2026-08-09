import { describe, expect, it } from "vitest";

import {
  presentAuditAction,
  presentLedgerType,
  presentPaymentMethod,
  presentRole,
  presentVerification,
  roleChangeConsequence,
  verificationActions,
} from "./present";

describe("presentVerification", () => {
  it("maps statuses to plain language", () => {
    expect(presentVerification("approved").label).toBe("Verified");
    expect(presentVerification("pending").label).toBe("Pending review");
    expect(presentVerification("suspended").label).toBe("Suspended");
    expect(presentVerification("unverified").label).toBe("Not verified");
  });

  it("never returns snake_case", () => {
    for (const s of ["approved", "pending", "suspended", "rejected", "unverified"]) {
      expect(presentVerification(s).label).not.toMatch(/_/);
    }
  });
});

describe("verificationActions", () => {
  it("offers suspend from approved with consequence about new work only", () => {
    const actions = verificationActions("approved");
    expect(actions).toHaveLength(1);
    expect(actions[0]!.status).toBe("suspended");
    expect(actions[0]!.consequence).toMatch(/new work/i);
    expect(actions[0]!.consequence).toMatch(/existing/i);
  });

  it("offers reinstate from suspended", () => {
    const actions = verificationActions("suspended");
    expect(actions.some((a) => a.status === "approved")).toBe(true);
  });
});

describe("roleChangeConsequence", () => {
  it("warns when creating a super admin", () => {
    const text = roleChangeConsequence("ops_admin", "super_admin");
    expect(text).toMatch(/Super Admin/i);
    expect(text).toMatch(/audit/i);
    expect(text).not.toMatch(/super_admin/);
  });

  it("warns when removing super admin", () => {
    const text = roleChangeConsequence("super_admin", "client");
    expect(text).toMatch(/lose Super Admin/i);
  });
});

describe("presentRole / payment / audit", () => {
  it("uses plain role labels", () => {
    expect(presentRole("ops_admin")).toBe("Operations");
    expect(presentRole("super_admin")).not.toMatch(/_/);
  });

  it("maps payment methods without snake_case", () => {
    expect(presentPaymentMethod("pilot_credit")).toBe("Pilot Credits");
    expect(presentPaymentMethod("cod")).toBe("Cash on delivery");
    expect(presentPaymentMethod(null)).toBe("Not chosen");
  });

  it("maps ledger and audit actions to plain language", () => {
    expect(presentLedgerType("grant")).toBe("Administrative grant");
    expect(presentAuditAction("credits.grant")).toBe("Granted Pilot Credits");
    expect(presentAuditAction("user.role_update")).not.toMatch(/_/);
  });
});
