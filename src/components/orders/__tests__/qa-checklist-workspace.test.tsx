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
      if (init?.method === "POST" && (path.endsWith("/qa-checks") || path.endsWith("/qa-actions"))) {
        return json({ ok: true, threadId: "thread" });
      }
      if (init?.method === "POST" && path.endsWith("/artwork-downloads")) {
        return json({ files: [] });
      }
      if (path.startsWith("/files/") && path.endsWith("/download-url")) {
        return json({ url: "https://files.test/artwork" });
      }
      if (path.startsWith("/files/")) return json({ file: { fileId: path.split("/")[2], originalFilename: "flyer.pdf", detectedContentType: "application/pdf", state: "ready", detected: null } });
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
    expect(qa.getByText("Artwork is print-ready")).toBeInTheDocument();
    expect(qa.getByText("Specifications match the order")).toBeInTheDocument();
    expect(qa.getByText("Quantity is intentional and not mistaken")).toBeInTheDocument();
    expect(qa.getByText("Rider can reach the delivery address")).toBeInTheDocument();
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
    for (const box of action === "approve" ? boxes : boxes.slice(1)) {
      fireEvent.click(box);
      await waitFor(() => expect(box).toBeChecked());
    }
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
  order.state = "needs_qa";
  order.fileCheck = {
    ...order.fileCheck!,
    status: "pending",
    reviewedAt: null,
    reviewedBy: null,
    checklist: null,
  };
  order.requestFulfillment = { fulfillmentMode: "pickup" } as Order["requestFulfillment"];
  order.productionItems = [
    { id: "line", artworkLinks: [{ url: "https://example.com/design/view" }] },
  ] as Order["productionItems"];
  const qa = await openQuality();
  expect(
    qa.getByText("Client collects at the GRIDGO counter (Pick-up)"),
  ).toBeInTheDocument();
  expect(
    qa.getByText("Design link opens without signing in, and the design is high enough resolution"),
  ).toBeInTheDocument();
  expect(qa.getByText("Design link: open it to get the file")).toBeInTheDocument();
  capture("pickup-link");
});

it("holds approve and send back while GRIDGO is closed, and keeps cancel", async () => {
  // The API projects a review at the next opening, well after now.
  const opens = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  order.state = "needs_qa";
  order.fileCheck = {
    ...order.fileCheck!,
    status: "pending",
    reviewedAt: null,
    reviewedBy: null,
    checklist: null,
  };
  order.review = {
    status: "waiting_for_review",
    label: "Waiting for review",
    timeZone: "Asia/Manila",
    isOpenNow: false,
    artworkReviewMinutes: 60,
    scheduledReviewAt: opens,
    reviewCompletesAt: opens,
    reviewDelayed: true,
    originallyScheduledReviewAt: null,
    outsideHoursNotice: "outside_operating_hours",
    readyBy: null,
  };
  const qa = await openQuality();
  expect(qa.getByTestId("workspace-review-closed")).toHaveTextContent(
    /GRIDGO is closed\. This file can be approved or sent back from/,
  );
  expect(qa.getByText(/Waiting for review: GRIDGO is closed.*Review delayed\./)).toBeInTheDocument();
  for (const box of qa.getAllByRole("checkbox")) fireEvent.click(box);
  fireEvent.change(qa.getByRole("textbox", { name: "Note to the client" }), {
    target: { value: "Upload a sharper artwork file." },
  });
  expect(qa.getByRole("button", { name: "Approve and send to the shop" })).toBeDisabled();
  expect(qa.getByRole("button", { name: "Send back for changes" })).toBeDisabled();
  expect(qa.getByRole("button", { name: "Cancel this order" })).toBeEnabled();
});

it("holds the order for a prohibited item from the Quality check row", async () => {
  order.state = "needs_qa";
  order.fileCheck = {
    ...order.fileCheck!,
    status: "pending",
    reviewedAt: null,
    reviewedBy: null,
    checklist: null,
  };
  const qa = await openQuality();
  fireEvent.click(qa.getByRole("button", { name: "Prohibited item" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Why it cannot be printed"), {
    target: { value: "This design copies a registered brand logo." },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Hold the order" }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toEqual({
    state: "client_correction",
    reasonCode: "prohibited_item",
    note: "This design copies a registered brand logo.",
  });
});

it("shows a prohibited-item hold in the header and the Quality check row", async () => {
  order.state = "client_correction";
  order.fileCheck = {
    ...order.fileCheck!,
    status: "failed",
    reason: "This design copies a registered brand logo.",
    reasonCode: "prohibited_item",
    checklist: null,
  };
  const qa = await openQuality();
  // The header chip and the row both carry the hold.
  expect(screen.getAllByText("On hold: prohibited item").length).toBeGreaterThanOrEqual(2);
  expect(qa.getByText("On hold for a prohibited item.")).toBeInTheDocument();
  expect(qa.getByText("“This design copies a registered brand logo.”")).toBeInTheDocument();
  capture("prohibited-hold");
  fireEvent.click(qa.getByRole("button", { name: "Release to the file check" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Why the hold is lifted"), {
    target: { value: "The client showed written permission." },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Release to the file check" }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toEqual({ state: "needs_qa", note: "The client showed written permission." });
});
