// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SupportChatDesk } from "@/components/chat/SupportChatDesk";
import { formatDateTime } from "@/lib/format";

vi.stubGlobal("React", React);

const {
  listSupportChatThreads,
  getSupportChatThread,
  replySupportChat,
  openSupportChatStream,
  searchSupportChatPeople,
  openSupportChatThread,
  deleteSupportChatThread,
  chatStream,
} = vi.hoisted(() => ({
  listSupportChatThreads: vi.fn(),
  getSupportChatThread: vi.fn(),
  replySupportChat: vi.fn(),
  openSupportChatStream: vi.fn(),
  searchSupportChatPeople: vi.fn(),
  openSupportChatThread: vi.fn(),
  deleteSupportChatThread: vi.fn(),
  chatStream: { current: null as null | { onEvent: (event: unknown) => void } },
}));

vi.mock("@/lib/api/support-chat", () => ({
  listSupportChatThreads,
  getSupportChatThread,
  replySupportChat,
  openSupportChatStream,
  searchSupportChatPeople,
  openSupportChatThread,
  deleteSupportChatThread,
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
  searchSupportChatPeople.mockReset();
  openSupportChatThread.mockReset();
  deleteSupportChatThread.mockReset();
  deleteSupportChatThread.mockResolvedValue(undefined);
  searchSupportChatPeople.mockResolvedValue([
    {
      userId: "user_client",
      name: "Ana Client",
      email: "ana@gridgo.test",
      role: "client",
    },
    {
      userId: "user_admin",
      name: "Super Desk",
      email: "admin@gridgo.test",
      role: "super_admin",
    },
  ]);
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
        senderImageUrl: "https://img.clerk.com/ana.jpg",
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
    expect(await screen.findByLabelText("Reply as Operations")).toBeTruthy();
    expect((await screen.findAllByLabelText("Ana Client, profile photo")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("The colours look off.")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Inbox pages")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
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

  it("lets staff look someone up and open a conversation", async () => {
    const staffThread = {
      id: "thread-staff",
      partyUserId: "user_admin",
      partyRole: "super_admin" as const,
      partyName: "Super Desk",
      partyEmail: "admin@gridgo.test",
      staffPeerUserId: "user_ops",
      staffPeerName: "Ops Desk",
      viewerUserId: "user_ops",
      unreadCount: 0,
      createdAt: "2026-09-20T03:00:00.000Z",
      updatedAt: "2026-09-20T03:00:00.000Z",
    };
    openSupportChatThread.mockResolvedValue({ thread: staffThread });
    getSupportChatThread.mockImplementation(async (id: string) => {
      if (id === staffThread.id) {
        return { thread: staffThread, messages: [] };
      }
      return {
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
      };
    });
    render(<SupportChatDesk />);
    await screen.findAllByText("Ana Client");
    expect(screen.getByRole("button", { name: "Staff" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(await screen.findByLabelText("Find a person")).toBeTruthy();
    await waitFor(() => expect(searchSupportChatPeople).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: /Super Desk, Admin/ }));
    await waitFor(() => {
      expect(openSupportChatThread).toHaveBeenCalledWith({
        userId: "user_admin",
        role: "super_admin",
      });
    });
    expect(await screen.findByLabelText("Write a message")).toBeTruthy();
  });

  it("pages the new-conversation people list", async () => {
    searchSupportChatPeople.mockResolvedValue(
      Array.from({ length: 9 }, (_, index) => ({
        userId: `user_${index}`,
        name: `Person ${index}`,
        email: `p${index}@gridgo.test`,
        role: "client" as const,
      })),
    );
    render(<SupportChatDesk />);
    await screen.findAllByText("Ana Client");
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(await screen.findByText("Person 0")).toBeTruthy();
    expect(screen.getByLabelText("People pages")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.queryByText("Person 8")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Person 8")).toBeTruthy();
    expect(screen.queryByText("Person 0")).toBeNull();
  });

  it("pages the inbox", async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      ...thread,
      id: `thread-${index}`,
      partyName: `Person ${index}`,
      lastMessagePreview: `Preview ${index}`,
    }));
    listSupportChatThreads.mockResolvedValue(many);
    getSupportChatThread.mockImplementation(async (id: string) => {
      const row = many.find((item) => item.id === id) ?? many[0];
      return { thread: { ...row, unreadCount: 0 }, messages: [] };
    });
    render(<SupportChatDesk />);
    expect(await screen.findByText("Preview 0")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.queryByText("Preview 8")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Preview 8")).toBeTruthy();
    expect(screen.queryByText("Preview 0")).toBeNull();
  });

  it("opens conversation details for search, photos, and delete", async () => {
    render(<SupportChatDesk />);
    await screen.findByLabelText("Reply as Operations");
    fireEvent.click(screen.getByRole("button", { name: "Conversation details" }));
    expect(screen.getByText("Media & files")).toBeTruthy();
    await waitFor(() => {
      expect(getSupportChatThread).toHaveBeenCalledWith(
        "thread-1",
        expect.objectContaining({ media: true }),
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Search in conversation" }));
    expect(await screen.findByLabelText("Search this chat")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search this chat"), {
      target: { value: "colours" },
    });
    await waitFor(() => {
      expect(getSupportChatThread).toHaveBeenCalledWith(
        "thread-1",
        expect.objectContaining({ q: "colours" }),
      );
    });
    const when = formatDateTime("2026-09-20T03:00:00.000Z");
    expect(
      await screen.findByLabelText(`Ana Client, The colours look off., ${when}`),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    expect(await screen.findByText("Are you sure you want to delete this chat?")).toBeTruthy();
    const confirm = screen.getAllByRole("button", { name: "Delete chat" }).at(-1);
    fireEvent.click(confirm!);
    await waitFor(() => {
      expect(deleteSupportChatThread).toHaveBeenCalledWith("thread-1");
    });
  });
});
