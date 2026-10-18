// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OrderChatsDesk } from "@/components/client-shop-chat/OrderChatsDesk";
import { setTokenProvider } from "@/lib/api/client";
import type { ClientShopChatListEntry } from "@/lib/api/types";

vi.stubGlobal("React", React);

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/ops/order-chats",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

const AT = "2026-10-17T04:00:00.000Z";

const flagged: ClientShopChatListEntry = {
  orderId: "ord_flag",
  createdAt: AT,
  updatedAt: AT,
  status: "open",
  closesAt: null,
  participants: ["Client", "Print shop", "GRIDGO"],
  reminder: "r",
  unread: 2,
  contactAttempts: 4,
  flaggedAt: AT,
  reportCount: 1,
  contactThreshold: 3,
};

const quiet: ClientShopChatListEntry = {
  ...flagged,
  orderId: "ord_quiet",
  unread: 0,
  contactAttempts: 0,
  flaggedAt: null,
  reportCount: 0,
  status: "read_only",
};

let lists: string[];

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  nav.search = "";
  nav.replace.mockReset();
  lists = [];
  setTokenProvider(() => "token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://gridgo.test");
      if (url.pathname === "/ops/client-shop-chats") {
        lists.push(url.search);
        return json({
          threads: url.searchParams.get("flagged") ? [flagged] : [flagged, quiet],
          nextOffset: null,
        });
      }
      if (url.pathname.endsWith("/client-shop-chat")) {
        return json({ chat: flagged, messages: [], nextAfter: null, reports: [] });
      }
      const id = url.pathname.split("/").pop();
      return json({ order: { id, title: id === "ord_flag" ? "Flyers" : "Tote bags", timeline: [] } });
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

it("opens on flagged conversations with why each was flagged", async () => {
  render(<OrderChatsDesk tree="ops" />);

  const list = await screen.findByRole("list", { name: "Order conversations" });
  expect(await within(list).findByText("Flyers")).toBeInTheDocument();
  expect(within(list).getByText("Order ord_flag")).toBeInTheDocument();
  expect(within(list).getByText(/1 report · 4 contact attempts/)).toBeInTheDocument();
  expect(within(list).getByLabelText("2 unread")).toBeInTheDocument();
  expect(lists[0]).toBe("?flagged=1&limit=25");
  expect(screen.getByText("Pick a conversation")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "All" }));
  expect(await within(list).findByText("Tote bags")).toBeInTheDocument();
  expect(lists.at(-1)).toBe("?limit=25");

  await userEvent.click(within(list).getByText("Tote bags"));
  expect(nav.replace).toHaveBeenCalledWith("/ops/order-chats?order=ord_quiet", { scroll: false });
});

it("opens the conversation an inbox notice names, with a way to the order", async () => {
  nav.search = "order=ord_flag";
  render(<OrderChatsDesk tree="admin" />);

  expect(await screen.findByTestId("client-shop-chat")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open the order" })).toHaveAttribute(
    "href",
    "/admin/orders/ord_flag",
  );
  expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
});
