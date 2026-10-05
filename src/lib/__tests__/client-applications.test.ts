import { describe, expect, it } from "vitest";

import type { BusinessApplication } from "@/lib/api/types";
import {
  applicationChecklist,
  applicationTrack,
  governmentIdLabel,
  missingDocuments,
  needsChecklistResubmission,
  reviewProgress,
  sendBackReason,
} from "@/lib/client-applications";

const base = { businessName: "Org", businessNature: "Events", schemaVersion: 1 } as const;
const organization: BusinessApplication = {
  ...base,
  accountType: "organization",
  documents: { government_id: "f1", student_id: "f2", enrollment_document: "f3" },
};
const keys = (application: BusinessApplication) =>
  applicationChecklist(application).map((item) => [item.key, item.required]);

describe("applicationChecklist", () => {
  it("asks an organization for the ID, student ID and enrolment, recognition optional", () => {
    expect(keys(organization)).toEqual([
      ["government_id", true],
      ["student_id", true],
      ["enrollment_document", true],
      ["school_recognition_certificate", false],
    ]);
  });

  it("asks a sole proprietor for the DTI certificate, permit optional", () => {
    expect(
      keys({ ...base, accountType: "business", businessType: "sole_proprietor" }),
    ).toEqual([
      ["government_id", true],
      ["payout_bank_proof", true],
      ["bir_2303", true],
      ["dti_certificate", true],
      ["business_permit", false],
    ]);
  });

  it("asks partnerships and corporations for the SEC set", () => {
    for (const businessType of ["partnership", "corporation"] as const) {
      expect(
        keys({ ...base, accountType: "business", businessType }).map(([key]) => key),
      ).toEqual([
        "government_id",
        "payout_bank_proof",
        "bir_2303",
        "sec_certificate",
        "articles_and_bylaws",
        "general_information_sheet",
        "signatory_authorization",
        "business_permit",
      ]);
    }
  });

  it("makes the permit required once Operations asked for it", () => {
    const asked: BusinessApplication = {
      ...base,
      accountType: "business",
      businessType: "sole_proprietor",
      businessPermitRequired: true,
      documents: {
        government_id: "a",
        payout_bank_proof: "b",
        bir_2303: "c",
        dti_certificate: "d",
      },
    };
    expect(missingDocuments(asked).map((item) => item.key)).toEqual(["business_permit"]);
  });

  it("has no checklist for a name-only application from before the rollout", () => {
    const legacy: BusinessApplication = {
      businessName: "Old",
      businessNature: null,
      accountType: "business",
    };
    expect(needsChecklistResubmission(legacy)).toBe(true);
    expect(applicationTrack(legacy)).toBeNull();
    expect(applicationChecklist(legacy)).toEqual([]);
    expect(needsChecklistResubmission(organization)).toBe(false);
  });

  it("lists a required document with no file as missing", () => {
    expect(
      missingDocuments({ ...organization, documents: { government_id: "f1" } }).map(
        (item) => item.label,
      ),
    ).toEqual(["Student ID", "Enrolment document"]);
  });
});

describe("review marks", () => {
  const items = applicationChecklist(organization);

  it("write a send-back reason the applicant can read", () => {
    expect(
      sendBackReason(
        items,
        { government_id: "ok", student_id: "redo", enrollment_document: "redo" },
        {
          student_id: "  Photo is cut off  ",
        },
      ),
    ).toBe(
      "Please upload these again:\n- Student ID: Photo is cut off\n- Enrolment document",
    );
    expect(sendBackReason(items, { government_id: "ok" }, {})).toBe("");
  });

  it("count only documents on file, so an absent optional one never blocks", () => {
    expect(reviewProgress(organization, {})).toEqual({
      onFile: 3,
      checked: 0,
      redo: 0,
      allChecked: false,
    });
    expect(
      reviewProgress(organization, {
        government_id: "ok",
        student_id: "ok",
        enrollment_document: "ok",
      }).allChecked,
    ).toBe(true);
  });
});

it("words the ID with its expiry, or none", () => {
  expect(
    governmentIdLabel({
      fullName: "A",
      governmentIdType: "passport",
      governmentIdExpiresOn: "2030-01-01",
    }),
  ).toBe("Passport, valid until Jan 1, 2030");
  expect(
    governmentIdLabel({
      fullName: "A",
      governmentIdType: "philid",
      governmentIdHasNoExpiry: true,
    }),
  ).toBe("PhilID, no expiry");
});
