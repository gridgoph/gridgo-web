// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CheckoutExitAnswer,
  PricingFeedbackReport,
  PricingQuestionTally,
  SurveyResponsesPage,
} from "@/lib/api/types";

vi.setConfig({ testTimeout: 30_000 });

const api = vi.hoisted(() => ({
  getPricingFeedback: vi.fn(),
  downloadPricingFeedback: vi.fn(),
  listCheckoutExitFeedback: vi.fn(),
  downloadCheckoutExitFeedback: vi.fn(),
  listSurveyResponses: vi.fn(),
  downloadSurveyResponses: vi.fn(),
  listOrders: vi.fn(),
  getTaxonomy: vi.fn(),
}));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  useSearchParams: () => nav.params,
  usePathname: () => "/admin/survey-responses",
}));
vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { SurveyDesk } from "@/components/survey-responses/SurveyDesk";
import { ApiError } from "@/lib/api/client";

function tally(counts: Record<string, number>): PricingQuestionTally {
  const answered = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    answered,
    options: Object.entries(counts).map(([code, count]) => ({
      code,
      count,
      percent: answered ? Math.round((1000 * count) / answered) / 10 : null,
    })),
  };
}

const report: PricingFeedbackReport = {
  serverTime: "2026-10-16T00:00:00.000Z",
  survey: {
    responses: 4,
    questions: {
      priceFeeling: tally({
        very_cheap: 0,
        cheap: 1,
        fair: 2,
        expensive: 1,
        very_expensive: 0,
      }),
      expectedPrice: tally({ much_lower: 1, lower: 0, about_the_same: 1, higher: 0 }),
      directShopComparison: tally({
        much_cheaper: 0,
        cheaper: 2,
        about_the_same: 0,
        more_expensive: 1,
        much_more_expensive: 0,
        not_sure: 1,
      }),
      priceWorthTags: {
        answered: 3,
        options: [
          { code: "print_quality", count: 2, percent: 66.7 },
          { code: "door_delivery", count: 2, percent: 66.7 },
          { code: "other", count: 1, percent: 33.3 },
          { code: "not_worth_it", count: 1, percent: 33.3 },
        ],
      },
      orderAgainAtPrice: tally({ yes: 3, maybe: 0, no: 0 }),
    },
  },
  checkoutExit: {
    asked: 5,
    answered: 3,
    skipped: 1,
    unanswered: 1,
    reasons: tally({ price_too_high: 2, still_deciding: 0, other: 1 }),
  },
  orderSizeBrackets: [],
};

const answered: CheckoutExitAnswer = {
  id: "cxp_1",
  clientId: "usr_a",
  cartId: "cart_1",
  reachedAt: "2026-10-03T01:00:00.000Z",
  askedAt: "2026-10-03T05:00:00.000Z",
  status: "answered",
  reason: "other",
  otherText: "Needed it by Friday",
  answeredAt: "2026-10-03T05:01:00.000Z",
  skippedAt: null,
  cartTotalMinor: 720000,
  orderSize: "5000_to_19999",
  categoryCodes: ["marketing_collateral"],
  accountType: "business",
};
const skipped: CheckoutExitAnswer = {
  ...answered,
  id: "cxp_2",
  clientId: "usr_b",
  status: "skipped",
  reason: null,
  otherText: null,
  answeredAt: null,
  skippedAt: "2026-10-02T05:00:00.000Z",
  askedAt: "2026-10-02T05:00:00.000Z",
  cartTotalMinor: null,
  orderSize: null,
  accountType: "individual",
};

