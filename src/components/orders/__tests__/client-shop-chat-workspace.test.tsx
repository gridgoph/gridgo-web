// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type {
  ApprovalProofRead,
  ClientShopChatMessage,
  ClientShopChatRead,
  Order,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

const AT = "2026-10-17T04:00:00.000Z";
const REMINDER =
  "Price, specification and deadline changes require a formal change request. Chat messages do not change the order.";

const order: Order = {
  id: "order1",
  clientId: "client1",
  supplierId: "shop1",
  riderId: null,
  state: "production",
  title: "Flyers",
  quantity: 100,
  deadline: null,
  address: "Davao",
  totalMinor: 10000,
  deliveryFeeMinor: 0,
  paymentMethod: "qr_manual",
  paymentStatus: "initial_payment_confirmed",
  promisedDate: null,
  artworkName: null,
  createdAt: AT,
  updatedAt: AT,
  timeline: [],
  clientShopChat: {
    status: "open",
    closesAt: null,
    participants: ["Client", "Print shop", "GRIDGO"],
    reminder: REMINDER,
  },
  approvalProof: {
    requirement: { version: 1, required: true, method: "drawn" },
    records: [
      { id: "apr_1", phase: "checkout", status: "approved", method: "drawn", at: AT, snapshotSha256: "f".repeat(64) },
    ],
    readUrl: "/orders/order1/approval-proof",
    downloadUrl: "/orders/order1/approval-proof/download",
  },
};

const messages: ClientShopChatMessage[] = [
  {
    id: "m1",
    senderLabel: "Print shop",
    body: "Text me at [contact hidden]",
    originalBody: "Text me at 0917 123 4567",
    contactAttempt: true,
    mine: false,
    createdAt: AT,
    attachments: [],
  },
  {
    id: "m2",
    senderLabel: "Client",
    body: "Here is the layout.",
    originalBody: "Here is the layout.",
    contactAttempt: false,
    mine: false,
    createdAt: AT,
    attachments: [
      { fileId: "file_pdf", contentType: "application/pdf", size: 2048, originalFilename: "document.pdf" },
    ],
  },
];

function chatRead(): ClientShopChatRead {
  return {
    chat: {
      status: "open",
      closesAt: null,
      participants: ["Client", "Print shop", "GRIDGO"],
      reminder: REMINDER,
      unread: 2,
      contactAttempts: 3,
      flaggedAt: AT,
      reportCount: 1,
      contactThreshold: 3,
    },
    messages,
    nextAfter: null,
    reports: [
      { id: "r1", messageId: "m1", reporterLabel: "Client", reason: "contact_sharing", createdAt: AT },
    ],
  };
}

const proof: ApprovalProofRead = {
  requirement: { version: 1, required: true, method: "drawn" },
  approvalProofs: [
    {
      id: "apr_1",
      version: 1,
      phase: "checkout",
      status: "approved",
      method: "drawn",
      at: AT,
      account: { id: "client1", name: "Client One", email: null, accountType: "individual" },
      device: { id: "install-1", platform: "android", appVersion: "2.4.8" },
      userAgent: "GRIDGO",
      statement: "I approve this order",
      signatureFileId: "file_sig",
      samplePhotoFileId: null,
      evidence: [],
      sampleRoundAt: null,
      snapshot: {
        orderId: "order1",
        items: [
          {
            id: "line1",
            itemNameSnapshot: "Flyers",
            quantity: 100,
            options: [{ groupNameSnapshot: "Size", optionLabelSnapshot: "A5" }],
            specialInstructions: "Keep the logo top left",
            artworkGuidance: {
              files: [
                {
                  fileId: "file_art",
                  warnings: [
                    { code: "low_resolution", effectiveDpi: 69, minimumDpi: 300, acceptedAt: AT },
                  ],
                },
              ],
            },
          },
        ],
        artwork: [{ fileId: "file_art", originalFilename: "artwork.png", size: 3447, contentSha256: "ab578ada3a7591e1" }],
      },
      snapshotSha256: "f".repeat(64),
    },
  ],
  review: { snapshot: { orderId: "order1" }, snapshotSha256: "f".repeat(64) },
};

