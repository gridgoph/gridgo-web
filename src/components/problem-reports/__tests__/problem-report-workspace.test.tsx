// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { DecisionDialog } from "@/components/problem-reports/DecisionDialog";
import { setTokenProvider } from "@/lib/api/client";
import type { FaultDecision, Issue, Order } from "@/lib/api/types";
import { PEOPLE, passedOrder } from "@/test/counter-check";

vi.stubGlobal("React", React);

// Base UI radios dispatch a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

let order: Order;
let issues: Issue[];
let requests: { method: string; path: string; search: string; body: Record<string, unknown> | null }[];
/** Answers a POST with this error instead, once. */
let refuseNext: { status: number; body: unknown } | null;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function report(p: Partial<Issue> = {}): Issue {
  return {
    id: "iss_1",
    orderId: "order1",
    clientId: "client1",
    description: "Every flyer has a smudge across the logo.",
    kind: "damage",
    status: "open",
    consequence: "payout_hold",
    claimId: "clm_1",
    createdAt: "2026-09-28T02:00:00.000Z",
    updatedAt: "2026-09-28T02:00:00.000Z",
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
    version: 1,
    photoFileIds: ["file_problem"],
    evidenceSnapshot: {
      version: 1,
      capturedAt: "2026-09-28T02:00:00.000Z",
      groups: [
        {
          id: "specification",
          kind: "specification",
          data: {
            items: [
              {
                itemNameSnapshot: "A5 flyers, gloss",
                quantity: 100,
                specialInstructions: "Keep the logo crisp.",
              },
            ],
          },
        },
        { id: "approvals", kind: "approval", data: [] },
        { id: "file_check", kind: "preflight", data: null },
        {
          id: "shop_qa",
          kind: "shop_qa",
          data: {
            finished: { at: "2026-09-27T04:00:00.000Z", photoFileIds: ["file_qa"] },
            review: { at: "2026-09-27T04:10:00.000Z", decision: "approved", note: "" },
          },
        },
        { id: "rider_check", kind: "rider_check", data: { checklist: null } },
        { id: "delivery", kind: "delivery", data: {} },
        { id: "client_photos", kind: "client_report", data: { fileIds: ["file_problem"] } },
      ],
      files: [
        {
          fileId: "file_problem",
          purpose: "refund_evidence",
          originalFilename: "smudge.jpg",
          detectedContentType: "image/jpeg",
          unavailable: false,
        },
        {
          fileId: "file_qa",
          purpose: "finished_product_photo",
          originalFilename: "finished.jpg",
          detectedContentType: "image/jpeg",
          unavailable: false,
        },
        {
          fileId: "file_art",
          purpose: "artwork",
          originalFilename: "flyer.pdf",
          detectedContentType: "application/pdf",
          artworkCheck: { status: "passed", checkedAt: "2026-09-26T00:00:00.000Z", reason: null, message: "ok" },
          unavailable: false,
        },
      ],
    },
    ...p,
  };
}

