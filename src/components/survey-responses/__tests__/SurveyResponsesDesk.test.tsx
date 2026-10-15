// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SurveyAggregates, SurveyResponse, SurveyResponsesPage } from "@/lib/api/types";

vi.setConfig({ testTimeout: 30_000 });

const api = vi.hoisted(() => ({
  listSurveyResponses: vi.fn(),
  downloadSurveyResponses: vi.fn(),
  listOrders: vi.fn(),
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
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
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
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { SurveyResponsesDesk } from "@/components/survey-responses/SurveyResponsesDesk";
import { ApiError } from "@/lib/api/client";

const unhappy: SurveyResponse = {
  orderId: "ord_late",
  clientId: "usr_a",
  fulfillmentKind: "delivery",
  completedAt: "2026-10-12T02:00:00.000Z",
  openedAt: "2026-10-12T02:00:00.000Z",
  expiresAt: "2026-10-19T02:00:00.000Z",
  notifiedAt: "2026-10-12T02:00:00.000Z",
  dismissedAt: null,
  submittedAt: "2026-10-13T02:00:00.000Z",
  fulfillmentStars: 2,
  fulfillmentTags: ["late", "hard_to_contact"],
  easeStars: 4,
  easeTags: ["easy_checkout"],
  priceFeeling: 4,
  expectedPriceMinor: 25000,
  qualityStars: null,
  recommendScore: 5,
  improvementNote: "Tell me when the rider leaves.",
  needsFollowUp: true,
  rewardStatus: "cooldown",
  rewardVoucherId: null,
  directShopComparison: "more_expensive",
  priceWorthTags: ["not_worth_it"],
  orderAgainAtPrice: "no",
  orderTotalMinor: 180000,
  orderSize: "500_to_1999",
  categoryCodes: ["marketing_collateral", "retired_code"],
  accountType: "business",
};

const PRICING_KEYS = [
  "directShopComparison",
  "priceWorthTags",
  "orderAgainAtPrice",
  "orderTotalMinor",
  "orderSize",
  "categoryCodes",
  "accountType",
] as const;
const beforePricing: SurveyResponse = { ...unhappy };
for (const key of PRICING_KEYS) delete beforePricing[key];

/** A response as an API from before the pricing questions sends it. */
const happy: SurveyResponse = {
  ...beforePricing,
  orderId: "ord_ok",
  clientId: "usr_b",
  fulfillmentKind: "pickup",
  submittedAt: "2026-10-12T02:00:00.000Z",
  fulfillmentStars: 5,
  fulfillmentTags: ["helpful_staff"],
  easeStars: 5,
  easeTags: [],
  priceFeeling: 3,
  expectedPriceMinor: null,
  qualityStars: 5,
  recommendScore: 10,
  improvementNote: null,
  needsFollowUp: false,
  rewardStatus: "issued",
  rewardVoucherId: "vch_1",
};

const aggregates: SurveyAggregates = {
  averages: { fulfillmentStars: 3.5, easeStars: 4.5, priceFeeling: 3.5, qualityStars: 5, recommendScore: 7.5 },
  counts: { fulfillmentStars: 2, easeStars: 2, priceFeeling: 2, qualityStars: 1, recommendScore: 3 },
  needsFollowUp: 1,
  promoters: 2,
  passives: 0,
  detractors: 1,
  nps: 100 / 3,
};

function page(responses: SurveyResponse[], patch: Partial<SurveyResponsesPage> = {}): SurveyResponsesPage {
  return { serverTime: "2026-10-15T00:00:00.000Z", responses, total: responses.length, aggregates, ...patch };
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  api.listSurveyResponses.mockReset().mockResolvedValue(page([unhappy, happy]));
  api.downloadSurveyResponses.mockReset().mockResolvedValue(new Blob(["orderId\r\n"], { type: "text/csv" }));
  api.listOrders.mockReset().mockResolvedValue([{ id: "ord_late", title: "Event tarpaulin" }]);
});

afterEach(() => cleanup());

describe("SurveyResponsesDesk", () => {
  it("shows the figures, each response's scores, tags and note, and the follow-up flag", async () => {
    render(<SurveyResponsesDesk />);

    expect((await screen.findAllByText("Tell me when the rider leaves.", { exact: false })).length).toBeGreaterThan(0);
    const pulse = screen.getByRole("region", { name: "Survey figures" });
    expect(within(pulse).getByText("Net Promoter Score")).toBeInTheDocument();
    expect(within(pulse).getByText("+33")).toBeInTheDocument();
    expect(within(pulse).getByText("From 3 recommend answers, −100 to +100")).toBeInTheDocument();
    expect(within(pulse).getByRole("img", { name: "Detractors 33%, Passives 0%, Promoters 67%" })).toBeInTheDocument();
    expect(within(pulse).getByText("Expensive")).toBeInTheDocument();

    expect(screen.getAllByText("Event tarpaulin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Arrived late").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Needs follow-up").length).toBeGreaterThan(1);
    expect(screen.getAllByLabelText("2 of 5, low").length).toBeGreaterThan(0);
    expect(api.listSurveyResponses).toHaveBeenCalledWith(expect.objectContaining({}), { limit: 100 });
  });

  it("puts the follow-up switch in the URL", async () => {
    render(<SurveyResponsesDesk />);
    await screen.findAllByText("Event tarpaulin");
    await userEvent.click(screen.getByRole("button", { name: /Needs follow-up/ }));
    expect(nav.replace).toHaveBeenCalledWith("/admin/survey-responses?followUp=true", { scroll: false });
  });

  it("sends the URL's filters to the API and the CSV", async () => {
    const createObjectURL = vi.fn(() => "blob:x");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    nav.params = new URLSearchParams("followUp=true&tag=late&from=2026-10-01&to=2026-10-14&recommendScore=5");
    render(<SurveyResponsesDesk />);
    await screen.findAllByText("Event tarpaulin");
    const expected = {
      needsFollowUp: true,
      tag: "late",
      from: "2026-09-30T16:00:00.000Z",
      to: "2026-10-14T15:59:59.999Z",
      recommendScore: 5,
    };
    expect(api.listSurveyResponses).toHaveBeenCalledWith(expect.objectContaining(expected), { limit: 100 });
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(api.downloadSurveyResponses).toHaveBeenCalledWith(expect.objectContaining(expected)));
    expect(createObjectURL).toHaveBeenCalled();
  });

  it("opens a linked response with why it was flagged", async () => {
    nav.params = new URLSearchParams("response=ord_late");
    render(<SurveyResponsesDesk />);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Why it is flagged")).toBeInTheDocument();
    expect(within(sheet).getByText("Delivery rated 2 of 5")).toBeInTheDocument();
    expect(within(sheet).getByText("Recommend score 5 of 10")).toBeInTheDocument();
    expect(within(sheet).getByText("Expected to pay ₱250.00")).toBeInTheDocument();
    expect(within(sheet).getByText("No voucher, had one this week")).toBeInTheDocument();
    expect(within(sheet).getByText("Open order").closest("a")).toHaveAttribute("href", "/admin/orders/ord_late");
  });

  it("shows the pricing answers on the row and in the response", async () => {
    nav.params = new URLSearchParams("response=ord_late");
    render(<SurveyResponsesDesk categoryNames={new Map([["marketing_collateral", "Marketing & Promotional Collateral"]])} />);
    expect((await screen.findAllByText("vs. a shop: more expensive")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Order again: no").length).toBeGreaterThan(0);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Compared with ordering directly from a print shop, GRIDGO was…")).toBeInTheDocument();
    expect(within(sheet).getByText("More expensive")).toBeInTheDocument();
    expect(within(sheet).getByText("It was not worth it")).toBeInTheDocument();
    expect(within(sheet).getByText("Would you order again at this price?")).toBeInTheDocument();
    expect(within(sheet).getByText("₱1,800.00 (₱500 to ₱1,999)")).toBeInTheDocument();
    expect(within(sheet).getByText("Marketing & Promotional Collateral, Retired code")).toBeInTheDocument();
    expect(within(sheet).getByText("Business")).toBeInTheDocument();
  });

  it("leaves the pricing questions out for a response from an older API", async () => {
    nav.params = new URLSearchParams("response=ord_ok");
    render(<SurveyResponsesDesk />);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("How did the price feel?")).toBeInTheDocument();
    expect(within(sheet).queryByText("Would you order again at this price?")).not.toBeInTheDocument();
    expect(within(sheet).queryByText("What the filters read")).not.toBeInTheDocument();
  });

  it("reads a linked response that is not on the first page", async () => {
    api.listSurveyResponses.mockImplementation(async (filter: { orderId?: string }) =>
      filter.orderId ? page([{ ...happy, orderId: "ord_old" }]) : page([unhappy], { total: 300 }),
    );
    nav.params = new URLSearchParams("response=ord_old");
    render(<SurveyResponsesDesk />);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Order ord_old")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 300")).toBeInTheDocument();
  });

  it("says plainly when the account is not Super Admin", async () => {
    api.listSurveyResponses.mockRejectedValue(new ApiError(403, { error: "forbidden" }));
    render(<SurveyResponsesDesk />);
    expect(await screen.findByText("Only Super Admin can read survey responses.")).toBeInTheDocument();
  });

  it("shows empty figures as dashes and invites no action without filters", async () => {
    api.listSurveyResponses.mockResolvedValue(
      page([], {
        aggregates: {
          averages: { fulfillmentStars: null, easeStars: null, priceFeeling: null, qualityStars: null, recommendScore: null },
          counts: { fulfillmentStars: 0, easeStars: 0, priceFeeling: 0, qualityStars: 0, recommendScore: 0 },
          needsFollowUp: 0,
          promoters: 0,
          passives: 0,
          detractors: 0,
          nps: null,
        },
      }),
    );
    render(<SurveyResponsesDesk />);
    expect(await screen.findByText("No survey responses yet")).toBeInTheDocument();
    expect(screen.getByText("Nobody has answered the recommend question yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });
});
