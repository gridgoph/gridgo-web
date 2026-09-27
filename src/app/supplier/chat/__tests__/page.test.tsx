// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SupplierChatPage from "@/app/supplier/chat/page";
import { ApiError } from "@/lib/api/client";
import type { SupportChatEvent } from "@/lib/api/types";

vi.stubGlobal("React", React);

const {
  getSupportChatMe,
  getSupportChatThread,
  openSupportChatThread,
  sendSupportChatMessage,
  markSupportChatRead,
  streamHandlers,
} = vi.hoisted(() => ({
  getSupportChatMe: vi.fn(),
  getSupportChatThread: vi.fn(),
  openSupportChatThread: vi.fn(),
  sendSupportChatMessage: vi.fn(),
  markSupportChatRead: vi.fn(),
  streamHandlers: {
    current: null as null | { onEvent: (event: SupportChatEvent) => void },
  },
}));

vi.mock("@/lib/api/support-chat-party", () => ({
  getSupportChatMe,
  getSupportChatThread,
  openSupportChatThread,
  sendSupportChatMessage,
  markSupportChatRead,
}));

vi.mock("@/lib/api/support-chat", () => ({
  openSupportChatStream: (handlers: { onEvent: (event: SupportChatEvent) => void }) => {
    streamHandlers.current = handlers;
    return { close: vi.fn() };
  },
}));

const thread = {
  id: "thread-1",
  partyUserId: "shop",
  partyRole: "supplier" as const,
  partyName: "North Press",
  lastMessageAt: "2026-09-21T03:00:00.000Z",
  lastMessagePreview: "Where is the payout?",
  lastMessageSenderRole: "supplier" as const,
  unreadCount: 1,
  createdAt: "2026-09-21T03:00:00.000Z",
  updatedAt: "2026-09-21T03:00:00.000Z",
};

const shopMessage = {
  id: "m1",
  threadId: thread.id,
  senderUserId: "shop",
  senderRole: "supplier" as const,
  senderName: "North Press",
  body: "Where is the payout?",
  createdAt: "2026-09-21T03:00:00.000Z",
  mine: true,
};

afterEach(() => {
  cleanup();
  streamHandlers.current = null;
});

beforeEach(() => {
  getSupportChatMe.mockReset();
  getSupportChatThread.mockReset();
  openSupportChatThread.mockReset();
  sendSupportChatMessage.mockReset();
  markSupportChatRead.mockReset();
  getSupportChatMe.mockResolvedValue({
    thread,
    threads: [thread],
    messages: [],
    unreadCount: 1,
  });
  getSupportChatThread.mockResolvedValue({
    thread: { ...thread, unreadCount: 0 },
    messages: [shopMessage],
  });
  markSupportChatRead.mockResolvedValue({
    thread: { ...thread, unreadCount: 0 },
    unreadCount: 0,
  });
});