const emptySurveys: SurveyResponsesPage = {
  serverTime: "2026-10-16T00:00:00.000Z",
  responses: [],
  total: 0,
  aggregates: {
    averages: {
      fulfillmentStars: null,
      easeStars: null,
      priceFeeling: null,
      qualityStars: null,
      recommendScore: null,
    },
    counts: {
      fulfillmentStars: 0,
      easeStars: 0,
      priceFeeling: 0,
      qualityStars: 0,
      recommendScore: 0,
    },
    needsFollowUp: 0,
    promoters: 0,
    passives: 0,
    detractors: 0,
    nps: null,
  },
};

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  api.getPricingFeedback.mockReset().mockResolvedValue(report);
  api.downloadPricingFeedback
    .mockReset()
    .mockResolvedValue(new Blob(["section\r\n"], { type: "text/csv" }));
  api.listCheckoutExitFeedback
    .mockReset()
    .mockResolvedValue({ serverTime: "", prompts: [answered, skipped], total: 2 });
  api.downloadCheckoutExitFeedback
    .mockReset()
    .mockResolvedValue(new Blob(["id\r\n"], { type: "text/csv" }));
  api.listSurveyResponses.mockReset().mockResolvedValue(emptySurveys);
  api.downloadSurveyResponses.mockReset();
  api.listOrders.mockReset().mockResolvedValue([]);
  api.getTaxonomy.mockReset().mockResolvedValue({
    categories: [
      {
        id: "c1",
        code: "marketing_collateral",
        name: "Marketing & Promotional Collateral",
        productFamilyIds: [],
        active: true,
      },
    ],
    materials: [],
    finishes: [],
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Survey desk shared filters", () => {
  it("writes the date, category, order size and account type into the URL for every tab", async () => {
    nav.params = new URLSearchParams("view=pricing&size=under_500");
    render(<SurveyDesk />);
    await screen.findByText("Left at checkout");
    expect(screen.getByRole("button", { name: "Clear filter" })).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Account type"));
    await userEvent.click(await screen.findByRole("option", { name: "Organization" }));
    expect(nav.replace).toHaveBeenLastCalledWith(
      "/admin/survey-responses?view=pricing&size=under_500&account=organization",
      { scroll: false },
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/admin/survey-responses?view=pricing", {
      scroll: false,
    });
  });

  it("sends the shared filters to the survey responses list too", async () => {
    nav.params = new URLSearchParams(
      "category=marketing_collateral&size=2000_to_4999&account=business&from=2026-10-01",
    );
    render(<SurveyDesk />);
    await waitFor(() =>
      expect(api.listSurveyResponses).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryCode: "marketing_collateral",
          orderSize: "2000_to_4999",
          accountType: "business",
          from: "2026-09-30T16:00:00.000Z",
        }),
        { limit: 100 },
      ),
    );
    expect(api.getPricingFeedback).not.toHaveBeenCalled();
  });

  it("drops a filter value GRIDGO would refuse instead of sending it", async () => {
    nav.params = new URLSearchParams(
      "view=pricing&size=huge&account=robot&category=Not%20a%20code",
    );
    render(<SurveyDesk />);
    await screen.findByText("Left at checkout");
    expect(api.getPricingFeedback).toHaveBeenCalledWith({
      from: undefined,
      to: undefined,
      categoryCode: undefined,
      orderSize: undefined,
      accountType: undefined,
    });
  });
});

