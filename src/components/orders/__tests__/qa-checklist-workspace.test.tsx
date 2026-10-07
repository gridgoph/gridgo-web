// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "qa-order" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

const checks = { artwork: true, spec: true, quantity: true, address: true };
const at = "2026-10-07T02:30:00.000Z";
let order: Order;
let posts: unknown[];
let reviewerUnavailable = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  posts = [];
  reviewerUnavailable = false;
  order = {
    id: "qa-order",
    clientId: "client",
    supplierId: "shop",
    riderId: null,
    title: "Community event flyers",
    state: "production",
    quantity: 100,
    deadline: null,
    address: "Delivery address on file",
    totalMinor: 15000,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    artworkFileIds: [],
    createdAt: at,
    updatedAt: at,
    timeline: [],
    payoutMilestones: [],
    fileCheck: {
      status: "passed",
      requestedAt: at,
      reviewedAt: at,
      reviewedBy: "reviewer",
      waitingSeconds: 0,
      reason: null,
      checklist: { version: 1, checks: { ...checks } },
    },
  } as unknown as Order;
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://gridgo.test").pathname;
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        order = {
          ...order,
          state: body.state,
          fileCheck: {
            ...order.fileCheck!,
            status: body.state === "client_correction" ? "failed" : "passed",
            reviewedAt: at,
            reviewedBy: "reviewer",
            reason: body.note || null,
            checklist: { version: 1, checks: body.qaChecklist },
          },
        } as Order;
        return json({ order });
      }
      if (path === "/users/reviewer")
        return reviewerUnavailable
          ? json({ error: "not_found" }, 404)
          : json({ user: { id: "reviewer", name: "Test operator", role: "ops_admin" } });
      if (path.startsWith("/users/"))
        return json({ user: { id: "fixture", name: "Fixture account" } });
      if (path === "/audit") return json({ audit: [] });
      if (path === "/escalations") return json({ escalations: [] });
      if (path.endsWith("/refund-requests")) return json({ refundRequests: [] });
      return json({ order });
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

async function openQuality(tree = "ops") {
  render(
    <OrderWorkspace queueHref={`/${tree}/orders`} payoutsHref={`/${tree}/payouts`} />,
  );
  const button = await screen.findByRole("button", { name: /^Quality check/ });
  if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
  return within(button.closest("section")!);
}

function capture(name: string) {
  const dir = process.env.GRIDGO_TEST_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${name}.html`),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="portal.css"><title>GRIDGO QA checklist fixture</title></head><body><main style="max-width:1200px;margin:auto;padding:16px"><p>Operations workspace · integration fixture</p>${document.body.innerHTML}</main></body></html>`,
  );
}

it.each(["ops", "admin"])(
  "shows all recorded checks, reviewer and time in the %s accordion",
  async (tree) => {
    const qa = await openQuality(tree);
    capture(`reviewed-${tree}`);
    expect(
      qa.getByText("Artwork opens and is high enough resolution"),
    ).toBeInTheDocument();
    expect(
      qa.getByText("Specification matches what the client ordered"),
    ).toBeInTheDocument();
    expect(qa.getByText("Quantity looks deliberate")).toBeInTheDocument();
    expect(
      qa.getByText("Delivery address is somewhere a rider can go"),
    ).toBeInTheDocument();
    expect(qa.getAllByText("Checked")).toHaveLength(4);
    expect(await qa.findByText(/Reviewed by Test operator/)).toHaveTextContent(/Oct 7/);
    expect(qa.queryByRole("checkbox")).toBeNull();
    capture(`reviewed-${tree}`);
  },
);

it.each([null, undefined])(
  "never infers ticks from a historical pass (%s)",
  async (checklist) => {
    order.fileCheck = { ...order.fileCheck!, checklist };
    const qa = await openQuality();
    expect(qa.getAllByText("Not recorded")).toHaveLength(4);
    expect(qa.queryByText("Checked")).toBeNull();
    expect(await qa.findByText(/Reviewed by Test operator/)).toBeInTheDocument();
    capture("historical");
  },
);

it("keeps an absent review and unresolved reviewer honest", async () => {
  order.fileCheck = null;
  const qa = await openQuality();
  expect(qa.getAllByText("Not recorded")).toHaveLength(4);
  expect(qa.getByText("Reviewer and review time not recorded.")).toBeInTheDocument();
});

it("does not expose an internal reviewer ID when lookup fails", async () => {
  reviewerUnavailable = true;
  const qa = await openQuality();
  expect(await qa.findByText(/Reviewer unavailable/)).toBeInTheDocument();
  expect(qa.queryByText(/Reviewed by reviewer/)).toBeNull();
});

it("shows recorded partial checks and the send-back reason", async () => {
  order.state = "client_correction";
  order.fileCheck = {
    ...order.fileCheck!,
    status: "failed",
    reason: "Upload a sharper artwork file.",
    checklist: { version: 1, checks: { ...checks, artwork: false } },
  };
  const qa = await openQuality();
  expect(qa.getAllByText("Checked")).toHaveLength(3);
  expect(qa.getByText("Not checked")).toBeInTheDocument();
  expect(qa.getByText("Upload a sharper artwork file.")).toBeInTheDocument();
  capture("sent-back");
});

it.each(["approve", "send back"])(
  "submits explicit ticks when reviewers %s in the workspace",
  async (action) => {
    order.state = "needs_qa";
    order.fileCheck = {
      ...order.fileCheck!,
      status: "pending",
      reviewedAt: null,
      reviewedBy: null,
      checklist: null,
    };
    const qa = await openQuality();
    const boxes = qa.getAllByRole("checkbox");
    const approve = qa.getByRole("button", { name: "Approve and send to the shop" });
    expect(approve).toBeDisabled();
    for (const box of action === "approve" ? boxes : boxes.slice(1)) fireEvent.click(box);
    capture(`review-form-${action.replace(" ", "-")}`);
  if (action === "approve") fireEvent.click(approve);
    else {
      fireEvent.change(qa.getByRole("textbox", { name: "Note to the client" }), {
        target: { value: "Upload a sharper artwork file." },
      });
      fireEvent.click(qa.getByRole("button", { name: "Send back for changes" }));
    }
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      qaChecklist: { ...checks, artwork: action === "approve" },
    });
  },
);

it("uses the existing pickup and design-link check wording", async () => {
  order.requestFulfillment = { fulfillmentMode: "pickup" } as Order["requestFulfillment"];
  order.productionItems = [
    { id: "line", artworkLinks: [{ url: "https://example.com/design/view" }] },
  ] as Order["productionItems"];
  const qa = await openQuality();
  expect(
    qa.getByText("Client collects at the GRIDGO counter (Pick-up)"),
  ).toBeInTheDocument();
  expect(
    qa.getByText(
      "Design link opens without signing in, and the design is high enough resolution",
    ),
  ).toBeInTheDocument();
  capture("pickup-link");
});
