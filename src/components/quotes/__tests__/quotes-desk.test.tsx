// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteQueue } from "@/components/quotes/QuoteQueue";
import { QuoteRequestDetail } from "@/components/quotes/QuoteRequestDetail";
import { setTokenProvider } from "@/lib/api/client";
import type { QuoteReply, QuoteRequest } from "@/lib/quote-requests";

vi.stubGlobal("React", React);
// Base UI's checkbox dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
const stubBrowser = () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("PointerEvent", FakePointerEvent);
};
stubBrowser();
const replace = vi.fn();
let search = new URLSearchParams();
let routeId = "qreq_1";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => search,
  useParams: () => ({ id: routeId }),
}));

function reply(id: string, supplierId: string, patch: Partial<QuoteReply> = {}): QuoteReply {
  return {
    id,
    status: "active",
    version: 1,
    supplierId,
    shopName: `Shop ${supplierId.toUpperCase()}`,
    priceMinor: 300000,
    clientPriceMinor: 345000,
    productionTime: { mode: "days", minDays: 3, maxDays: 3 },
    readyBy: "2026-11-06T09:00:00.000Z",
    eventDateFit: "before",
    recommendedOptions: "",
    note: "",
    publishedLabel: null,
    createdAt: "2026-11-02T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
    ...patch,
  };
}

function quote(id: string, patch: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    id,
    status: "requested",
    version: 3,
    productType: "business_store_signages",
    productTypeName: "Business & store signages",
    use: "Shop front sign",
    placement: "outdoor",
    size: "2 x 6 ft",
    quantity: 2,
    notes: "",
    budgetMinor: null,
    eventDate: null,
    referenceFiles: [],
    requestFulfillment: { fulfillmentMode: "delivery", dropoff: { label: "Event hall" } },
    ranking: ["cost", "speed", "quality", "distance"],
    options: [],
    matchReason: null,
    publishedAt: null,
    validUntil: null,
    acceptedOption: null,
    acceptedAt: null,
    cartId: null,
    orderId: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    expiredAt: null,
    createdAt: "2026-11-02T01:00:00.000Z",
    updatedAt: "2026-11-02T01:00:00.000Z",
    client: { id: "c1", name: "Dana Client", email: null },
    replies: [],
    eventDateWarning: null,
    ...patch,
  };
}

const requests = [
  quote("qreq_new", {
    eventDate: "2026-11-03",
    eventDateWarning: { code: "event_date_soon", message: "" },
  }),
  quote("qreq_quoting", { status: "quoting", replies: [reply("r1", "s1")] }),
  quote("qreq_pub", { status: "published", validUntil: "2026-11-09T01:00:00.000Z" }),
  quote("qreq_done", { status: "ordered", orderId: "ord_1" }),
];

let detail: QuoteRequest = quote("qreq_1");
const calls: { method: string; path: string; body: unknown }[] = [];

beforeEach(() => {
  search = new URLSearchParams();
  routeId = "qreq_1";
  replace.mockReset();
  calls.length = 0;
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, path: `${url.pathname}${url.search}`, body });
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (url.pathname.endsWith("/settings")) {
        return json({ version: 2, settings: { quoteValidityDays: 7 } });
      }
      if (url.pathname.endsWith("/ops/quote-requests")) {
        const status = url.searchParams.get("status");
        const rows = requests.filter((row) =>
          !status
            ? true
            : status === "open"
              ? ["requested", "quoting", "published", "accepted"].includes(row.status)
              : row.status === status,
        );
        return json({ quoteRequests: rows });
      }
      if (url.pathname.endsWith("/publish") && method === "POST") {
        detail = { ...detail, status: "published", version: detail.version + 1 };
        return json({ quoteRequest: detail });
      }
      if (url.pathname.includes("/replies/") && method === "PATCH") {
        detail = { ...detail, version: detail.version + 1 };
        return json({ quoteRequest: detail });
      }
      if (/\/ops\/quote-requests\/[^/]+$/.test(url.pathname)) {
        return json({ quoteRequest: detail });
      }
      return json({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
  stubBrowser();
});

describe("the quotes queue", () => {
  it("counts every status and lists the open requests by default", async () => {
    render(<QuoteQueue tree="ops" />);
    const tabs = await screen.findByRole("tablist", { name: "Quote requests by status" });
    await waitFor(() =>
      expect(within(tabs).getByRole("tab", { name: "Open, 3" })).toBeInTheDocument(),
    );
    expect(within(tabs).getByRole("tab", { name: "New, 1" })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: "Ordered, 1" })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: "All, 4" })).toBeInTheDocument();
    expect(calls.some((call) => call.path === "/ops/quote-requests?status=open")).toBe(true);

    const list = screen.getByRole("list", { name: "Quote requests" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/ops/quotes/qreq_new",
      "/ops/quotes/qreq_quoting",
      "/ops/quotes/qreq_pub",
    ]);
    expect(within(links[0]).getByText("Event date")).toBeInTheDocument();
    expect(within(links[1]).getByText(/1 reply recorded/)).toBeInTheDocument();
    expect(screen.getByTestId("quote-validity-line")).toHaveTextContent(
      "Published options stay open for 7 days. Super Admin sets this.",
    );
  });

  it("reads the chosen status from the API and keeps it in the URL", async () => {
    search = new URLSearchParams("status=ordered");
    render(<QuoteQueue tree="admin" />);
    const list = await screen.findByRole("list", { name: "Quote requests" });
    expect(within(list).getByRole("link")).toHaveAttribute("href", "/admin/quotes/qreq_done");
    expect(calls.some((call) => call.path === "/ops/quote-requests?status=ordered")).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: /^Open/ }));
    expect(replace).toHaveBeenCalledWith("/admin/quotes");
    expect(screen.getByRole("link", { name: "Change it in Operational settings" })).toHaveAttribute(
      "href",
      "/admin/settings",
    );
  });
});

