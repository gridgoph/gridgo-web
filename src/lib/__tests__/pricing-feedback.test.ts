import { describe, expect, it } from "vitest";

import {
  PRICING_QUESTIONS,
  accountTypeLabel,
  answeredLine,
  deskView,
  directShopLabel,
  exitAnswerLabel,
  exitFiltersFromParams,
  exitReasonLabel,
  formatPercent,
  leadingCodes,
  orderAgainLabel,
  orderSizeLabel,
  priceWorthLabel,
  writeExitFilterParams,
} from "@/lib/pricing-feedback";
import {
  filtersFromParams,
  pricingQuery,
  surveyQuery,
  writeFilterParams,
} from "@/lib/survey-responses";

describe("pricing answer words", () => {
  it("reads every API code in the client app's own words", () => {
    // gridgo-client lib/survey.ts and lib/checkoutExit.ts
    expect(
      [
        "much_cheaper",
        "cheaper",
        "about_the_same",
        "more_expensive",
        "much_more_expensive",
        "not_sure",
      ].map(directShopLabel),
    ).toEqual([
      "Much cheaper",
      "Cheaper",
      "About the same",
      "More expensive",
      "Much more expensive",
      "Not sure",
    ]);
    expect(
      [
        "print_quality",
        "on_time",
        "door_delivery",
        "no_shop_visits",
        "quality_check",
        "easy_ordering",
        "clear_upfront_price",
        "helpful_support",
        "other",
        "not_worth_it",
      ].map(priceWorthLabel),
    ).toEqual([
      "Print quality",
      "Ready on time",
      "Delivered to my door",
      "No trips to print shops",
      "Artwork checked before printing",
      "Easy ordering",
      "Clear price up front",
      "Helpful support",
      "Something else",
      "It was not worth it",
    ]);
    expect(["yes", "maybe", "no"].map(orderAgainLabel)).toEqual(["Yes", "Maybe", "No"]);
    expect(
      [
        "price_too_high",
        "delivery_cost_or_time",
        "still_deciding",
        "payment_problem",
        "found_another_option",
        "just_browsing",
        "other",
      ].map(exitReasonLabel),
    ).toEqual([
      "The price was too high",
      "Delivery cost or time",
      "Still deciding",
      "Trouble paying",
      "Found another option",
      "Just looking around",
      "Other",
    ]);
  });

  it("reads a code this build has never seen as words, never as a code", () => {
    expect(directShopLabel("way_cheaper")).toBe("Way cheaper");
    expect(exitReasonLabel("shop_closed")).toBe("Shop closed");
    expect(orderSizeLabel("1m_and_up")).toBe("1m and up");
    expect(accountTypeLabel("cooperative")).toBe("Cooperative");
  });

  it("covers every question the API counts, in the order the client answers", () => {
    expect(PRICING_QUESTIONS.map((question) => question.key)).toEqual([
      "priceFeeling",
      "expectedPrice",
      "directShopComparison",
      "orderAgainAtPrice",
      "priceWorthTags",
    ]);
    const feeling = PRICING_QUESTIONS[0];
    expect(["very_cheap", "fair", "very_expensive"].map(feeling.label)).toEqual([
      "Very cheap",
      "Fair",
      "Very expensive",
    ]);
  });
});

describe("reading a tally", () => {
  it("formats shares without inventing a zero for nobody", () => {
    expect(formatPercent(38.5)).toBe("38.5%");
    expect(formatPercent(100)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(null)).toBe("—");
  });

  it("marks every option tied for the most answers, and none when nobody answered", () => {
    const options = (counts: number[]) =>
      counts.map((count, index) => ({ code: `o${index}`, count, percent: null }));
    expect(leadingCodes({ answered: 4, options: options([1, 2, 1]) })).toEqual(["o1"]);
    expect(leadingCodes({ answered: 4, options: options([2, 2, 0]) })).toEqual([
      "o0",
      "o1",
    ]);
    expect(leadingCodes({ answered: 0, options: options([0, 0]) })).toEqual([]);
  });

  it("says how many answered against how many responses match", () => {
    expect(answeredLine(12, 13)).toBe("12 of 13 answered");
    expect(answeredLine(13, 13)).toBe("All 13 answered");
    expect(answeredLine(0, 13)).toBe("Nobody answered this yet");
    expect(answeredLine(0, 0)).toBe("No responses match");
  });
});

describe("checkout exit answers", () => {
  it("names what the client did", () => {
    expect(exitAnswerLabel({ status: "answered", reason: "payment_problem" })).toBe(
      "Trouble paying",
    );
    expect(exitAnswerLabel({ status: "skipped", reason: null })).toBe("Skipped");
    expect(exitAnswerLabel({ status: "unanswered", reason: null })).toBe(
      "Closed without answering",
    );
  });

  it("keeps the list's own filters in the URL and drops anything GRIDGO refuses", () => {
    const params = new URLSearchParams("view=exits&exitStatus=skipped&exitReason=nope");
    expect(exitFiltersFromParams(params)).toEqual({ status: "skipped", reason: "" });
    expect(
      writeExitFilterParams(params, { status: "", reason: "other" }).toString(),
    ).toBe("view=exits&exitReason=other");
    expect(deskView("exits")).toBe("exits");
    expect(deskView("anything")).toBe("responses");
  });
});

describe("the filters every tab shares", () => {
  it("reads category, order size and account type from the URL and sends them to both reads", () => {
    const filters = filtersFromParams(
      new URLSearchParams(
        "category=marketing_collateral&size=20000_and_up&account=organization&from=2026-10-01&tag=late",
      ),
    );
    expect(pricingQuery(filters)).toEqual({
      from: "2026-09-30T16:00:00.000Z",
      to: undefined,
      categoryCode: "marketing_collateral",
      orderSize: "20000_and_up",
      accountType: "organization",
    });
    expect(surveyQuery(filters)).toEqual(
      expect.objectContaining({
        categoryCode: "marketing_collateral",
        orderSize: "20000_and_up",
        tag: "late",
      }),
    );
    expect(
      writeFilterParams(new URLSearchParams("view=pricing"), filters).toString(),
    ).toBe(
      "view=pricing&tag=late&from=2026-10-01&category=marketing_collateral&size=20000_and_up&account=organization",
    );
  });

  it("drops a size, account type or category code GRIDGO would refuse", () => {
    const filters = filtersFromParams(
      new URLSearchParams("category=DROP%20TABLE&size=huge&account=robot"),
    );
    expect([filters.categoryCode, filters.orderSize, filters.accountType]).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("names the order size brackets the API uses", () => {
    expect(orderSizeLabel("under_500")).toBe("Under ₱500");
    expect(orderSizeLabel("2000_to_4999")).toBe("₱2,000 to ₱4,999");
    expect(orderSizeLabel(null)).toBe("No price");
  });
});
