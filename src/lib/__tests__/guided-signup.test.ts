import { describe, expect, it } from "vitest";

import {
  currentMission,
  DEFAULT_PRINTS,
  doneCount,
  eligibilityProblems,
  eligibilityValue,
  isEnrolled,
  locationValue,
  minutesLeft,
  missionStates,
  philippineMobile,
  pinStepProblem,
  printsProblems,
  printsValue,
  readSignup,
  readTerms,
  readyToEnroll,
  setupComplete,
  shopProblems,
  shopValue,
  type GuidedSignup,
} from "@/lib/guided-signup";

function signup(nextStep: GuidedSignup["nextStep"], steps: GuidedSignup["steps"] = {}, supplierId: string | null = null): GuidedSignup {
  return { version: 3, supplierId, steps, nextStep };
}

const ELIGIBILITY = { shopKind: "print_shop", registrantRole: "owner", adult: true } as const;
const SHOP = { shopName: "Test Print", contactName: "Test Owner", phone: "+639171234567" };
const LOCATION = { point: { lat: 7.07, lng: 125.61, label: "Door 2" } };
const PRINTS = { groups: ["documents"] };

describe("resume: the first unfinished step comes from GRIDGO's own record", () => {
  it("starts at Your shop with nothing saved", () => {
    const draft = signup("shop", { eligibility: ELIGIBILITY } as GuidedSignup["steps"]);
    expect(currentMission(draft)?.id).toBe("shop");
    expect(doneCount(draft)).toBe(0);
    expect(minutesLeft(draft)).toBe(5);
  });

  it("resumes at the pin after leaving mid-way, with the saved shop counted done", () => {
    const draft = signup("location", { eligibility: ELIGIBILITY, shop: SHOP } as GuidedSignup["steps"]);
    const states = missionStates(draft);
    expect(states.shop).toBe("done");
    expect(states.pin).toBe("current");
    expect(states.prints).toBe("later");
    expect(currentMission(draft)?.id).toBe("pin");
  });

  it("lets pin and prints be done while the shop step waits (phone codes off)", () => {
    const draft = signup("shop", { eligibility: ELIGIBILITY, location: LOCATION, prints: PRINTS } as GuidedSignup["steps"]);
    const states = missionStates(draft);
    expect(states.pin).toBe("done");
    expect(states.prints).toBe("done");
    expect(currentMission(draft)?.id).toBe("shop");
    expect(readyToEnroll(draft)).toBe(false);
  });

  it("opens the shop only once the draft is past prints", () => {
    const draft = signup("enroll", { eligibility: ELIGIBILITY, shop: SHOP, location: LOCATION, prints: PRINTS } as GuidedSignup["steps"]);
    expect(readyToEnroll(draft)).toBe(true);
    expect(currentMission(draft)?.id).toBe("staff");
  });

  it("continues at hours after the shop opens", () => {
    const opened = signup("hours", {}, "shop-1");
    expect(isEnrolled(opened)).toBe(true);
    expect(currentMission(opened)?.id).toBe("hours");
    expect(doneCount(opened)).toBe(4);
  });

  it("reads a manager's shop as waiting for its owner, not stuck", () => {
    const waiting = signup("owner_claim", {}, "shop-1");
    expect(missionStates(waiting).paid).toBe("waiting");
    expect(currentMission(waiting)).toBeNull();
  });

  it("counts setup complete from listing photos on", () => {
    expect(setupComplete(signup("payout", {}, "s"))).toBe(false);
    expect(setupComplete(signup("listing_photos", {}, "s"))).toBe(true);
    expect(setupComplete(signup("complete", {}, "s"))).toBe(true);
  });

  it("falls back to eligibility for an unknown next step", () => {
    expect(readSignup({ version: 1, nextStep: "something_new", steps: {} })?.nextStep).toBe("eligibility");
    expect(readSignup(null)).toBeNull();
  });

  it("reads terms only with GRIDGO's groups and rates, never invented ones", () => {
    expect(readTerms({ printGroups: [], documentRates: {} })).toBeNull();
    const terms = readTerms({
      printGroups: ["documents"],
      locationConsentWording: "Use my pin.",
      payoutConsentWording: "Pay to this QR.",
      documentRates: { bwMinor: 300, colourMinor: 1000 },
    });
    expect(terms?.documentRates.bwMinor).toBe(300);
    expect(terms?.payoutConsentWording).toBe("Pay to this QR.");
  });
});

