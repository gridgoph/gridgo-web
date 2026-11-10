// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrderActions, ORDER_ACTIONS_PREVIEW } from "@/components/orders/OrderActions";
import { Timeline } from "@/components/orders/Timeline";
import type { OrderAction } from "@/lib/api/types";

vi.stubGlobal("React", React);
afterEach(cleanup);

const staff = { userId: "user_sam", name: "Sam Santos", role: "staff" };

describe("who did it", () => {
  it("puts the person and their shop role on a timeline row", () => {
    render(
      <Timeline
        entries={[{ at: "2026-11-08T08:00:00.000Z", state: "in_production", actor: staff } as never]}
      />,
    );
    expect(screen.getByText(/Sam Santos · Staff/)).toBeVisible();
  });

  it("keeps the older platform-role line when an entry has no actor", () => {
    render(
      <Timeline entries={[{ at: "2026-11-08T08:00:00.000Z", state: "in_production", by: "user_ops", note: "" }]} />,
    );
    expect(screen.getByText(/Operations/)).toBeVisible();
  });

  it("lists every order action, newest first, with who and when", async () => {
    const actions: OrderAction[] = Array.from({ length: ORDER_ACTIONS_PREVIEW + 2 }, (_, i) => ({
      id: `a${i}`,
      at: `2026-11-08T0${i}:00:00.000Z`,
      action: i === ORDER_ACTIONS_PREVIEW + 1 ? "order.transition" : "file.saved",
      actor: i === ORDER_ACTIONS_PREVIEW + 1 ? staff : { userId: "o", name: "Olive", role: "owner" },
    }));
    render(<OrderActions actions={actions} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(ORDER_ACTIONS_PREVIEW);
    expect(rows[0]).toHaveTextContent("Sam Santos · Staff moved the order on");
    await userEvent.click(screen.getByRole("button", { name: `Show all ${actions.length}` }));
    expect(screen.getAllByRole("listitem")).toHaveLength(actions.length);
  });

  it("says a Staff message to the client, and keeps unknown actions neutral", () => {
    render(
      <OrderActions
        actions={[
          { id: "m1", at: "2026-11-08T09:00:00.000Z", action: "client_shop_chat.message_sent", actor: staff },
          { id: "m0", at: "2026-11-08T08:00:00.000Z", action: "brand.new_thing", actor: staff },
        ]}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Sam Santos · Staff messaged the client");
    expect(rows[1]).toHaveTextContent("Sam Santos · Staff updated the order");
  });

  it("renders nothing without actions", () => {
    const { container } = render(<OrderActions actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
