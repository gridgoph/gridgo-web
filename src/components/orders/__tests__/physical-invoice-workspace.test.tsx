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
  const weekday = Array.from((date as HTMLSelectElement).options).find((option) => option.value);
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
