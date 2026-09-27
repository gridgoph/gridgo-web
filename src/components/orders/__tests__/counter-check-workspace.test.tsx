// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Escalation, Order } from "@/lib/api/types";
import {
  PEOPLE,
  earlierEscalation,
  legacyOrder,
  passedOrder,
  shortEscalation,
  shortOrder,
} from "@/test/counter-check";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

let order: Order;
let escalations: Escalation[];
let requests: { method: string; path: string; search: string; body: unknown }[];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  requests = [];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://gridgo.test");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, path: url.pathname, search: url.search, body });
      if (method === "POST" && url.pathname === "/escalations/esc_short/resolve") {
        escalations = [shortEscalation("resolved")];
        order = {
          ...order,
          pickupChecklist: { ...order.pickupChecklist!, status: "escalation_resolved" },
        };
        return json({ escalation: escalations[0] });
      }
      if (url.pathname === "/escalations") return json({ escalations });
      if (url.pathname.startsWith("/users/")) {
        const id = url.pathname.split("/")[2];
        return PEOPLE[id]
          ? json({ user: { id, name: PEOPLE[id], email: "", role: "rider" } })
          : json({ error: "user_not_found" }, 404);
      }
      if (url.pathname.endsWith("/download-url"))
        return json({ url: "https://files.test/x.png" });
      if (url.pathname.startsWith("/files/")) {
        const fileId = url.pathname.split("/")[2];
        return json({
          file: {
            fileId,
            originalFilename: `${fileId}.jpg`,
            declaredContentType: "image/jpeg",
          },
        });
      }
      return json({ order });
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

function counterSection() {
  return screen.getByRole("heading", { name: /Counter check/ }).closest("section")!;
}

it("shows a passing check: each line counted right, all six checks, and who signed", async () => {
  order = passedOrder();
  escalations = [earlierEscalation()];
  render(<OrderWorkspace queueHref="/ops/orders" />);

  await screen.findByText(/All six checks passed and every line counted right/);
  expect(requests).toContainEqual(
    expect.objectContaining({ path: "/escalations", search: "?orderId=order1" }),
  );
  // A passed row is closed by default; open it the way a person would.
  await userEvent.click(screen.getByRole("button", { name: /Counter check/ }));
  const section = counterSection();

  const ledger = within(section).getAllByRole("table")[0];
  const cards = within(ledger).getByRole("row", { name: /Business cards/ });
  expect(
    within(cards)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["200", "200", "Matches"]);
  expect(within(section).getByText("Supplier sign-off")).toBeInTheDocument();
  expect(within(section).queryByText("Failed", { selector: "span" })).toBeNull();
  expect(await within(section).findByText(/by Jomar Castillo/)).toBeInTheDocument();
  expect(within(section).getByText("Ana Reyes")).toBeInTheDocument();
  expect(await within(section).findByAltText("Signature of Ana Reyes")).toHaveAttribute(
    "src",
    "https://files.test/x.png",
  );

  // The earlier failed attempt stays on the record after the recheck passed.
  const earlier = within(section).getByRole("region", { name: "Earlier attempts" });
  expect(
    within(earlier).getByText("Top ten flyers are scuffed along the edge."),
  ).toBeVisible();
  expect(
    within(earlier).getByText(/Shop is reprinting the top ten flyers/),
  ).toBeVisible();
  expect(within(section).queryByRole("button", { name: /instruction/i })).toBeNull();
});

it("holds a short count at the counter and resolves it without releasing anything", async () => {
  order = shortOrder();
  escalations = [shortEscalation()];
  render(<OrderWorkspace queueHref="/ops/orders" />);

  expect(
    await screen.findByText(
      "Blocked: Business cards, matte 350gsm counted 12 short. The rider is waiting for you.",
    ),
  ).toBeInTheDocument();
  // A blocked rider opens the row on its own.
  const section = counterSection();
  const cards = await within(section).findByRole("row", { name: /Business cards/ });
  expect(
    within(cards)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["200", "188", "12 short"]);
  expect(within(section).getByText("Failed")).toBeInTheDocument();
  expect(within(section).getByText(/One bundle of cards is missing/)).toBeInTheDocument();
  expect(
    await within(section).findByRole("button", {
      name: "Open Pickup photo: file_short_photo.jpg",
    }),
  ).toBeInTheDocument();
  // The latest failed attempt is not repeated as an "earlier" one.
  expect(within(section).queryByRole("region", { name: "Earlier attempts" })).toBeNull();

  await userEvent.click(
    within(section).getByRole("button", { name: "Give the rider an instruction" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Send instruction" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent(/Write the instruction/);

  await userEvent.type(
    within(dialog).getByLabelText("Instruction"),
    "Wait for the last bundle, then count again.",
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Send instruction" }));

  expect(
    await screen.findByText(/Instruction sent/, { selector: "p" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Instruction sent. Waiting for the rider to check and count again."),
  ).toBeInTheDocument();
  const writes = requests.filter((request) => request.method !== "GET");
  expect(writes).toEqual([
    {
      method: "POST",
      path: "/escalations/esc_short/resolve",
      search: "",
      body: { resolution: "Wait for the last bundle, then count again." },
    },
  ]);
});

it("says an older check's count was not recorded, never zero", async () => {
  order = legacyOrder();
  escalations = [];
  render(<OrderWorkspace queueHref="/admin/overview" queueLabel="Back to overview" />);

  await screen.findByText(/The count was not recorded/);
  await userEvent.click(screen.getByRole("button", { name: /Counter check/ }));
  const section = counterSection();
  const row = within(section).getByRole("row", { name: /Tarpaulin banner/ });
  expect(
    within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["2", "—", "Not recorded"]);
  expect(within(section).queryByText("0")).toBeNull();
  expect(within(section).getByText(/checked before the shop signed/)).toBeInTheDocument();
});

it("keeps the order on screen when the attempt history cannot be read", async () => {
  order = shortOrder();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://gridgo.test");
      if (url.pathname === "/escalations") return json({ error: "server_error" }, 500);
      if (url.pathname.startsWith("/users/")) return json({ error: "forbidden" }, 403);
      if (url.pathname.startsWith("/files/")) return json({ error: "not_found" }, 404);
      return json({ order });
    }),
  );
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const section = (await screen.findByRole("heading", { name: /Counter check/ })).closest(
    "section",
  )!;
  expect(
    await within(section).findByText(/Earlier counter attempts could not be loaded/),
  ).toBeInTheDocument();
  expect(within(section).getByText(/by the rider/)).toBeInTheDocument();
  // The checklist names its escalation, so the rider can still be answered.
  expect(
    within(section).getByRole("button", { name: "Give the rider an instruction" }),
  ).toBeEnabled();
});
