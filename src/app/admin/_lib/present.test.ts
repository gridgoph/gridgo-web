import { describe, expect, it } from "vitest";

import { LAUNCH_OPERATING_HOURS } from "@/lib/operating-hours";

import {
  presentAuditAction,
  presentAuditDetail,
  presentLedgerType,
  presentRole,
  presentVerification,
  roleChangeConsequence,
  verificationActions,
} from "./present";

describe("presentVerification", () => {
  it("maps statuses to plain language", () => {
    expect(presentVerification("approved").label).toBe("Approved");
    expect(presentVerification("pending").label).toBe("Waiting for a decision");
    expect(presentVerification("suspended").label).toBe("Suspended");
    expect(presentVerification("unverified").label).toBe("Not approved");
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

describe("presentRole / audit", () => {
  it("uses plain role labels", () => {
    expect(presentRole("ops_admin")).toBe("Operations");
    expect(presentRole("super_admin")).not.toMatch(/_/);
  });

  it("maps ledger and audit actions to plain language", () => {
    expect(presentLedgerType("grant")).toBe("Administrative grant");
    expect(presentAuditAction("credits.grant")).toBe("Granted Pilot Credits");
    expect(presentAuditAction("user.role_update")).not.toMatch(/_/);
  });

  it("says what a legal publish did and whether people accept again", () => {
    expect(presentAuditAction("legal.published")).toBe("Published legal document");
    expect(presentAuditAction("privacy.updated")).toBe("Updated privacy request");
    expect(
      presentAuditDetail({ action: "legal.published", detail: { version: 2, material: true } }),
    ).toMatch(/Version 2, material change/);
    expect(
      presentAuditDetail({ action: "legal.published", detail: { version: 3, material: false } }),
    ).toBe("Version 3, no new acceptance needed");
    expect(presentAuditDetail({ action: "privacy.updated", detail: { status: "rejected" } })).toBe(
      "Status: Declined",
    );
    expect(presentAuditDetail({ action: "credits.grant", detail: null })).toBeNull();
  });

  it("reads an operating-hours save without repeating the portal's own reason", () => {
    const current = {
      operatingHours: { ...LAUNCH_OPERATING_HOURS, artworkReviewMinutes: 90 },
    };
    const detail = {
      previous: { operatingHours: LAUNCH_OPERATING_HOURS },
      current,
      reviewDelayedOrderIds: ["ord_a", "ord_b"],
    };
    expect(presentAuditAction("settings.operational_update")).toBe(
      "Changed operational settings",
    );
    expect(presentAuditDetail({ action: "settings.operational_update", detail })).toBe(
      "Operating hours: review time 1 hour to 1 hour 30 minutes. 2 waiting orders tagged Review delayed",
    );
    expect(
      presentAuditDetail({
        action: "settings.operational_update",
        detail,
        reason: "Operating hours: review time 1 hour to 1 hour 30 minutes. Busy week",
      }),
    ).toBe("2 waiting orders tagged Review delayed");
    // Another setting saved: the hours did not move and nothing was tagged.
    expect(
      presentAuditDetail({
        action: "settings.operational_update",
        detail: { previous: current, current, reviewDelayedOrderIds: [] },
      }),
    ).toBeNull();
  });
});