describe("Pricing results", () => {
  it("shows every option's count and share in the client's words, the leader first in weight", async () => {
    nav.params = new URLSearchParams("view=pricing");
    render(<SurveyDesk />);
    const direct = await screen.findByRole("region", {
      name: "Compared with ordering directly from a print shop, GRIDGO was…",
    });
    expect(within(direct).getByText("All 4 answered")).toBeInTheDocument();
    expect(within(direct).getByText("Cheaper")).toBeInTheDocument();
    expect(within(direct).getByText("50%")).toBeInTheDocument();
    expect(within(direct).getByText("Not sure")).toBeInTheDocument();
    expect(within(direct).queryAllByText("—")).toHaveLength(0);

    const worth = screen.getByRole("region", { name: "What made the price worth it?" });
    expect(
      within(worth).getByText(/shares add up to more than 100%/),
    ).toBeInTheDocument();
    expect(within(worth).getAllByText("66.7%")).toHaveLength(2);
    expect(within(worth).getByText("Something else")).toBeInTheDocument();
    expect(within(worth).getByText("It was not worth it")).toBeInTheDocument();

    const again = screen.getByRole("region", {
      name: "Would you order again at this price?",
    });
    expect(within(again).getByText("3 of 4 answered")).toBeInTheDocument();
    expect(within(again).getAllByText("0%")).toHaveLength(2);

    expect(
      screen.getByRole("img", {
        name: "Answered 3, Skipped 1, Closed without answering 1",
      }),
    ).toBeInTheDocument();
    const exits = screen.getByRole("region", { name: "Left at checkout" });
    expect(within(exits).getByText("The price was too high")).toBeInTheDocument();
    expect(within(exits).getByText("66.7%")).toBeInTheDocument();
  });

  it("downloads the CSV for the same filters", async () => {
    const createObjectURL = vi.fn(() => "blob:x");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }),
    );
    nav.params = new URLSearchParams("view=pricing&account=organization&to=2026-10-14");
    render(<SurveyDesk />);
    await screen.findByText("Left at checkout");
    const expected = { accountType: "organization", to: "2026-10-14T15:59:59.999Z" };
    expect(api.getPricingFeedback).toHaveBeenCalledWith(
      expect.objectContaining(expected),
    );
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() =>
      expect(api.downloadPricingFeedback).toHaveBeenCalledWith(
        expect.objectContaining(expected),
      ),
    );
    expect(createObjectURL).toHaveBeenCalled();
  });

  it("says when nothing matches and offers no empty CSV", async () => {
    api.getPricingFeedback.mockResolvedValue({
      ...report,
      survey: { ...report.survey, responses: 0 },
      checkoutExit: {
        asked: 0,
        answered: 0,
        skipped: 0,
        unanswered: 0,
        reasons: tally({ other: 0 }),
      },
    });
    nav.params = new URLSearchParams("view=pricing&account=business");
    render(<SurveyDesk />);
    expect(
      await screen.findByText("No pricing answers match these filters"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });

  it("explains a refusal in plain words", async () => {
    api.getPricingFeedback.mockRejectedValue(
      new ApiError(400, { error: "invalid_survey_filter" }),
    );
    nav.params = new URLSearchParams("view=pricing");
    render(<SurveyDesk />);
    expect(
      await screen.findByText(
        "One of the filters is not one GRIDGO accepts. Clear the filters and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("opens the exit answers from the results", async () => {
    nav.params = new URLSearchParams("view=pricing&size=under_500");
    render(<SurveyDesk />);
    await userEvent.click(await screen.findByRole("button", { name: "See each answer" }));
    expect(nav.replace).toHaveBeenLastCalledWith(
      "/admin/survey-responses?view=exits&size=under_500",
      {
        scroll: false,
      },
    );
  });
});

describe("Checkout exit answers", () => {
  it("lists each question with the client's Other words, the basket and the account type", async () => {
    nav.params = new URLSearchParams("view=exits");
    render(<SurveyDesk />);
    expect((await screen.findAllByText("“Needed it by Friday”")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("₱7,200.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₱5,000 to ₱19,999").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(
        screen.getAllByText("Marketing & Promotional Collateral").length,
      ).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("Business").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Skipped").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No price yet").length).toBeGreaterThan(0);
    expect(api.listCheckoutExitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({}),
      { limit: 100 },
    );
  });

  it("pages older answers by offset and keeps the filters", async () => {
    api.listCheckoutExitFeedback
      .mockResolvedValueOnce({ serverTime: "", prompts: [answered], total: 2 })
      .mockResolvedValueOnce({ serverTime: "", prompts: [skipped], total: 2 });
    nav.params = new URLSearchParams(
      "view=exits&exitStatus=answered&exitReason=other&account=business",
    );
    render(<SurveyDesk />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Show older answers" }),
    );
    const filter = { status: "answered", reason: "other", accountType: "business" };
    expect(api.listCheckoutExitFeedback).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining(filter),
      { limit: 100 },
    );
    expect(api.listCheckoutExitFeedback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining(filter),
      {
        offset: 1,
        limit: 100,
      },
    );
    expect(
      (await screen.findAllByText("All 2 answers shown.", { exact: false })).length,
    ).toBe(1);
  });

  it("filters by what the client did and narrows to one client", async () => {
    nav.params = new URLSearchParams("view=exits");
    render(<SurveyDesk />);
    await screen.findAllByText("“Needed it by Friday”");
    await userEvent.click(screen.getByLabelText("What they did"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Closed without answering" }),
    );
    expect(nav.replace).toHaveBeenLastCalledWith(
      "/admin/survey-responses?view=exits&exitStatus=unanswered",
      {
        scroll: false,
      },
    );
    await userEvent.click(
      screen.getAllByRole("button", { name: "Show only answers from client usr_a" })[0],
    );
    expect(nav.replace).toHaveBeenLastCalledWith(
      "/admin/survey-responses?view=exits&client=usr_a",
      {
        scroll: false,
      },
    );
  });

  it("downloads every matching answer as CSV", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:x"),
        revokeObjectURL: vi.fn(),
      }),
    );
    nav.params = new URLSearchParams("view=exits&exitReason=price_too_high");
    render(<SurveyDesk />);
    await screen.findAllByText("“Needed it by Friday”");
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() =>
      expect(api.downloadCheckoutExitFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "price_too_high" }),
      ),
    );
  });
});