let posts: { path: string; body: unknown }[];
let downloads: string[];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  posts = [];
  downloads = [];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://gridgo.test");
      const path = url.pathname;
      if (path.endsWith("/client-shop-chat/messages") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push({ path, body });
        return json(
          {
            chat: chatRead().chat,
            message: {
              id: "m3",
              senderLabel: "GRIDGO",
              body: body.body,
              originalBody: body.body,
              contactAttempt: false,
              mine: true,
              createdAt: "2026-10-17T05:00:00.000Z",
              attachments: [],
            },
          },
          201,
        );
      }
      if (path.endsWith("/client-shop-chat")) return json(chatRead());
      if (path.endsWith("/approval-proof/download")) {
        downloads.push(path);
        return new Response("%PDF-1.4", { headers: { "Content-Type": "application/pdf" } });
      }
      if (path.endsWith("/approval-proof")) return json(proof);
      if (path.endsWith("/download-url")) return json({ url: "https://files.test/signature.png" });
      return json({ order });
    }),
  );
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:proof", revokeObjectURL: () => {} }));
  // jsdom cannot follow the download link the panel clicks.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("reads the conversation with the original text beside the masked text, and posts as GRIDGO", async () => {
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const trigger = await screen.findByRole("button", { name: /Client and shop chat/ });
  expect(trigger).toHaveTextContent("Open");
  await userEvent.click(trigger);

  const thread = await screen.findByTestId("client-shop-chat");
  expect(within(thread).getByText("Text me at [contact hidden]")).toBeInTheDocument();
  expect(within(thread).getByText("Text me at 0917 123 4567")).toBeInTheDocument();
  expect(within(thread).getAllByText("What they typed · only Operations sees this")).toHaveLength(1);
  expect(within(thread).getByText("Contact details hidden")).toBeInTheDocument();
  expect(
    within(thread).getByText(
      `Reported by Client: Sharing contact details · ${formatDateTime(AT)}`,
    ),
  ).toBeInTheDocument();
  expect(within(thread).getByText("Flagged for review")).toBeInTheDocument();
  expect(within(thread).getByText(/1 report · 3 contact attempts \(flag at 3/)).toBeInTheDocument();
  expect(within(thread).getByRole("button", { name: /PDF · 2 KB/ })).toBeInTheDocument();
  expect(within(thread).getByText(REMINDER)).toBeInTheDocument();
  // No names: only the three labels.
  expect(within(thread).queryByText(/shop1|client1/)).not.toBeInTheDocument();
  // Once read, the closed row says so too.
  expect(trigger).toHaveTextContent("Open · 2 messages · Flagged for review");

  await userEvent.type(within(thread).getByLabelText("Write as GRIDGO"), "Please keep it in the app.");
  await userEvent.click(within(thread).getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(posts).toEqual([
      {
        path: "/orders/order1/client-shop-chat/messages",
        body: { body: "Please keep it in the app.", attachmentFileIds: [] },
      },
    ]),
  );
  expect(await within(thread).findByText("Please keep it in the app.")).toBeInTheDocument();
  expect(within(thread).getByText(/GRIDGO \(you\)/)).toBeInTheDocument();
});

it("hides the composer on a closed conversation", async () => {
  const closed = chatRead();
  closed.chat = { ...closed.chat, status: "read_only" };
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://gridgo.test").pathname;
    if (path.endsWith("/client-shop-chat")) return json(closed);
    return json({ order: { ...order, clientShopChat: { ...order.clientShopChat!, status: "read_only" } } });
  });
  render(<OrderWorkspace queueHref="/ops/orders" />);

  await userEvent.click(await screen.findByRole("button", { name: /Client and shop chat/ }));
  const thread = await screen.findByTestId("client-shop-chat");
  expect(within(thread).getByText(/^Closed\. Nobody can write any more/)).toBeInTheDocument();
  expect(within(thread).queryByLabelText("Write as GRIDGO")).not.toBeInTheDocument();
});

it("shows what the client approved, the signature on white, and downloads the PDF", async () => {
  render(<OrderWorkspace queueHref="/admin/overview" />);

  const trigger = await screen.findByRole("button", { name: /Client approval/ });
  expect(trigger).toHaveTextContent(`Drawn signature, ${formatDateTime(AT)}`);
  await userEvent.click(trigger);

  const panel = await screen.findByTestId("approval-proof");
  expect(within(panel).getByText("Required before the order proceeds: a drawn signature.")).toBeInTheDocument();
  expect(within(panel).getByText("Approved by the client")).toBeInTheDocument();
  expect(within(panel).getByText("“I approve this order”")).toBeInTheDocument();
  expect(within(panel).getByText("android · app 2.4.8")).toBeInTheDocument();
  expect(within(panel).getByText("Flyers · Quantity 100")).toBeInTheDocument();
  expect(within(panel).getByText("Size: A5")).toBeInTheDocument();
  expect(within(panel).getByText("Instructions: Keep the logo top left")).toBeInTheDocument();
  expect(within(panel).getByText(/Low resolution: .* Client accepted on/)).toBeInTheDocument();
  expect(within(panel).getByText(/artwork\.png · 3 KB · fingerprint ab578ada3a75/)).toBeInTheDocument();
  const signature = await within(panel).findByRole("img", { name: "Signature" });
  expect(signature).toHaveAttribute("src", "https://files.test/signature.png");
  expect(signature).toHaveClass("bg-white");

  await userEvent.click(within(panel).getByRole("button", { name: /Download proof \(PDF\)/ }));
  await waitFor(() => expect(downloads).toEqual(["/orders/order1/approval-proof/download"]));
});

it("never presents a compatibility record as an approval", async () => {
  const legacy: ApprovalProofRead = {
    ...proof,
    requirement: { version: 1, required: false, method: "one_tap" },
    approvalProofs: [
      {
        ...proof.approvalProofs[0],
        status: "legacy_unrecorded",
        method: null,
        statement: null,
        device: null,
        signatureFileId: null,
      },
    ],
  };
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://gridgo.test").pathname;
    if (path.endsWith("/approval-proof")) return json(legacy);
    return json({
      order: {
        ...order,
        approvalProof: {
          ...order.approvalProof!,
          requirement: legacy.requirement,
          records: [{ ...order.approvalProof!.records[0], status: "legacy_unrecorded", method: null }],
        },
      },
    });
  });
  render(<OrderWorkspace queueHref="/ops/orders" />);

  await userEvent.click(await screen.findByRole("button", { name: /Client approval/ }));
  const panel = await screen.findByTestId("approval-proof");
  expect(within(panel).getByText("No approval collected")).toBeInTheDocument();
  expect(within(panel).queryByText("Approved by the client")).not.toBeInTheDocument();
  expect(within(panel).queryByRole("img", { name: "Signature" })).not.toBeInTheDocument();
  expect(within(panel).getByText("What was ordered")).toBeInTheDocument();
});
