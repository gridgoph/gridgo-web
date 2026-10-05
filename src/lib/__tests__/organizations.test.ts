import { describe, expect, it } from "vitest";

import type { OrganizationAccount } from "@/lib/api/types";
import {
  confirmationLine,
  noticeProblems,
  organizationStanding,
} from "@/lib/organizations";

const officer = {
  id: "officer_1",
  fullName: "Officer One",
  verifiedAt: "2026-07-01T00:00:00.000Z",
};
const account = (patch: Partial<OrganizationAccount> = {}): OrganizationAccount => ({
  userId: "user_org",
  name: "Student Council",
  school: "City College",
  email: "council@example.test",
  currentOfficer: officer,
  confirmedAt: "2026-07-01T00:00:00.000Z",
  nextConfirmationAt: "2026-10-01T00:00:00.000Z",
  confirmationRequestedAt: null,
  approvalCase: { id: "apc", status: "approved", version: 3, applicationRevision: 1 },
  actions: ["confirm_officer", "change_officer"],
  ...patch,
});

describe("noticeProblems", () => {
  it("needs a title and a message within the API's limits", () => {
    expect(noticeProblems({ title: " ", body: "" })).toEqual({
      title: "Give the notice a title.",
      body: "Write the message.",
    });
    expect(noticeProblems({ title: "x".repeat(161), body: "y".repeat(2001) })).toEqual({
      title: "Keep the title to 160 characters.",
      body: "Keep the message to 2000 characters.",
    });
    expect(noticeProblems({ title: "Hello", body: "There" })).toEqual({
      title: null,
      body: null,
    });
  });
});

describe("organizationStanding", () => {
  it("reads the account's officer state", () => {
    expect(organizationStanding(account()).label).toBe("Officer verified");
    expect(
      organizationStanding(
        account({ confirmationRequestedAt: "2026-10-01T00:00:00.000Z" }),
      ).label,
    ).toBe("Officer confirmation due");
    expect(
      organizationStanding(
        account({
          approvalCase: {
            id: "apc",
            status: "pending",
            version: 4,
            applicationRevision: 2,
          },
        }),
      ).label,
    ).toBe("Handover waiting for review");
    expect(
      organizationStanding(account({ currentOfficer: null, approvalCase: null })).label,
    ).toBe("No verified officer");
  });
});

describe("confirmationLine", () => {
  it("says when the next quarterly reminder goes, or that one is waiting", () => {
    expect(confirmationLine(account())).toMatch(
      /^Last confirmed .*Next reminder to confirm Officer One on /,
    );
    expect(
      confirmationLine(account({ confirmationRequestedAt: "2026-10-01T00:00:00.000Z" })),
    ).toMatch(/^Reminder sent .*Waiting for the organization to confirm Officer One/);
    expect(confirmationLine(account({ currentOfficer: null }))).toMatch(
      /start once a first officer is verified/,
    );
  });
});