const pendingDecision: FaultDecision = {
  id: "idecision_1",
  fault: "gridgo",
  remedy: "full_refund",
  reason: "Lost at the hub.",
  evidenceIds: ["delivery"],
  alternativesReason: "The event is today.",
  costMinor: 150000,
  gridgoCostMinor: 150000,
  recordedBy: "ops1",
  recordedAt: "2026-09-28T03:00:00.000Z",
  status: "awaiting_approval",
};

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("PointerEvent", FakePointerEvent);
  requests = [];
  refuseNext = null;
  order = passedOrder();
  issues = [report()];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://gridgo.test");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, path: url.pathname, search: url.search, body });
      if (method === "POST" && refuseNext) {
        const refusal = refuseNext;
        refuseNext = null;
        return json(refusal.body, refusal.status);
      }
      if (method === "POST" && url.pathname === "/issues/iss_1/decision") {
        const decision: FaultDecision = {
          id: "idecision_2",
          ...body,
          recordedBy: "ops1",
          recordedAt: "2026-09-28T04:00:00.000Z",
          status: body.gridgoCostMinor > 100000 ? "awaiting_approval" : "approved",
        };
        issues = [report({ version: 2, faultDecision: decision, faultDecisionHistory: [decision] })];
        return json({ issue: issues[0] });
      }
      if (method === "POST" && url.pathname === "/issues/iss_1/approve-decision") {
        const approved = { ...issues[0].faultDecision!, status: "approved", approvedBy: "admin1", approvedAt: "2026-09-28T05:00:00.000Z" };
        issues = [report({ version: 3, faultDecision: approved, faultDecisionHistory: [issues[0].faultDecision!, approved] })];
        return json({ issue: issues[0] });
      }
      if (method === "POST" && url.pathname === "/issues/iss_1/resolve") {
        issues = [report({ status: "resolved", resolution: body.resolution, resolvedAt: "2026-09-28T06:00:00.000Z" })];
        return json({ issue: issues[0] });
      }
      if (url.pathname === "/issues") return json({ issues });
      if (url.pathname === "/escalations") return json({ escalations: [] });
      if (url.pathname.startsWith("/users/")) {
        const id = url.pathname.split("/")[2];
        const names: Record<string, string> = { ...PEOPLE, ops1: "Operations One", admin1: "Super One" };
        return names[id]
          ? json({ user: { id, name: names[id], email: "", role: "ops_admin" } })
          : json({ error: "user_not_found" }, 404);
      }
      if (url.pathname.endsWith("/download-url")) return json({ url: "https://files.test/x.png" });
      if (url.pathname.startsWith("/files/")) {
        const fileId = url.pathname.split("/")[2];
        return json({
          file: { fileId, originalFilename: `${fileId}.jpg`, declaredContentType: "image/jpeg", detectedContentType: "image/jpeg" },
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

function problemSection() {
  return screen.getByRole("heading", { name: /Problem report/, level: 2 }).closest("section")!;
}

it("opens an open report with its gathered evidence, saying plainly what was not recorded", async () => {
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await screen.findByText("Reported by the client. Needs a finding.");
  expect(requests).toContainEqual(
    expect.objectContaining({ path: "/issues", search: "?orderId=order1" }),
  );
  const section = problemSection();
  expect(within(section).getByText("Every flyer has a smudge across the logo.")).toBeVisible();
  // Empty groups read "Not recorded"; recorded ones show their facts.
  expect(within(within(section).getByTestId("evidence-approvals")).getByText("Not recorded")).toBeVisible();
  expect(within(within(section).getByTestId("evidence-rider_check")).getByText("Not recorded")).toBeVisible();
  expect(within(section).getByText("Keep the logo crisp.")).toBeVisible();
  // The finished-work photo is listed; the artwork's pre-flight result shows.
  expect(within(section).getByText("Automatic file check: passed")).toBeVisible();
  // The client's photo is read through GET /files/:fileId.
  await waitFor(() =>
    expect(requests).toContainEqual(expect.objectContaining({ path: "/files/file_problem" })),
  );
});

it("records a finding with the case version, cited evidence and the amounts in centavos", async () => {
  const user = userEvent.setup();
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await screen.findByText("Reported by the client. Needs a finding.");
  await user.click(within(problemSection()).getByRole("button", { name: "Record a finding" }));

  const dialog = await screen.findByRole("dialog", { name: "Record a finding" });
  expect(within(dialog).getByText("Written Operations rules")).toBeVisible();
  fireEvent.click(within(dialog).getByRole("radio", { name: "The shop" }));
  fireEvent.click(within(dialog).getByRole("radio", { name: "Partial refund" }));
  await user.type(within(dialog).getByLabelText("Finding"), "The shop's photo shows the smudge.");
  await user.type(
    within(dialog).getByLabelText("Why a reprint or replacement does not fit"),
    "The event was yesterday.",
  );
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /Shop's finished-work photos/ }));
  await user.type(within(dialog).getByLabelText("Total remedy cost (₱)"), "1500");
  await user.type(within(dialog).getByLabelText("GRIDGO pays (₱)"), "1000");
  // Exactly ₱1,000 is Operations' to approve: no Super Admin line.
  expect(within(dialog).queryByText(/waits for Super Admin/)).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Save the finding" }));

  await waitFor(() =>
    expect(requests.find((r) => r.path === "/issues/iss_1/decision")?.body).toEqual({
      expectedVersion: 1,
      fault: "shop",
      remedy: "partial_refund",
      reason: "The shop's photo shows the smudge.",
      evidenceIds: ["shop_qa"],
      alternativesReason: "The event was yesterday.",
      costMinor: 150000,
      gridgoCostMinor: 100000,
    }),
  );
  expect(await screen.findByText("The shop at fault, partial refund. Ready to resolve.")).toBeVisible();
}, 15_000);

it("tells Operations a finding above ₱1,000 of GRIDGO funding waits for Super Admin, and holds Resolve", async () => {
  issues = [report({ version: 2, faultDecision: pendingDecision, faultDecisionHistory: [pendingDecision] })];
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await screen.findByText(/Waiting for Super Admin\.$/);
  const section = problemSection();
  expect(within(section).getByRole("button", { name: "Resolve" })).toBeDisabled();
  expect(within(section).queryByRole("button", { name: /Approve/ })).toBeNull();
  expect(within(section).getAllByText("₱1,500.00", { selector: "dd" })[0]).toBeVisible();
  // Who recorded it, by name.
  expect(await within(section).findByText(/^Operations One,/)).toBeVisible();
});

it("lets Super Admin approve the pending finding with the case version", async () => {
  const user = userEvent.setup();
  issues = [report({ version: 2, faultDecision: pendingDecision, faultDecisionHistory: [pendingDecision] })];
  render(<OrderWorkspace queueHref="/admin/orders" />);
  await screen.findByText(/Waiting for Super Admin\.$/);
  await user.click(within(problemSection()).getByRole("button", { name: "Approve GRIDGO’s share" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.type(within(dialog).getByLabelText("Why you approve it"), "Approved advance.");
  await user.click(within(dialog).getByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(requests.find((r) => r.path === "/issues/iss_1/approve-decision")?.body).toEqual({
      expectedVersion: 2,
      decisionId: "idecision_1",
      reason: "Approved advance.",
    }),
  );
  expect(await screen.findByText(/Ready to resolve\.$/)).toBeVisible();
  // The earlier pending snapshot stays in the history.
  expect(screen.getByText(/Earlier findings and approvals \(1\)/)).toBeInTheDocument();
});

it("resolves with the case version and re-reads a stale case in plain words", async () => {
  const user = userEvent.setup();
  const approved = { ...pendingDecision, status: "approved" as const };
  issues = [report({ version: 3, faultDecision: approved, faultDecisionHistory: [approved] })];
  refuseNext = { status: 409, body: { error: "issue_stale", currentVersion: 4 } };
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await screen.findByText(/Ready to resolve\.$/);

  await user.click(within(problemSection()).getByRole("button", { name: "Resolve" }));
  let dialog = await screen.findByRole("alertdialog");
  await user.type(within(dialog).getByLabelText("What was done"), "Refunded in full.");
  await user.click(within(dialog).getByRole("button", { name: "Resolve" }));
  expect(await within(dialog).findByText(/Someone changed this problem report/)).toBeVisible();
  const reads = requests.filter((r) => r.path === "/issues").length;
  expect(reads).toBeGreaterThan(1);

  await user.click(within(dialog).getByRole("button", { name: "Resolve" }));
  await waitFor(() =>
    expect(requests.filter((r) => r.path === "/issues/iss_1/resolve").at(-1)?.body).toEqual({
      resolution: "Refunded in full.",
      reason: "Refunded in full.",
      status: "resolved",
      releasePayout: false,
      expectedVersion: 3,
    }),
  );
  dialog = screen.queryByRole("alertdialog")!;
  expect(await screen.findByText("Problem report resolved.")).toBeVisible();
});

it("keeps a revision being typed when the case is read again while the dialog is open", async () => {
  const user = userEvent.setup();
  const approved = { ...pendingDecision, status: "approved" as const };
  const onSave = vi.fn();
  const props = { open: true, superAdmin: false, busy: false, error: null, onCancel: () => {}, onSave };
  const { rerender } = render(
    <DecisionDialog {...props} issue={report({ version: 3, faultDecision: approved })} />,
  );
  const dialog = await screen.findByRole("dialog", { name: "Revise the finding" });
  fireEvent.click(within(dialog).getByRole("radio", { name: "The rider" }));
  const finding = within(dialog).getByLabelText("Finding");
  await user.clear(finding);
  await user.type(finding, "Crushed in the rider's bag.");

  // A refetch hands in an equal case as a new object.
  rerender(<DecisionDialog {...props} issue={structuredClone(report({ version: 3, faultDecision: approved }))} />);
  expect(within(dialog).getByLabelText("Finding")).toHaveValue("Crushed in the rider's bag.");
  expect(within(dialog).getByRole("radio", { name: "The rider" })).toBeChecked();
  await user.click(within(dialog).getByRole("button", { name: "Save the revised finding" }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ fault: "rider", reason: "Crushed in the rider's bag." }),
  );
}, 15_000);

it("shows no problem row on an order without a report", async () => {
  issues = [];
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await screen.findByText(/All six checks passed/);
  expect(screen.queryByRole("heading", { name: /Problem report/, level: 2 })).toBeNull();
});
