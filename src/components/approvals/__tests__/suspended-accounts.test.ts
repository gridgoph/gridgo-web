import { describe, expect, it } from "vitest";

import {
  collectSuspendedAccounts,
  preselectedServiceIds,
  queueView,
  reinstateConsequence,
  reinstateOutcome,
  suspensionBannerText,
  suspensionsByUser,
  type SuspendedAccount,
} from "@/components/approvals/suspended-accounts";
import type { ApprovalCaseQueueItem, SuspendedServiceLine, User } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

const SEP_18 = "2026-09-18T02:00:00.000Z";

const dara: User = {
  id: "user_dara",
  email: "dara@blueprint.ph",
  name: "Dara Cruz",
  role: "supplier",
  supplierName: "Dara Blueprint",
  verificationStatus: "suspended",
  verificationNote: "Verification suspended",
  verifiedAt: SEP_18,
  verifiedBy: "user_ops",
};

const daraCase: ApprovalCaseQueueItem = {
  id: "apc_dara",
  kind: "supplier",
  status: "suspended",
  version: 3,
  applicationRevision: 1,
  submittedAt: "2026-08-01T00:00:00.000Z",
  decidedAt: SEP_18,
  rejectionReason: null,
  suspensionReason: "Verification suspended",
  updatedAt: SEP_18,
  applicant: { id: "user_dara", email: dara.email, name: dara.name, createdAt: "" },
  decidedBy: "user_ops",
};

const directory = new Map([["user_ops", "Ana Reyes"]]);

const lines: SuspendedServiceLine[] = [
  {
    id: "svc_tarp",
    name: "Tarpaulin printing",
    suspendedAt: SEP_18,
    suspendReason: "supplier_verification_suspended",
    suspendedWithAccount: true,
  },
  {
    id: "svc_sticker",
    name: "Stickers",
    suspendedAt: SEP_18,
    suspendReason: "supplier_verification_suspended",
    suspendedWithAccount: true,
  },
  {
    id: "svc_mug",
    name: "Mugs",
    suspendedAt: "2026-09-02T00:00:00.000Z",
    suspendReason: "Ink smudging",
    suspendedWithAccount: false,
  },
];

describe("queueView", () => {
  it("reads the deep link and falls back to everything", () => {
    expect(queueView("suspended")).toBe("suspended");
    expect(queueView("nonsense")).toBe("all");
    expect(queueView(null)).toBe("all");
  });
});

describe("collectSuspendedAccounts", () => {
  it("prefers the approval case, so line restore stays possible", () => {
    const [account] = collectSuspendedAccounts({
      cases: [daraCase],
      people: [dara],
      business: [],
      directory,
    });
    expect(account).toMatchObject({
      caseId: "apc_dara",
      caseVersion: 3,
      title: "Dara Blueprint",
      suspendedBy: "Ana Reyes",
      suspendedAt: SEP_18,
    });
  });

  it("still lists a legacy suspension that has no case behind it", () => {
    const accounts = collectSuspendedAccounts({
      cases: [],
      people: [dara],
      business: [],
      directory,
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ caseId: null, suspendedBy: "Ana Reyes" });
  });

  it("uses the API's display name before the directory", () => {
    const [account] = collectSuspendedAccounts({
      cases: [{ ...daraCase, decidedByName: "Jo Santos" }],
      people: [dara],
      business: [],
      directory,
    });
    expect(account!.suspendedBy).toBe("Jo Santos");
  });
});

describe("suspensionBannerText", () => {
  const account = {
    suspendedAt: SEP_18,
    suspendedBy: "Ana Reyes",
    reason: "Unpaid shop rent",
  } as SuspendedAccount;

  it("says when, who and why in one line", () => {
    expect(suspensionBannerText(account)).toBe(
      `Suspended on ${formatDate(SEP_18)} by Ana Reyes: Unpaid shop rent`,
    );
  });

  it("does not pass the legacy placeholder off as a reason", () => {
    expect(suspensionBannerText({ ...account, reason: "Verification suspended" })).toBe(
      `Suspended on ${formatDate(SEP_18)} by Ana Reyes: no reason was recorded`,
    );
  });

  it("leaves out what it does not know", () => {
    expect(
      suspensionBannerText({ ...account, suspendedBy: null, suspendedAt: null }),
    ).toBe("Suspended: Unpaid shop rent");
  });
});

describe("reinstate choices", () => {
  it("pre-ticks only lines suspended with the account", () => {
    expect(preselectedServiceIds(lines)).toEqual(["svc_tarp", "svc_sticker"]);
  });

  it("explains what happens in one sentence", () => {
    const base = { name: "Dara Blueprint", kind: "supplier" as const, lines };
    expect(reinstateConsequence({ ...base, selected: ["svc_tarp", "svc_sticker"] })).toBe(
      "Dara Blueprint can be matched to new work again and 2 service lines go back live; the other one stays suspended.",
    );
    expect(reinstateConsequence({ ...base, selected: ["svc_tarp"] })).toBe(
      "Dara Blueprint can be matched to new work again and 1 service line goes back live; the other 2 stay suspended.",
    );
    expect(reinstateConsequence({ ...base, selected: [] })).toMatch(
      /all 3 service lines stay suspended/,
    );
    expect(reinstateConsequence({ ...base, lines: null, selected: [] })).toMatch(
      /every suspended service line stays suspended/,
    );
  });

  it("counts as restored only what the server says it restored", () => {
    expect(
      reinstateOutcome({
        name: "Dara Blueprint",
        lines,
        requested: ["svc_tarp"],
        restoredServiceIds: ["svc_tarp"],
      }),
    ).toEqual({
      headline: "Dara Blueprint is reinstated.",
      restored: ["Tarpaulin printing"],
      stillSuspended: ["Stickers", "Mugs"],
    });
    expect(
      reinstateOutcome({
        name: "Dara Blueprint",
        lines,
        requested: ["svc_tarp"],
        restoredServiceIds: undefined,
      }).headline,
    ).toMatch(/did not confirm any service lines/);
  });
});

describe("suspensionsByUser", () => {
  it("indexes case and legacy suspensions by person", () => {
    const rider: User = {
      id: "user_rider",
      email: "r@x.ph",
      name: "Rafa",
      role: "rider",
      verificationStatus: "suspended",
      verificationNote: "No licence",
      verifiedAt: SEP_18,
    };
    const index = suspensionsByUser({
      cases: [daraCase],
      users: [dara, rider],
      directory,
    });
    expect(index.get("user_dara")).toMatchObject({
      kinds: ["supplier"],
      suspendedBy: "Ana Reyes",
    });
    expect(index.get("user_rider")).toMatchObject({
      kinds: ["rider"],
      reason: "No licence",
    });
  });
});
