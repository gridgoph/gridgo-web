// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order, OrderChangeRequest } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  cancelShopJob: vi.fn(),
  requestShopDeadline: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    cancelShopJob: mocks.cancelShopJob,
    requestShopDeadline: mocks.requestShopDeadline,
  };
});

import { ShopLeaveJob } from "@/app/supplier/_components/ShopLeaveJob";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const WAITING =
  "This job has a change request waiting. Ask for a new deadline once the client has answered it.";

function change(status: string): OrderChangeRequest {
  return {
    id: "chg_1",
    lineItemId: null,
    status,
    version: 1,
    reason: "Thicker paper",
    proposedSpec: "300gsm",
    createdAt: "2026-10-20T01:00:00.000Z",
  };
}

function job(extra: Partial<Order> = {}): Order {
  return {
    id: "job-1",
    state: "production",
    readyBy: "2999-01-02T09:00:00.000Z",
    readyAt: null,
    ...extra,
  } as Order;
}

describe("ShopLeaveJob deadline request", () => {
  it("offers a later ready-by when nothing else is waiting", () => {
    render(<ShopLeaveJob order={job()} onChanged={() => {}} />);
    expect(screen.getByRole("heading", { name: "Ask for a later ready-by" })).toBeVisible();
  });

  it.each(["pending", "pending_payment", "pending_confirmation"])(
    "holds it back while the shop's change request is %s, and says why",
    (status) => {
      render(<ShopLeaveJob order={job({ changeRequests: [change(status)] })} onChanged={() => {}} />);
      expect(
        screen.queryByRole("heading", { name: "Ask for a later ready-by" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(WAITING)).toBeVisible();
    },
  );

  it("offers it again once the change request is settled", () => {
    render(<ShopLeaveJob order={job({ changeRequests: [change("declined")] })} onChanged={() => {}} />);
    expect(screen.getByRole("heading", { name: "Ask for a later ready-by" })).toBeVisible();
    expect(screen.queryByText(WAITING)).not.toBeInTheDocument();
  });

  it("explains change_request_pending and rereads the job", async () => {
    mocks.requestShopDeadline.mockRejectedValue(
      new ApiError(409, { error: "change_request_pending" }),
    );
    const onChanged = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<ShopLeaveJob order={job()} onChanged={onChanged} />);

    const when = container.querySelector<HTMLInputElement>('input[type="datetime-local"]')!;
    await user.type(when, "2999-01-05T10:00");
    await user.type(screen.getByLabelText("Reason the client will see"), "Paper is late");
    await user.click(screen.getByRole("button", { name: "Request a new deadline" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(WAITING);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