describe("step 0", () => {
  it("names each missing answer", () => {
    expect(eligibilityProblems({ shopKind: null, registrantRole: null, adult: false })).toEqual({
      shopKind: expect.any(String),
      registrantRole: expect.any(String),
      adult: expect.stringMatching(/18/),
    });
    expect(eligibilityValue({ shopKind: "print_shop", registrantRole: "manager", adult: true })).toEqual({
      shopKind: "print_shop",
      registrantRole: "manager",
      adult: true,
    });
  });
});

describe("Your shop", () => {
  it("normalises Philippine mobiles to +63", () => {
    expect(philippineMobile("0917 123 4567")).toBe("+639171234567");
    expect(philippineMobile("+63 917-123-4567")).toBe("+639171234567");
    expect(philippineMobile("02 8123 4567")).toBeNull();
  });

  it("asks a manager for a different owner mobile", () => {
    const fields = { shopName: "A", contactName: "B", phone: "09171234567", ownerPhone: "09171234567" };
    expect(shopProblems(fields, { manager: true, phoneConfirmed: true }).ownerPhone).toMatch(/different/);
    expect(shopValue({ ...fields, ownerPhone: "0918 765 4321" }, true)).toEqual({
      shopName: "A",
      contactName: "B",
      phone: "+639171234567",
      ownerPhone: "+639187654321",
    });
  });

  it("says to confirm the number before saving", () => {
    const fields = { shopName: "A", contactName: "B", phone: "09171234567", ownerPhone: "" };
    expect(shopProblems(fields, { manager: false, phoneConfirmed: false }).phone).toMatch(/Confirm/);
  });
});

describe("Pin your shop", () => {
  it("says what to fix, in order", () => {
    expect(pinStepProblem(null, "", false)).toMatch(/Place your shop/);
    expect(pinStepProblem({ lat: 14.6, lng: 121 }, "x", true)).toMatch(/outside Davao/);
    expect(pinStepProblem({ lat: 7.07, lng: 125.61 }, "", true)).toMatch(/address/);
    expect(pinStepProblem({ lat: 7.07, lng: 125.61 }, "Door", false)).toMatch(/Tick/);
    expect(pinStepProblem({ lat: 7.07, lng: 125.61 }, "Door", true)).toBeNull();
  });

  it("sends GRIDGO's consent wording back word for word", () => {
    expect(locationValue({ lat: 7.07, lng: 125.61 }, " Door 2 ", "GRIDGO's exact sentence.")).toEqual({
      point: { lat: 7.07, lng: 125.61, label: "Door 2" },
      consent: { accepted: true, wording: "GRIDGO's exact sentence." },
    });
  });
});

describe("What you print", () => {
  it("is right by default", () => {
    expect(printsProblems(DEFAULT_PRINTS)).toEqual({});
    expect(printsValue(DEFAULT_PRINTS)).toEqual({
      groups: ["documents"],
      documents: { papers: ["short", "a4", "long"], colours: ["bw", "colour"], duplex: true },
    });
  });

  it("asks for an A3 price per ticked colour, in minor units", () => {
    const a3 = { ...DEFAULT_PRINTS, papers: [...DEFAULT_PRINTS.papers, "a3" as const] };
    expect(printsProblems(a3).a3).toEqual({ bw: expect.any(String), colour: expect.any(String) });
    const priced = { ...a3, a3Prices: { bw: "8", colour: "25.50" } };
    expect(printsProblems(priced)).toEqual({});
    expect((printsValue(priced).documents as { a3PricesMinor: unknown }).a3PricesMinor).toEqual({ bw: 800, colour: 2550 });
  });

  it("refuses a zero finishing price but allows leaving it empty", () => {
    const draft = { ...DEFAULT_PRINTS, finishing: { stapling: "0", binding: "", photo_paper: "" } };
    expect(printsProblems(draft).finishing?.stapling).toMatch(/above/);
  });
});
