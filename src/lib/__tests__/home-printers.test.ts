import { describe, expect, it } from "vitest";

import {
  agreementState,
  ageOn,
  checkAge,
  effectiveReason,
  manilaToday,
  minimumAgeFrom,
  pauseLine,
  readHomePrinter,
  starterBlockers,
  starterFiles,
  starterRefusal,
  type HomePrinterRead,
} from "@/lib/home-printers";

function body(over: { homePrinter?: Record<string, unknown>; [k: string]: unknown } = {}) {
  const { homePrinter, ...rest } = over;
  return {
    version: 3,
    homePrinter: {
      printerType: "home",
      symbol: "house",
      level: "pending",
      verified: false,
      online: false,
      offersPaused: true,
      reason: "home_starter_review_required",
      deadlineAt: "2026-12-18T02:00:00.000Z",
      weeklyJobs: 4,
      weeklyJobCap: 30,
      offlineUntil: null,
      allowHomePickup: false,
      ...homePrinter,
    },
    pin: { point: { lat: 7.1, lng: 125.6, label: "Example Street" }, barangay: "Barangay One", street: "Example Street", propertyType: "house", landmark: null },
    starterEvidence: null,
    verificationDocuments: [
      { fileId: "f_id", documentType: "valid_id" },
      { fileId: "f_selfie", documentType: "id_selfie" },
      { fileId: "f_print", documentType: "sample_work" },
    ],
    ...rest,
  };
}

const read = (over?: Parameters<typeof body>[0]) => readHomePrinter(body(over)) as HomePrinterRead;

describe("home printer staff read", () => {
  it("reads the record and draws nothing without one", () => {
    const r = read();
    expect(r.version).toBe(3);
    expect(r.status).toMatchObject({ level: "pending", weeklyJobs: 4, weeklyJobCap: 30, reason: "home_starter_review_required" });
    expect(r.pin).toMatchObject({ barangay: "Barangay One", street: "Example Street", lat: 7.1, propertyType: "house" });
    expect(Object.keys(starterFiles(r))).toEqual(["valid_id", "id_selfie", "sample_work"]);
    expect(readHomePrinter(null)).toBeNull();
    expect(readHomePrinter({ version: 1 })).toBeNull();
    expect(readHomePrinter({ homePrinter: {} })).toBeNull();
  });

  it("reads the file agreement from the first missing step", () => {
    expect(agreementState(read().status)).toBe("agreed");
    expect(agreementState(read({ homePrinter: { reason: "home_file_privacy_required" } }).status)).toBe("missing");
    expect(agreementState(read({ homePrinter: { reason: "home_pin_consent_required" } }).status)).toBe("unknown");
  });

  it("reads an offline printer with no location as offline, not away from its pin", () => {
    const away = read({ homePrinter: { reason: "home_away_from_pin", online: false } }).status;
    expect(effectiveReason(away)).toBe("home_offline");
    expect(pauseLine(away, String)).toBe("Their online switch is off.");
    const moved = read({ homePrinter: { reason: "home_away_from_pin", online: true } }).status;
    expect(pauseLine(moved, String)).toMatch(/more than 300 m/);
    expect(pauseLine(read({ homePrinter: { reason: "home_weekly_cap" } }).status, String)).toMatch(/30 jobs this week/);
    expect(pauseLine(read({ homePrinter: { reason: null, offersPaused: false } }).status, String)).toBeNull();
  });
});

describe("the adult-age check", () => {
  it("counts whole years on the Manila calendar, as the API does", () => {
    // 16:30 UTC on 13 March is already 14 March in Manila.
    expect(manilaToday(new Date("2026-03-13T16:30:00Z"))).toBe("2026-03-14");
    expect(ageOn("2008-03-14", "2026-03-14")).toBe(18);
    expect(ageOn("2008-03-15", "2026-03-14")).toBe(17);
    expect(ageOn("2008-02-30", "2026-03-14")).toBeNull();
  });

  it("says adult, under-age, future or not a date before anything is sent", () => {
    expect(checkAge("", 18, "2026-11-24")).toEqual({ kind: "empty" });
    expect(checkAge("2001-03-14", 18, "2026-11-24")).toEqual({ kind: "adult", age: 25, minimum: 18 });
    expect(checkAge("2010-05-02", 18, "2026-11-24")).toEqual({ kind: "under", age: 16, minimum: 18 });
    expect(checkAge("2027-01-01", 18, "2026-11-24")).toEqual({ kind: "future" });
    expect(checkAge("2001-13-01", 18, "2026-11-24")).toEqual({ kind: "invalid" });
    expect(checkAge("2006-01-01", 21, "2026-11-24")).toMatchObject({ kind: "under", age: 20, minimum: 21 });
  });

  it("takes the minimum age from GRIDGO's settings", () => {
    expect(minimumAgeFrom({ homePrinter: { minimumAgeYears: 21 } })).toBe(21);
    expect(minimumAgeFrom({})).toBe(18);
    expect(minimumAgeFrom(null)).toBe(18);
  });
});

describe("what stops Approve as Starter", () => {
  const adult = checkAge("2001-03-14", 18, "2026-11-24");

  it("nothing once the files, the agreement, an adult date and the check are in", () => {
    expect(starterBlockers(read(), adult, true)).toEqual([]);
  });

  it("names every missing step in the reviewer's words", () => {
    const missing = read({
      homePrinter: { reason: "home_file_privacy_required" },
      verificationDocuments: [{ fileId: "f_id", documentType: "valid_id" }],
    });
    expect(starterBlockers(missing, checkAge("", 18), false)).toEqual([
      "They have not sent the selfie with the ID and the test print yet.",
      "They have not agreed to keep client files private yet.",
      "Enter the date of birth from the ID.",
    ]);
    expect(starterBlockers(read(), checkAge("2010-05-02", 18, "2026-11-24"), true)).toEqual([
      "The ID shows 16. Starter needs 18 or older.",
    ]);
    expect(starterBlockers(read(), adult, false)).toEqual([
      "Tick that you compared the ID with the selfie and looked at the test print.",
    ]);
  });

  it("puts the API's refusals in plain words", () => {
    expect(starterRefusal("home_adult_id_required", 18)).toMatch(/18 or older/);
    expect(starterRefusal("home_starter_documents_required", 18)).toMatch(/current files are shown now/);
    expect(starterRefusal("home_file_privacy_required", 18)).toMatch(/keep client files private/);
    expect(starterRefusal("shop_profile_stale", 18)).toMatch(/changed while you were reviewing/);
    expect(starterRefusal("something_else", 18)).toBeNull();
  });
});
