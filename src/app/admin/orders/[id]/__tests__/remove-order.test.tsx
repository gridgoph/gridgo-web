// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminOrderWorkspacePage from "@/app/admin/orders/[id]/page";
import OpsOrderWorkspacePage from "@/app/ops/orders/[id]/page";
import { toast } from "@/components/ui/toast";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "order1" }),
  useRouter: () => ({ replace }),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: () => null,
  EvidenceStrip: () => null,
}));
vi.mock("@/components/orders/ReceiptReferenceOcr", () => ({
  ReceiptReferenceOcr: () => null,
}));

const EMAIL = "Test.Client@gridgo.test";

function fixture(partial: Partial<Order> = {}): Order {
  return {
    id: "order1",
    clientId: "client1",
    clientName: "Test Client",
    clientEmail: EMAIL,
    supplierId: null,
    riderId: null,
    title: "Flyers A5",
    state: "needs_qa",
    currency: "PHP",
    subtotalMinor: 100_000,
    totalMinor: 100_000,
    deliveryFeeMinor: 0,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    timeline: [],
    ...partial,
  } as unknown as Order;
}

let order: Order;
let removal: { status: number; body: unknown };
let posted: Array<{ path: string; body: Record<string, unknown> }>;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("PointerEvent", MouseEvent);
  setTokenProvider(() => "fixture-token");
  order = fixture();
  removal = { status: 200, body: { id: "order1", removedAt: "2026-11-06T01:00:00.000Z" } };
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname.replace(
        /^\/api\/gridgo/,
        "",
      );
      const reply = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/ops/orders/order1/remove" && init?.method === "POST") {
        posted.push({ path, body: JSON.parse(String(init.body)) });
        return reply(removal.body, removal.status);
      }
      if (path === "/orders/order1") return reply({ order });
      if (path === "/orders/order1/refund-requests") return reply({ refunds: [] });
      if (path === "/escalations") return reply({ escalations: [] });
      return reply({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  replace.mockClear();
});

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<AdminOrderWorkspacePage />);
  await user.click(await screen.findByRole("button", { name: "Remove order" }));
  return screen.findByRole("alertdialog");
}

function controls(dialog: HTMLElement) {
  return {
    reason: within(dialog).getByRole("textbox", { name: /reason/i }),
    email: within(dialog).getByRole("textbox", { name: /client.s email/i }),
    submit: within(dialog).getByRole("button", { name: "Remove order" }),
  };
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await openDialog(user);
  const { reason, email, submit } = controls(dialog);
  await user.type(reason, "Test order that never finished");
  await user.type(email, EMAIL);
  await user.click(submit);
  return dialog;
}

describe("Remove order visibility by role", () => {
  it("is on the Super Admin order page", async () => {
    render(<AdminOrderWorkspacePage />);
    expect(await screen.findByRole("button", { name: "Remove order" })).toBeEnabled();
  });

  it("is not on the Operations order page, even when an email reaches it", async () => {
    render(<OpsOrderWorkspacePage />);
    await screen.findByRole("heading", { name: "Flyers A5" });
    expect(screen.queryByRole("button", { name: "Remove order" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Remove order" })).toBeNull();
    expect(screen.queryByText(EMAIL)).toBeNull();
  });

  it("is never imported, and the email never read, outside the Super Admin tree", () => {
    const root = join(process.cwd(), "src");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
      });
    const files = [
      ...walk(join(root, "app/ops")),
      ...walk(join(root, "app/supplier")),
      ...walk(join(root, "components")),
    ];
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) =>
      /RemoveOrder|removeOrder|clientEmail/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("explains itself and stays closed when no client email came with the order", async () => {
    order = fixture({ clientEmail: undefined });
    render(<AdminOrderWorkspacePage />);
    expect(await screen.findByRole("button", { name: "Remove order" })).toBeDisabled();
    expect(screen.getByText(/no client email to confirm against/i)).toBeInTheDocument();
  });
});

describe("Remove order eligibility from the API", () => {
  it("offers the action when the API allows removal", async () => {
    order = fixture({ removal: { allowed: true, blockedReason: null } });
    render(<AdminOrderWorkspacePage />);
    expect(await screen.findByRole("button", { name: "Remove order" })).toBeEnabled();
  });

  it.each([
    ["payout_released", "A payout has already been released."],
    ["refund_activity", "This order has a refund in progress or completed."],
    ["payment_submitted", "A payment has been submitted or confirmed."],
    ["financial_activity", "This order has financial activity."],
    ["shop_assigned", "A shop is already assigned."],
    ["some_new_code", "This order cannot be removed."],
  ])("shows one line instead of the action when blocked by %s", async (code, line) => {
    order = fixture({ removal: { allowed: false, blockedReason: code } });
    render(<AdminOrderWorkspacePage />);
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Remove order" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove order" })).toBeNull();
    expect(screen.queryByText(EMAIL)).toBeNull();
  });

  it("still explains a block that came without a reason", async () => {
    order = fixture({ removal: { allowed: false, blockedReason: null } });
    render(<AdminOrderWorkspacePage />);
    expect(await screen.findByText("This order cannot be removed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove order" })).toBeNull();
  });
});

