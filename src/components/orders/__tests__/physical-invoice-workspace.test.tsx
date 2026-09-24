// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import type { Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

const REQUESTED_AT = "2026-09-21T06:00:00.000Z";

function fixture(promisedDeliveryAt?: string): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: "production",
    title: "Flyers",
    quantity: 2,
    deadline: null,
    address: "Davao",
    totalMinor: 10000,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "initial_payment_confirmed",
    promisedDate: null,
    artworkName: null,
    createdAt: REQUESTED_AT,
    updatedAt: REQUESTED_AT,
    timeline: [],
    physicalInvoiceRequest: {
      contactPerson: "Ana Reyes",
      officeAddress: "7th floor, 12 J.P. Laurel Ave, Davao City",
      operatingHours: "Mon–Fri 9am–5pm",
      requestedAt: REQUESTED_AT,
      ...(promisedDeliveryAt ? { promisedDeliveryAt } : {}),
    },
  };
}

let order: Order;
let mutations: { path: string; body: unknown }[];

beforeEach(() => {
  vi.stubGlobal("React", React);
  order = fixture();
  mutations = [];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://gridgo.test").pathname;
      if (init?.method === "PATCH" && path.endsWith("/physical-invoice")) {
        const body = JSON.parse(String(init.body));
        mutations.push({ path, body });
        order = fixture(String(body.promisedDeliveryAt));
        return new Response(
          JSON.stringify({
            request: { orderId: order.id, ...order.physicalInvoiceRequest },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ order }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

it("shows who the paper invoice goes to, then the promised time after it is saved", async () => {
  render(<OrderWorkspace queueHref="/ops/orders" />);

  expect(
    await screen.findByText(`Paper copy requested ${formatDateTime(REQUESTED_AT)}.`),
  ).toBeInTheDocument();
  expect(screen.getByText("Your call")).toBeInTheDocument();
  expect(screen.getByText("Ana Reyes")).toBeInTheDocument();
  expect(screen.getByText("7th floor, 12 J.P. Laurel Ave, Davao City")).toBeInTheDocument();
  expect(screen.getByText("Mon–Fri 9am–5pm")).toBeInTheDocument();
  expect(screen.getByText("Someone is there: Mon–Fri 9am–5pm")).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /Sat/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "5:00 pm" })).not.toBeInTheDocument();

  const date = screen.getByLabelText("Promise delivery date");
  // The second weekday offered is always in the future, whatever the clock says.
  const weekday = Array.from((date as HTMLSelectElement).options).filter((option) => option.value)[1];
  expect(weekday).toBeTruthy();
  await userEvent.selectOptions(date, weekday!.value);
  await userEvent.selectOptions(screen.getByLabelText("Promise delivery time"), "10:00");
  await userEvent.click(screen.getByRole("button", { name: "Set promise date" }));

  const promised = mutations[0]?.body as { promisedDeliveryAt: string };
  expect(mutations).toEqual([
    {
      path: "/orders/order1/physical-invoice",
      body: { promisedDeliveryAt: promised.promisedDeliveryAt },
    },
  ]);
  expect(
    await screen.findByText(`Promised ${formatDateTime(promised.promisedDeliveryAt)}.`),
  ).toBeInTheDocument();
  expect(screen.getByText("Promised")).toBeInTheDocument();
});

it("offers only desk times still ahead, so a promise is never already late", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Wednesday 23 September 2026, 15:00 in Manila.
  vi.setSystemTime(new Date("2026-09-23T07:00:00.000Z"));
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const date = await screen.findByLabelText("Promise delivery date");
  await userEvent.selectOptions(date, "2026-09-23");
  const time = screen.getByLabelText("Promise delivery time");
  const offered = Array.from((time as HTMLSelectElement).options)
    .map((option) => option.value)
    .filter(Boolean);
  expect(offered).not.toContain("10:00");
  expect(offered).not.toContain("15:00");
  expect(offered[0]).toBe("15:15");
  expect(offered.at(-1)).toBe("16:45");

  await userEvent.selectOptions(date, "2026-09-24");
  expect(screen.getByRole("option", { name: "8:00 am" })).toBeInTheDocument();
});

it("does not offer today once the desk has closed", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Friday 25 September 2026, 16:50 in Manila: 4:45 pm has passed.
  vi.setSystemTime(new Date("2026-09-25T08:50:00.000Z"));
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const date = await screen.findByLabelText("Promise delivery date");
  const first = Array.from((date as HTMLSelectElement).options).find((option) => option.value);
  expect(first?.value).toBe("2026-09-28");
});

it("explains a promise the API refuses in plain words", async () => {
  const fetchFixture = vi.mocked(fetch);
  const answer = fetchFixture.getMockImplementation()!;
  fetchFixture.mockImplementation(async (input, init) => {
    if (init?.method === "PATCH") {
      return new Response(JSON.stringify({ error: "promise_outside_business_hours" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return answer(input, init);
  });
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const date = await screen.findByLabelText("Promise delivery date");
  const weekday = Array.from((date as HTMLSelectElement).options).filter((option) => option.value)[1];
  await userEvent.selectOptions(date, weekday.value);
  await userEvent.selectOptions(screen.getByLabelText("Promise delivery time"), "10:00");
  await userEvent.click(screen.getByRole("button", { name: "Set promise date" }));

  expect(
    await screen.findByText(/Promise a Monday–Friday time from 8:00 am/),
  ).toBeInTheDocument();
});