describe("supplier chat", () => {
  it("lists this shop's Operations conversations and a New chat control", async () => {
    render(<SupplierChatPage />);
    expect(await screen.findByText("Your conversations")).toBeTruthy();
    expect(screen.getByText("Where is the payout?")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "New chat" }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Message Operations")).toBeNull();
  });

  it("opens a thread, marks it read, and shows the composer", async () => {
    render(<SupplierChatPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Operations, Where is the payout?" }),
    );
    expect(screen.getByLabelText("Message Operations")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText("Where is the payout?")).toHaveLength(2);
    });
    await waitFor(() => {
      expect(getSupportChatThread).toHaveBeenCalledWith("thread-1");
      expect(markSupportChatRead).toHaveBeenCalledWith("thread-1");
    });
  });

  it("starts a new chat and lands in that conversation", async () => {
    getSupportChatMe.mockResolvedValue({
      thread: null,
      threads: [],
      messages: [],
      unreadCount: 0,
    });
    const draft = {
      ...thread,
      id: "thread-new",
      lastMessageAt: null,
      lastMessagePreview: null,
      unreadCount: 0,
    };
    openSupportChatThread.mockResolvedValue({ thread: draft });
    getSupportChatThread.mockResolvedValue({ thread: draft, messages: [] });
    render(<SupplierChatPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: "New chat" }))[0]!);
    await waitFor(() => {
      expect(openSupportChatThread).toHaveBeenCalled();
    });
    expect(await screen.findByLabelText("Message Operations")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "No messages yet" })).toBeTruthy();
  });

  it("sends into the open conversation", async () => {
    sendSupportChatMessage.mockResolvedValue({
      thread: { ...thread, unreadCount: 0, lastMessagePreview: "Send the receipt." },
      message: {
        id: "m2",
        threadId: thread.id,
        senderUserId: "shop",
        senderRole: "supplier",
        body: "Send the receipt.",
        createdAt: "2026-09-21T03:01:00.000Z",
        mine: true,
      },
    });
    render(<SupplierChatPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Operations, Where is the payout?" }),
    );
    const composer = await screen.findByLabelText("Message Operations");
    fireEvent.change(composer, { target: { value: "Send the receipt." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(sendSupportChatMessage).toHaveBeenCalledWith(
        "Send the receipt.",
        "thread-1",
      );
      expect(screen.getAllByText("Send the receipt.").length).toBeGreaterThan(0);
    });
  });

  it("shows an empty history", async () => {
    getSupportChatMe.mockResolvedValue({
      thread: null,
      threads: [],
      messages: [],
      unreadCount: 0,
    });
    render(<SupplierChatPage />);
    expect(await screen.findByText("No conversations yet")).toBeTruthy();
    expect(
      screen.getByText(
        "Start a chat with Operations. It stays here so you can come back to it.",
      ),
    ).toBeTruthy();
  });

  it("shows an error and retries the inbox", async () => {
    getSupportChatMe.mockRejectedValueOnce(new ApiError(500, { error: "unavailable" }));
    render(<SupplierChatPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Could not open Operations/,
    );
    getSupportChatMe.mockResolvedValue({
      thread: null,
      threads: [],
      messages: [],
      unreadCount: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No conversations yet")).toBeTruthy();
  });

  it("keeps the draft and shows an error when sending fails", async () => {
    sendSupportChatMessage.mockRejectedValue(new ApiError(500, { error: "unavailable" }));
    render(<SupplierChatPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Operations, Where is the payout?" }),
    );
    const composer = await screen.findByLabelText("Message Operations");
    fireEvent.change(composer, { target: { value: "Still waiting." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Could not send that message/,
    );
    expect(composer).toHaveValue("Still waiting.");
  });

  it("disables the composer while a message is sending", async () => {
    let resolveSend: (value: unknown) => void = () => {};
    sendSupportChatMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );
    render(<SupplierChatPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Operations, Where is the payout?" }),
    );
    const composer = await screen.findByLabelText("Message Operations");
    fireEvent.change(composer, { target: { value: "On my way." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const sending = await screen.findByRole("button", { name: "Sending…" });
    expect(sending).toBeDisabled();
    expect(composer).toBeDisabled();
    resolveSend({
      thread,
      message: {
        id: "m3",
        threadId: thread.id,
        senderUserId: "shop",
        senderRole: "supplier",
        body: "On my way.",
        createdAt: "2026-09-21T03:02:00.000Z",
        mine: true,
      },
    });
    expect(await screen.findByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("appends a live Operations reply and marks it read", async () => {
    render(<SupplierChatPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Operations, Where is the payout?" }),
    );
    await screen.findByLabelText("Message Operations");
    await waitFor(() => expect(markSupportChatRead).toHaveBeenCalled());
    markSupportChatRead.mockClear();
    streamHandlers.current?.onEvent({
      type: "message",
      thread: { ...thread, lastMessagePreview: "Sent this morning.", unreadCount: 1 },
      message: {
        id: "m-ops",
        threadId: thread.id,
        senderUserId: "ops",
        senderRole: "ops_admin",
        senderName: "Desk Agent",
        body: "Sent this morning.",
        createdAt: "2026-09-21T04:00:00.000Z",
        mine: false,
      },
    });
    expect(await screen.findByText("Sent this morning.")).toBeTruthy();
    expect(screen.getByText(/Operations ·/)).toBeTruthy();
    expect(screen.queryByText("Desk Agent")).toBeNull();
    await waitFor(() => expect(markSupportChatRead).toHaveBeenCalledWith("thread-1"));
  });
});
