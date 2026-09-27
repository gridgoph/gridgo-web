// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderMeta } from "@/components/orders/OrderMeta";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { ArtworkLink, Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

const CANVA: ArtworkLink = {
  formatCode: "canva_link",
  url: "https://www.canva.com/design/DAGflyer123/SHARE_TOKEN/view?utm_source=share",
};
const DRIVE: ArtworkLink = {
  formatCode: "google_drive",
  url: "https://drive.google.com/file/d/1AbCdEf/view",
};
const AT = "2026-09-27T06:00:00.000Z";

function fixture(partial: Partial<Order> = {}): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: "needs_qa",
    title: "Flyers",
    quantity: 500,
    deadline: null,
    address: "Davao",
    totalMinor: 10000,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "initial_payment_confirmed",
    promisedDate: null,
    artworkName: null,
    artworkFileIds: [],
    productionItems: [
      {
        id: "line1",
        itemName: "Flyers",
        quantity: 500,
        measurement: null,
        artworkFileId: null,
        artworkLinks: [CANVA, DRIVE],
      },
    ],
    createdAt: AT,
    updatedAt: AT,
    timeline: [],
    ...partial,
  };
}

let order: Order;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("React", React);
  order = fixture();
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://gridgo.test").pathname;
      if (path.startsWith("/files/")) {
        return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      }
      return new Response(JSON.stringify({ order }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("design link rows", () => {
  it("says a link-only job has a design to open, never that it has none", () => {
    render(<OrderMeta order={fixture()} showMoney={false} />);

    expect(screen.getByText("Design link: open it to get the file")).toBeInTheDocument();
    expect(screen.queryByText("None on file")).not.toBeInTheDocument();
    expect(screen.queryByText(/no artwork/i)).not.toBeInTheDocument();

    const rows = within(screen.getByRole("list", { name: "Design links" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(2);
    const canva = within(rows[0]).getByRole("link");
    expect(canva).toHaveAccessibleName(/Canva/);
    expect(canva).toHaveAttribute("href", CANVA.url);
    expect(canva).toHaveAttribute("target", "_blank");
    expect(canva).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(rows[1]).getByRole("link")).toHaveAccessibleName(/Google Drive/);
  });

  it("copies the whole link, tracking tail included", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<OrderMeta order={fixture()} showMoney={false} />);

    await user.click(screen.getByRole("button", { name: "Copy Canva link" }));

    expect(writeText).toHaveBeenCalledWith(CANVA.url);
    const row = screen.getByRole("button", { name: "Copy Canva link" }).closest("li")!;
    expect(await within(row).findByRole("status")).toHaveTextContent("Copied");
  });

  it("keeps the file plate first and adds the link beside it", () => {
    render(
      <OrderMeta
        order={fixture({
          artworkFileIds: ["file_art"],
          productionItems: [
            {
              id: "line1",
              itemName: "Flyers",
              quantity: 500,
              measurement: null,
              artworkFileId: "file_art",
              artworkLinks: [CANVA],
            },
          ],
        })}
        showMoney={false}
      />,
    );

    expect(
      screen.getByText("The client also sent a design link. Check it matches the file."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Design link: open it to get the file")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Canva/ })).toHaveAttribute("href", CANVA.url);
  });

  it("still says None on file when there is neither", () => {
    render(<OrderMeta order={fixture({ productionItems: [] })} showMoney={false} />);
    expect(screen.getByText("None on file")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Design links" })).not.toBeInTheDocument();
  });

  it("puts the link in the QA step and asks Operations to check it opens", async () => {
    render(<OrderWorkspace queueHref="/ops/orders" />);

    const approve = await screen.findByRole("button", { name: "Approve and send to the shop" });
    expect(approve).toBeDisabled();
    // Once in the QA step, once in the rail.
    expect(screen.getAllByRole("list", { name: "Design links" })).toHaveLength(2);
    expect(screen.getAllByText("Design link: open it to get the file")).toHaveLength(2);
    expect(
      screen.getByLabelText(
        "Design link opens without signing in, and the design is high enough resolution",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no artwork/i)).not.toBeInTheDocument();
  });
});
