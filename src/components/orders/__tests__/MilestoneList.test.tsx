// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MilestoneList } from "@/components/orders/MilestoneList";
import type { Order, PayoutMilestone } from "@/lib/api/types";

vi.stubGlobal("React", React);
afterEach(cleanup);

function milestone(p: Partial<PayoutMilestone> & Pick<PayoutMilestone, "code">): PayoutMilestone {
  return {
    sharePercent: 50,
    amountMinor: 10_000,
    status: "pending",
    pofFileIds: [],
    releasedAt: null,
    releasedBy: null,
    ...p,
  } as PayoutMilestone;
}

function order(milestones: PayoutMilestone[]): Order {
  return {
    id: "o1",
    clientId: "c1",
    supplierId: "s1",
    riderId: null,
    state: "production",
    title: "Flyers",
    deadline: null,
    address: "Somewhere",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    payoutMilestones: milestones,
  } as unknown as Order;
}

describe("MilestoneList", () => {
  it("names the live two-stage split instead of showing 'Milestone' twice", () => {
    render(
      <MilestoneList
        order={order([
          milestone({ code: "initial", sharePercent: 75, amountMinor: 30_000 }),
          milestone({ code: "completion", sharePercent: 25, amountMinor: 10_000 }),
        ])}
      />,
    );
    expect(screen.getByText(/First release/)).toBeInTheDocument();
    expect(screen.getByText(/Final release/)).toBeInTheDocument();
    expect(screen.queryByText(/^\s*Milestone\s*$/)).toBeNull();
  });

  it("describes an unknown code by its share rather than a generic word", () => {
    render(<MilestoneList order={order([milestone({ code: "surprise", sharePercent: 40 })])} />);
    expect(screen.getByText(/40% release/)).toBeInTheDocument();
  });

  it("numbers the stages, because they release in order", () => {
    render(
      <MilestoneList
        order={order([milestone({ code: "initial" }), milestone({ code: "completion" })])}
      />,
    );
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("states a reason shared by every stage once, not under each", () => {
    render(
      <MilestoneList
        order={order([milestone({ code: "initial" }), milestone({ code: "completion" })])}
      />,
    );
    // Both stages are blocked for the same reason: no proof on file anywhere.
    expect(screen.getAllByText(/proof/i).length).toBeGreaterThan(0);
    const paragraphs = screen
      .getAllByText(/Ask the supplier|upload the proof|Proof of Fulfilment/i)
      .map((el) => el.textContent);
    expect(new Set(paragraphs).size).toBe(paragraphs.length);
  });

  it("reads the pending status the API actually sends", () => {
    render(<MilestoneList order={order([milestone({ code: "initial", status: "pending" })])} />);
    expect(screen.getByText("Proof needed")).toBeInTheDocument();
  });

  it("explains itself when the order has no milestones yet", () => {
    render(<MilestoneList order={order([])} />);
    expect(screen.getByText(/set up when the supplier accepts/i)).toBeInTheDocument();
  });
});