describe("one quote request", () => {
  it("shows the event-date warning in plain words, without blocking", async () => {
    detail = quote("qreq_1", {
      status: "quoting",
      eventDate: "2026-11-05",
      eventDateWarning: { code: "no_option_before_event", message: "" },
      replies: [reply("r1", "s1", { eventDateFit: "after" })],
    });
    render(<QuoteRequestDetail tree="ops" />);
    const warning = await screen.findByTestId("quote-event-warning");
    expect(warning).toHaveTextContent(/No shop reply so far can be ready before/);
    expect(warning).toHaveTextContent(/nothing is blocked/);
    expect(screen.getByText(/Ready after the event/)).toBeInTheDocument();
  });

  it("publishes one to three replies, one per shop, as anonymous options", async () => {
    detail = quote("qreq_1", {
      status: "quoting",
      replies: [
        reply("r1", "s1", { clientPriceMinor: 500000 }),
        reply("r2", "s2", { clientPriceMinor: 200000 }),
        reply("r3", "s1", { clientPriceMinor: 300000 }),
        reply("r4", "s3"),
        reply("r5", "s4"),
      ],
    });
    render(<QuoteRequestDetail tree="ops" />);
    const publish = await screen.findByRole("button", { name: "Publish to the client" });
    expect(publish).toBeDisabled();

    const box = (name: string) =>
      screen
        .getAllByRole("checkbox")
        .find((el) => el.getAttribute("aria-labelledby") === `quote-reply-${name}`)!;
    fireEvent.click(box("r1"));
    // The same shop's other reply cannot join.
    await waitFor(() => expect(box("r3")).toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByText("This shop is already chosen")).toBeInTheDocument();
    fireEvent.click(box("r2"));
    fireEvent.click(box("r4"));
    // Three chosen: a fourth shop waits.
    await waitFor(() => expect(box("r5")).toHaveAttribute("aria-disabled", "true"));

    const preview = screen.getByRole("list", { name: "Client preview" });
    expect(within(preview).getAllByRole("listitem")).toHaveLength(3);
    expect(preview).not.toHaveTextContent(/Shop S/);
    // Price first: the cheapest is A.
    expect(within(preview).getAllByRole("listitem")[0]).toHaveTextContent("₱2,000.00");

    fireEvent.click(screen.getByRole("button", { name: "Publish to the client" }));
    fireEvent.click(await screen.findByRole("button", { name: "Publish 3 options" }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith("/publish"))?.body).toEqual({
        replyIds: ["r1", "r2", "r4"],
        expectedVersion: 3,
      }),
    );
    expect(await screen.findByText("Published. The client is told.")).toBeInTheDocument();
  });

  it("checks a changed reply before sending, then sends only what changed", async () => {
    detail = quote("qreq_1", { status: "quoting", replies: [reply("r1", "s1", { version: 4 })] });
    render(<QuoteRequestDetail tree="ops" />);
    fireEvent.click(await screen.findByRole("button", { name: "Change Shop S1's reply" }));
    const price = await screen.findByLabelText("Shop’s price for the whole job");
    expect(price).toHaveValue("3000.00");
    fireEvent.change(price, { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Latest"), { target: { value: "31" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reply" }));
    expect(await screen.findByText(/above ₱0/)).toBeInTheDocument();
    expect(screen.getByText(/at most 30 working days/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === "PATCH")).toBe(false);

    fireEvent.change(price, { target: { value: "3200" } });
    fireEvent.change(screen.getByLabelText("Latest"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reply" }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === "PATCH")).toEqual({
        method: "PATCH",
        path: "/ops/quote-requests/qreq_1/replies/r1",
        body: { priceMinor: 320000, expectedReplyVersion: 4 },
      }),
    );
    expect(await screen.findByText("Reply saved.")).toBeInTheDocument();
  });

  it("lists active replies before withdrawn ones", async () => {
    detail = quote("qreq_1", {
      status: "quoting",
      replies: [reply("w1", "s1", { status: "withdrawn" }), reply("a1", "s2")],
    });
    render(<QuoteRequestDetail tree="ops" />);
    await screen.findByRole("heading", { name: /Shop replies/ });
    const names = screen.getAllByText(/^Shop S[12]$/).map((el) => el.textContent);
    expect(names).toEqual(["Shop S2", "Shop S1"]);
  });

  it("links an ordered request to its order", async () => {
    detail = quote("qreq_1", {
      status: "ordered",
      orderId: "ord_9",
      acceptedOption: "A",
      options: [
        {
          label: "A",
          rank: 1,
          clientPriceMinor: 345000,
          productionTime: { mode: "days", minDays: 3, maxDays: 3 },
          readyBy: null,
          eventDateFit: null,
          recommendedOptions: "",
          acceptable: false,
          shopName: "Shop S1",
          priceMinor: 300000,
        },
      ],
    });
    render(<QuoteRequestDetail tree="admin" />);
    expect(await screen.findByRole("link", { name: "Open the order" })).toHaveAttribute(
      "href",
      "/admin/orders/ord_9",
    );
    expect(screen.getByText(/accepted by the client/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a reply" })).toBeNull();
  });
});
