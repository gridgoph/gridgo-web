// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SupportChatDesk } from "@/components/chat/SupportChatDesk";

vi.stubGlobal("React", React);

const { listSupportChatThreads, getSupportChatThread, replySupportChat, openSupportChatStream, chatStream } = vi.hoisted(() => ({
  listSupportChatThreads: vi.fn(),
  getSupportChatThread: vi.fn(),
  replySupportChat: vi.fn(),
  openSupportChatStream: vi.fn(),
  chatStream: { current: null as null | { onEvent: (event: unknown) => void } },
}));

vi.mock("@/lib/api/support-chat", () => ({
  listSupportChatThreads,
  getSupportChatThread,
  replySupportChat,
  openSupportChatStream,
}));

const thread = {
  id: "thread-1",
  partyUserId: "user_client",
  partyRole: "client" as const,
  partyName: "Ana Client",
  partyEmail: "ana@gridgo.test",
  lastMessageAt: "2026-09-20T03:00:00.000Z",
  lastMessagePreview: "The colours look off.",
  lastMessageSenderRole: "client" as const,
  unreadCount: 1,
  createdAt: "2026-09-20T03:00:00.000Z",
  updatedAt: "2026-09-20T03:00:00.000Z",
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  listSupportChatThreads.mockReset();
  getSupportChatThread.mockReset();
  replySupportChat.mockReset();
  openSupportChatStream.mockReset();
  chatStream.current = null;
  openSupportChatStream.mockImplementation((handlers: { onEvent: (event: unknown) => void }) => {
    chatStream.current = handlers;
    return {
      close: () => {
        if (chatStream.current === handlers) chatStream.current = null;
      },
    };
  });
  listSupportChatThreads.mockResolvedValue([thread]);
  getSupportChatThread.mockResolvedValue({
    thread: { ...thread, unreadCount: 0 },
    messages: [
      {
        id: "m1",
        threadId: thread.id,
        senderUserId: "user_client",
        senderRole: "client",
        senderName: "Ana Client",
        body: "The colours look off.",
        createdAt: "2026-09-20T03:00:00.000Z",
        mine: false,
      },
    ],
  });
});

describe("SupportChatDesk", () => {
  it("lists threads and opens the conversation", async () => {
    render(<SupportChatDesk />);
    expect((await screen.findAllByText("Ana Client")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("The colours look off.")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Reply as Operations")).toBeTruthy();
  });

  it("sends a reply", async () => {
    replySupportChat.mockResolvedValue({
      thread: { ...thread, unreadCount: 0, lastMessagePreview: "Send a daylight photo." },
      message: {
        id: "m2",
        threadId: thread.id,
        senderUserId: "user_ops",
        senderRole: "ops_admin",
        senderName: "Ops",
        body: "Send a daylight photo.",
        createdAt: "2026-09-20T03:01:00.000Z",
        mine: true,
      },
    });
    render(<SupportChatDesk />);
    await screen.findAllByText("Ana Client");
    fireEvent.change(screen.getByLabelText("Reply as Operations"), {
      target: { value: "Send a daylight photo." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(replySupportChat).toHaveBeenCalledWith("thread-1", "Send a daylight photo.");
    });
  });

  it("shows a party message from the chat stream without reloading the desk", async () => {
    render(<SupportChatDesk />);
    await screen.findAllByText("Ana Client");
    await waitFor(() => expect(chatStream.current).toBeTruthy());
    const calls = listSupportChatThreads.mock.calls.length;
    act(() => {
      chatStream.current?.onEvent({
        thread: { ...thread, lastMessagePreview: "The gate code changed." },
        message: {
          id: "m9",
          threadId: thread.id,
          body: "The gate code changed.",
          senderUserId: "user_client",
          senderRole: "client",
          senderName: "Ana Client",
          createdAt: "2026-09-20T03:02:00.000Z",
          mine: false,
        },
      });
    });
    expect(await screen.findAllByText("The gate code changed.")).toHaveLength(2);
    expect(listSupportChatThreads).toHaveBeenCalledTimes(calls);
  });
});
