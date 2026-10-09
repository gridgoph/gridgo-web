import { describe, expect, it } from "vitest";

import type { LegalAcceptance, LegalDocument, LegalDraft, LegalVersion } from "@/lib/api/types";
import {
  acceptanceStanding,
  currentVersion,
  documentIdError,
  documentIdFromTitle,
  draftIsUnpublished,
  isoToManilaInput,
  manilaInputToIso,
  publishMateriality,
  scheduledVersions,
  signupChoices,
  sortLegalDocuments,
  validateLegalDraft,
} from "@/lib/legal";

const NOW = Date.parse("2026-10-09T08:00:00Z");

function draft(over: Partial<LegalDraft> = {}): LegalDraft {
  return {
    title: "Supplier Agreement",
    audience: "supplier",
    text: "Placeholder text",
    pdfFileId: null,
    placeholder: true,
    material: false,
    penalties: false,
    changeSummary: "Launch placeholder",
    effectiveAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function version(n: number, over: Partial<LegalVersion> = {}): LegalVersion {
  const base = draft(over);
  return {
    ...base,
    id: `supplier-agreement-${n}`,
    documentId: "supplier-agreement",
    version: n,
    pdfUrl: null,
    publishedAt: base.effectiveAt,
    status: base.placeholder ? "placeholder" : "live",
    ...over,
  } as LegalVersion;
}

function doc(versions: LegalVersion[], over: Partial<LegalDocument> = {}): LegalDocument {
  const latest = versions[versions.length - 1];
  return {
    id: "supplier-agreement",
    revision: 1,
    launchSlot: true,
    draft: latest ? draft({ ...latest }) : draft(),
    versions,
    ...over,
  };
}

function acceptance(n: number, over: Partial<LegalAcceptance> = {}): LegalAcceptance {
  return {
    id: `acc-${n}`,
    user_id: "user_a",
    version_id: `supplier-agreement-${n}`,
    document_id: "supplier-agreement",
    version: n,
    accepted_at: "2026-02-01T00:00:00Z",
    method: "blocking_screen",
    app: "gridgo-supplier/1.2.0",
    device: "install-1",
    purpose: "document",
    order_id: null,
    marketing: null,
    junior: null,
    guardian: null,
    ...over,
  };
}

describe("publishMateriality (mirrors the API's enforced flag)", () => {
  const placeholderOnly = doc([version(1)]);

  it("never makes a placeholder material", () => {
    expect(publishMateriality(placeholderOnly, draft({ material: true }))).toEqual({
      material: false,
      reason: null,
    });
  });

  it("forces the first real text to be material even when the editor said editorial", () => {
    expect(publishMateriality(placeholderOnly, draft({ placeholder: false, material: false }))).toEqual({
      material: true,
      reason: "first_real",
    });
  });

  it("forces audience and penalties changes, and otherwise keeps the editor's choice", () => {
    const real = doc([version(1), version(2, { placeholder: false, material: true })]);
    expect(publishMateriality(real, draft({ placeholder: false, audience: "all" })).reason).toBe("audience");
    expect(publishMateriality(real, draft({ placeholder: false, penalties: true })).reason).toBe("penalties");
    expect(publishMateriality(real, draft({ placeholder: false, material: true })).reason).toBe("chosen");
    expect(publishMateriality(real, draft({ placeholder: false, material: false }))).toEqual({
      material: false,
      reason: null,
    });
  });
});

describe("validateLegalDraft", () => {
  it("needs text or a PDF, a title and a change summary", () => {
    const errors = validateLegalDraft(doc([version(1)]), draft({ text: " ", title: "", changeSummary: "" }));
    expect(Object.keys(errors).sort()).toEqual(["changeSummary", "content", "title"]);
    expect(validateLegalDraft(doc([version(1)]), draft({ text: "", pdfFileId: "file_1" }))).toEqual({});
  });

  it("allows penalties only on a real Supplier Agreement", () => {
    expect(validateLegalDraft(doc([version(1)]), draft({ penalties: true })).penalties).toMatch(/real text/);
    const terms = doc([version(1)], { id: "terms-of-service" });
    expect(validateLegalDraft(terms, draft({ placeholder: false, penalties: true })).penalties).toMatch(
      /Only the Supplier Agreement/,
    );
  });

  it("refuses, at publish, a return to placeholder and a date before the previous version", () => {
    const real = doc([version(1), version(2, { placeholder: false, effectiveAt: "2026-06-01T00:00:00Z" })]);
    const errors = validateLegalDraft(real, draft({ effectiveAt: "2026-05-01T00:00:00Z" }), { forPublish: true });
    expect(errors.placeholder).toMatch(/cannot go back/);
    expect(errors.effectiveAt).toMatch(/version 2/);
    // Saving a draft is not publishing: the same draft saves.
    expect(validateLegalDraft(real, draft({ effectiveAt: "2026-05-01T00:00:00Z" })).placeholder).toBeUndefined();
  });

  it("keeps a launch document's audience", () => {
    expect(validateLegalDraft(doc([version(1)]), draft({ audience: "all" })).audience).toBeDefined();
  });
});

describe("versions in time", () => {
  const d = doc([
    version(1),
    version(2, { placeholder: false, material: true, effectiveAt: "2026-03-01T00:00:00Z" }),
    version(3, { placeholder: false, effectiveAt: "2026-12-01T00:00:00Z" }),
  ]);

  it("reads the highest version in effect and lists the scheduled one", () => {
    expect(currentVersion(d, NOW)?.version).toBe(2);
    expect(scheduledVersions(d, NOW).map((v) => v.version)).toEqual([3]);
  });

  it("sees a saved draft that is not yet published", () => {
    expect(draftIsUnpublished(d)).toBe(false);
    expect(draftIsUnpublished({ ...d, draft: { ...d.draft, text: "Changed" } })).toBe(true);
    // The draft keeps the editor's material choice; the version the enforced flag.
    expect(draftIsUnpublished({ ...d, draft: { ...d.draft, material: true } })).toBe(false);
    expect(draftIsUnpublished(doc([], { launchSlot: false }))).toBe(true);
  });
});

describe("acceptanceStanding", () => {
  it("asks a person who skipped a material version to accept again", () => {
    const d = doc([version(1), version(2, { placeholder: false, material: true })]);
    const standing = acceptanceStanding(d, [acceptance(1)], NOW);
    expect(standing).toMatchObject({ tone: "warning", label: "Must accept version 2", acceptedVersion: 1 });
  });

  it("treats an editorial version as a notice, not a new acceptance", () => {
    const d = doc([
      version(1, { placeholder: false, material: true }),
      version(2, { placeholder: false, material: false }),
    ]);
    expect(acceptanceStanding(d, [acceptance(1)], NOW)?.label).toBe("Accepted version 1");
  });

  it("labels a placeholder acceptance as not standing for the real text", () => {
    const standing = acceptanceStanding(doc([version(1)]), [acceptance(1)], NOW);
    expect(standing?.label).toBe("Accepted placeholder, version 1");
    expect(standing?.detail).toMatch(/does not count/);
  });

  it("does not count artwork rights as accepting the document", () => {
    const d = doc([version(1)]);
    expect(acceptanceStanding(d, [acceptance(1, { purpose: "artwork", order_id: "ord_1" })], NOW)?.label).toBe(
      "Not accepted yet",
    );
  });

  it("is up to date on the current real version", () => {
    const d = doc([version(1), version(2, { placeholder: false, material: true })]);
    expect(acceptanceStanding(d, [acceptance(1), acceptance(2)], NOW)?.tone).toBe("success");
  });
});

describe("helpers", () => {
  it("reads and writes effective dates in Philippine time", () => {
    expect(isoToManilaInput("2026-10-09T16:00:00.000Z")).toBe("2026-10-10T00:00");
    expect(manilaInputToIso("2026-10-10T00:00")).toBe("2026-10-09T16:00:00.000Z");
    expect(manilaInputToIso("2026-10-10")).toBe("");
  });

  it("derives a valid document ID from a title", () => {
    expect(documentIdFromTitle("Refund & Returns Policy")).toBe("refund-and-returns-policy");
    expect(documentIdFromTitle("2026 Promo Terms")).toBe("promo-terms");
    expect(documentIdError("ab", [])).toMatch(/3 to 80/);
    expect(documentIdError("terms-of-service", ["terms-of-service"])).toMatch(/already/);
    expect(documentIdError("refund-policy", [])).toBeNull();
  });

  it("orders the launch slots first, then added documents by title", () => {
    const extra = doc([], { id: "zeta", launchSlot: false, draft: draft({ title: "Zeta" }) });
    const terms = doc([], { id: "terms-of-service" });
    const privacy = doc([], { id: "privacy-notice" });
    expect(sortLegalDocuments([extra, privacy, terms]).map((d) => d.id)).toEqual([
      "terms-of-service",
      "privacy-notice",
      "zeta",
    ]);
  });

  it("describes sign-up choices only on sign-up rows", () => {
    expect(signupChoices(acceptance(1))).toBeNull();
    expect(
      signupChoices(acceptance(1, { purpose: "enrollment", marketing: false, junior: true, guardian: true })),
    ).toBe("No marketing. Under 18, guardian agreed");
  });
});
