import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { SurveyResponse } from "@/lib/api/types";
import {
  EMPTY_SURVEY_FILTERS,
  TAG_GROUPS,
  filtersFromParams,
  followUpReasons,
  formatAverage,
  formatNps,
  hasNarrowing,
  npsGroup,
  percentOf,
  priceFeelingLabel,
  priceFeelingNear,
  surveyErrorMessage,
  surveyQuery,
  tagLabel,
  writeFilterParams,
} from "@/lib/survey-responses";

const row = (patch: Partial<SurveyResponse> = {}): SurveyResponse => ({
  orderId: "ord_1",
  clientId: "usr_1",
  fulfillmentKind: "delivery",
  completedAt: "2026-10-10T02:00:00.000Z",
  openedAt: "2026-10-10T02:00:00.000Z",
  expiresAt: "2026-10-17T02:00:00.000Z",
  notifiedAt: "2026-10-10T02:00:00.000Z",
  dismissedAt: null,
  submittedAt: "2026-10-11T02:00:00.000Z",
  fulfillmentStars: 5,
  fulfillmentTags: [],
  easeStars: 5,
  easeTags: [],
  priceFeeling: 3,
  expectedPriceMinor: null,
  qualityStars: null,
  recommendScore: null,
  improvementNote: null,
  needsFollowUp: false,
  rewardStatus: "issued",
  rewardVoucherId: "vch_1",
  ...patch,
});

describe("figures", () => {
  it("signs NPS and never shows an empty one as zero", () => {
    expect(formatNps(33.333)).toBe("+33");
    expect(formatNps(-7.6)).toBe("−8");
    expect(formatNps(0.2)).toBe("0");
    expect(formatNps(null)).toBe("—");
  });

  it("rounds averages to one decimal and dashes empty ones", () => {
    expect(formatAverage(4.25)).toBe("4.3");
    expect(formatAverage(3)).toBe("3.0");
    expect(formatAverage(null)).toBe("—");
  });

  it("groups recommend scores the NPS way", () => {
    expect(npsGroup(0)).toBe("detractor");
    expect(npsGroup(6)).toBe("detractor");
    expect(npsGroup(7)).toBe("passive");
    expect(npsGroup(8)).toBe("passive");
    expect(npsGroup(9)).toBe("promoter");
    expect(npsGroup(null)).toBeNull();
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(1, 0)).toBe(0);
  });

  it("names the price scale in the client's words", () => {
    expect(priceFeelingLabel(1)).toBe("Very cheap");
    expect(priceFeelingLabel(5)).toBe("Very expensive");
    expect(priceFeelingNear(2.6)).toBe("Fair");
    expect(priceFeelingNear(null)).toBeNull();
  });

  it("reads an unknown tag as words, never a code", () => {
    expect(tagLabel("late")).toBe("Arrived late");
    expect(tagLabel("brand_new_tag")).toBe("Brand new tag");
  });

  it("lists every tag code once in the filter menu", () => {
    const codes = TAG_GROUPS.flatMap((group) => group.tags);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain("damaged_package");
    expect(codes).toContain("slow_app");
    expect(codes).toContain("long_wait");
  });
});

describe("followUpReasons", () => {
  it("names each low star score and a detractor recommend score", () => {
    expect(
      followUpReasons(
        row({ fulfillmentKind: "pickup", fulfillmentStars: 2, easeStars: 1, qualityStars: 2, recommendScore: 6 }),
      ),
    ).toEqual([
      "Pick-up rated 2 of 5",
      "Ordering rated 1 of 5",
      "Print quality rated 2 of 5",
      "Recommend score 6 of 10",
    ]);
  });

  it("never treats price feeling or a passive score as a reason", () => {
    expect(followUpReasons(row({ priceFeeling: 1, recommendScore: 7, fulfillmentStars: 3 }))).toEqual([]);
  });
});

describe("filters", () => {
  it("drops anything malformed from the URL", () => {
    const filters = filtersFromParams(
      new URLSearchParams(
        "followUp=maybe&kind=courier&reward=issued&from=2026-10-01&to=yesterday&fulfillmentStars=6&recommendScore=0&easeStars=2.5&tag=late",
      ),
    );
    expect(filters).toEqual({
      ...EMPTY_SURVEY_FILTERS,
      reward: "issued",
      from: "2026-10-01",
      recommendScore: "0",
      tag: "late",
    });
  });

  it("sends whole Manila days, both included, and exact scores", () => {
    const query = surveyQuery({
      ...EMPTY_SURVEY_FILTERS,
      followUp: "true",
      from: "2026-10-01",
      to: "2026-10-14",
      recommendScore: "0",
      clientId: "usr_9",
    });
    expect(query).toMatchObject({
      needsFollowUp: true,
      from: "2026-09-30T16:00:00.000Z",
      to: "2026-10-14T15:59:59.999Z",
      recommendScore: 0,
      clientId: "usr_9",
    });
    expect(query.fulfillmentStars).toBeUndefined();
    expect(surveyQuery({ ...EMPTY_SURVEY_FILTERS, followUp: "false" }).needsFollowUp).toBe(false);
    expect(surveyQuery(EMPTY_SURVEY_FILTERS).needsFollowUp).toBeUndefined();
  });

  it("writes filters back without touching the open response", () => {
    const next = writeFilterParams(new URLSearchParams("response=ord_7&tag=late"), {
      ...EMPTY_SURVEY_FILTERS,
      kind: "pickup",
      clientId: "usr_2",
    });
    expect(next.get("response")).toBe("ord_7");
    expect(next.get("tag")).toBeNull();
    expect(next.get("kind")).toBe("pickup");
    expect(next.get("client")).toBe("usr_2");
    expect(filtersFromParams(next).clientId).toBe("usr_2");
  });

  it("counts the follow-up switch apart from other narrowing", () => {
    expect(hasNarrowing({ ...EMPTY_SURVEY_FILTERS, followUp: "true" })).toBe(false);
    expect(hasNarrowing({ ...EMPTY_SURVEY_FILTERS, qualityStars: "1" })).toBe(true);
  });
});

describe("surveyErrorMessage", () => {
  it("explains the API's refusals in plain words", () => {
    expect(surveyErrorMessage(new ApiError(403, { error: "forbidden" }), "x")).toBe(
      "Only Super Admin can read survey responses.",
    );
    expect(surveyErrorMessage(new ApiError(400, { error: "invalid_survey_filter" }), "x")).toMatch(/Clear the filters/);
    expect(surveyErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});