describe("Remove order reason length", () => {
  async function withReason(text: string) {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    const { reason, email, submit } = controls(dialog);
    await user.click(reason);
    await user.paste(text);
    await user.type(email, EMAIL);
    return { user, dialog, reason, submit };
  }

  it("accepts exactly 2,000 characters", async () => {
    const { reason, submit } = await withReason("x".repeat(2_000));
    expect(submit).toBeEnabled();
    expect(reason).not.toHaveAttribute("aria-invalid");
  });

  it("counts the trimmed reason, as the API does", async () => {
    const { submit } = await withReason(`  ${"x".repeat(2_000)}  `);
    expect(submit).toBeEnabled();
  });

  it("refuses 2,001 characters and says why", async () => {
    const { user, dialog, reason, submit } = await withReason("x".repeat(2_001));
    expect(submit).toBeDisabled();
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByText("2,001 characters. Keep it to 2,000.")).toBeInTheDocument();
    await user.click(submit);
    expect(posted).toEqual([]);
  });
});

describe("Remove order dialog", () => {
  it("says what removal does in plain words and shows the email to type", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    const note = within(dialog).getByRole("note");
    expect(note).toHaveTextContent(/disappears from every list and app/i);
    expect(note).toHaveTextContent(/stay on the audit log/i);
    expect(note).toHaveTextContent(/no money moves/i);
    expect(within(dialog).getByText(EMAIL)).toBeInTheDocument();
  });

  it("keeps submit disabled until there is a reason and the email matches", async () => {
    const user = userEvent.setup();
    const { reason, email, submit } = controls(await openDialog(user));
    expect(submit).toBeDisabled();

    await user.type(email, EMAIL);
    expect(submit).toBeDisabled();

    await user.type(reason, "   ");
    expect(submit).toBeDisabled();

    await user.type(reason, "Test order");
    expect(submit).toBeEnabled();

    await user.clear(reason);
    expect(submit).toBeDisabled();
  });

  it.each([
    ["different capitals", EMAIL.toLowerCase()],
    ["a trailing space", `${EMAIL} `],
    ["a leading space", ` ${EMAIL}`],
    ["a partial email", EMAIL.slice(0, -1)],
    ["another address", "someone@gridgo.test"],
  ])("refuses %s", async (_label, typed) => {
    const user = userEvent.setup();
    const { reason, email, submit } = controls(await openDialog(user));
    await user.type(reason, "Test order");
    await user.type(email, typed);
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(posted).toEqual([]);
  });

  it("clears what was typed when it is cancelled", async () => {
    const user = userEvent.setup();
    const first = controls(await openDialog(user));
    await user.type(first.reason, "Test order");
    await user.type(first.email, EMAIL);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Remove order" }));
    const again = controls(await screen.findByRole("alertdialog"));
    expect(again.reason).toHaveValue("");
    expect(again.email).toHaveValue("");
  });

  it("sends the trimmed reason and exact email, confirms, and returns to the list", async () => {
    const added = vi.spyOn(toast, "add");
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    const { reason, email, submit } = controls(dialog);
    await user.type(reason, "  Test order that never finished  ");
    await user.type(email, EMAIL);
    await user.click(submit);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/overview"));
    expect(posted).toEqual([
      {
        path: "/ops/orders/order1/remove",
        body: { reason: "Test order that never finished", confirmEmail: EMAIL },
      },
    ]);
    expect(added).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "Order removed" }),
    );
  });

  it.each([
    [403, { error: "forbidden" }, "Only a Super Admin can remove an order."],
    [404, { error: "order_not_found" }, "This order is no longer on the platform."],
    [409, { error: "order_already_removed" }, "This order was already removed."],
    [400, { error: "reason_required" }, "in 2,000 characters or fewer."],
    [400, { error: "confirm_email_mismatch" }, "That email does not match the client"],
    [
      409,
      { error: "order_removal_blocked", message: "A payout was already released on this order." },
      "A payout was already released on this order.",
    ],
    [
      409,
      { error: "order_removal_blocked" },
      "This order cannot be removed because money records depend on it.",
    ],
    [500, { error: "internal_error" }, "The order was not removed."],
  ])("shows a plain sentence for %i %j and stays open", async (status, body, sentence) => {
    removal = { status, body };
    const added = vi.spyOn(toast, "add");
    const user = userEvent.setup();
    const dialog = await fillAndSubmit(user);

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(sentence);
    expect(within(dialog).getByRole("alert").textContent).not.toMatch(/_/);
    expect(replace).not.toHaveBeenCalled();
    expect(added).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("textbox", { name: /reason/i })).toHaveValue(
      "Test order that never finished",
    );
    expect(within(dialog).getByRole("button", { name: "Remove order" })).toBeEnabled();
  });
});
