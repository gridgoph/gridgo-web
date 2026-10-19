// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chatOpenWith, SupportChatDesk } from "@/components/chat/SupportChatDesk";
import * as apiClient from "@/lib/api/client";
import { formatDate, formatDateTime } from "@/lib/format";

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
  vi.spyOn(apiClient, "getFileDownloadUrl").mockResolvedValue("https://files.test/photo.jpg");
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
  it("opens the rider's thread when arriving from a Message link, once", async () => {
    const riderThread = {
      ...thread,
      id: "thread-rider",
      partyUserId: "rider1",
      partyRole: "rider" as const,
      partyName: "Ramon Rider",
    };
    openSupportChatThread.mockResolvedValue({ thread: riderThread });
    const openWith = chatOpenWith(new URLSearchParams("with=rider1&role=rider"));
    expect(openWith).toEqual({ userId: "rider1", role: "rider" });
    const view = render(<SupportChatDesk openWith={openWith} />);
    await waitFor(() =>
      expect(openSupportChatThread).toHaveBeenCalledWith({ userId: "rider1", role: "rider" }),
    );
    await waitFor(() => expect(getSupportChatThread).toHaveBeenCalledWith("thread-rider"));
    view.rerender(<SupportChatDesk openWith={{ userId: "rider1", role: "rider" }} />);
    expect(openSupportChatThread).toHaveBeenCalledTimes(1);
  });

  it("ignores a link without a person or with a staff role", () => {
    expect(chatOpenWith(new URLSearchParams(""))).toBeNull();
    expect(chatOpenWith(new URLSearchParams("with=u1&role=super_admin"))).toBeNull();
    expect(chatOpenWith(new URLSearchParams("role=rider"))).toBeNull();
  });

  it("lists threads and opens the conversation", async () => {
    render(<SupportChatDesk />);
    expect((await screen.findAllByText("Ana Client")).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText("Reply as Operations")).toBeTruthy();
    expect((await screen.findAllByLabelText("Ana Client, profile photo")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("The colours look off.")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Inbox pages")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    expect(screen.queryByText(/Find a client, shop, rider/)).toBeNull();
    expect(screen.getAllByTestId("inbox-avatar").length).toBeGreaterThan(0);
    const search = screen.getByLabelText("Search conversations");
    const filters = screen.getByRole("group", { name: "Filter conversations by role" });
    expect(search.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filters.parentElement).toHaveClass("overflow-x-auto", "[scrollbar-width:thin]");
    expect(filters.parentElement).not.toHaveClass("[scrollbar-width:none]");
    expect(filters).toHaveClass("flex-nowrap");
  });

  it("opens the conversation over the inbox on a narrow screen", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      render(<SupportChatDesk />);
      const row = await screen.findByRole("listitem");
      expect(screen.queryByRole("button", { name: "Back to inbox" })).toBeNull();
      fireEvent.click(row);
      expect(await screen.findByRole("button", { name: "Back to inbox" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Back to inbox" }));
      expect(screen.queryByRole("button", { name: "Back to inbox" })).toBeNull();
    } finally {
      window.matchMedia = original;
    }
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
    expect(screen.getByText("To:")).toBeTruthy();
    expect(screen.getByText("Your contacts")).toBeTruthy();
    expect(screen.getByLabelText("Search conversations")).toBeTruthy();
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
    fireEvent.click(within(screen.getByLabelText("People pages")).getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Person 8")).toBeTruthy();
    expect(screen.queryByText("Person 0")).toBeNull();
    fireEvent.change(within(screen.getByLabelText("People pages")).getByRole("combobox", { name: "People per page" }), {
      target: { value: "16" },
    });
    expect(screen.getByText("Person 0")).toBeTruthy();
    expect(screen.getByText("Person 8")).toBeTruthy();
    expect(within(screen.getByLabelText("People pages")).getByText("Page 1 of 1")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Conversations per page" })).toHaveValue("8");
    fireEvent.change(screen.getByRole("combobox", { name: "Conversations per page" }), {
      target: { value: "24" },
    });
    expect(
      within(screen.getByLabelText("People pages")).getByRole("combobox", { name: "People per page" }),
    ).toHaveValue("16");
  });

  it("pages the inbox", async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      ...thread,
      id: `thread-${index}`,
      partyUserId: `user_person_${index}`,
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

  it("shows every loaded conversation when the page holds 16", async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      ...thread,
      id: `thread-${index}`,
      partyUserId: `user_person_${index}`,
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
    expect(screen.queryByText("Preview 8")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Conversations per page" }), {
      target: { value: "16" },
    });
    expect(screen.getByText("Preview 8")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    expect(listSupportChatThreads).toHaveBeenCalledWith({ role: undefined, q: "" });
    expect(listSupportChatThreads).not.toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: expect.anything() }),
    );
  });

  it("returns to the first page when a larger page size leaves the current page empty", async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      ...thread,
      id: `thread-${index}`,
      partyUserId: `user_person_${index}`,
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
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Preview 8")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Conversations per page" }), {
      target: { value: "16" },
    });
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    expect(screen.getByText("Preview 0")).toBeTruthy();
    expect(screen.getByText("Preview 8")).toBeTruthy();
  });

  it("stays on a page that still exists after choosing a smaller size", async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      ...thread,
      id: `thread-${index}`,
      partyUserId: `user_person_${index}`,
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
    fireEvent.change(screen.getByRole("combobox", { name: "Conversations per page" }), {
      target: { value: "24" },
    });
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.queryByText("Preview 24")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Preview 24")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Conversations per page" }), {
      target: { value: "8" },
    });
    expect(screen.getByText("Page 2 of 4")).toBeTruthy();
    expect(screen.getByText("Preview 8")).toBeTruthy();
    expect(screen.queryByText("Preview 0")).toBeNull();
    expect(screen.queryByText("Preview 24")).toBeNull();
  });

  it("shows one conversation per person and merges their threads without duplicates", async () => {
    const older = {
      ...thread,
      id: "thread-older",
      lastMessageAt: "2026-09-19T03:00:00.000Z",
      lastMessagePreview: "Older chat",
      unreadCount: 2,
    };
    const other = {
      ...thread,
      id: "thread-other",
      partyUserId: "user_other",
      partyName: "Ben Client",
      lastMessagePreview: "Hello",
      unreadCount: 0,
    };
    listSupportChatThreads.mockResolvedValue([thread, other, older]);
    const message = (id: string, threadId: string, body: string, createdAt: string) => ({
      id,
      threadId,
      senderUserId: "user_client",
      senderRole: "client",
      senderName: "Ana Client",
      body,
      createdAt,
      mine: false,
    });
    // The desk opens the first conversation on its own, and reading its threads
    // clears their unread counts. Hold those reads until the inbox count is checked.
    let releaseReads!: () => void;
    const readsHeld = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    getSupportChatThread.mockImplementation(async (id: string) => {
      await readsHeld;
      if (id === "thread-older") {
        return {
          thread: { ...older, unreadCount: 0 },
          messages: [message("m0", "thread-older", "First question", "2026-09-19T03:00:00.000Z")],
        };
      }
      if (id === "thread-other") return { thread: other, messages: [] };
      return {
        thread: { ...thread, unreadCount: 0 },
        messages: [message("m1", "thread-1", "Second question", "2026-09-20T03:00:00.000Z")],
      };
    });
    replySupportChat.mockResolvedValue({
      thread: { ...thread, lastMessagePreview: "On it", unreadCount: 0 },
      message: {
        id: "m2",
        threadId: "thread-1",
        senderUserId: "ops1",
        senderRole: "ops_admin",
        senderName: "Ops",
        body: "On it",
        createdAt: "2026-09-20T04:00:00.000Z",
        mine: true,
      },
    });

    render(<SupportChatDesk />);
    const list = await screen.findByRole("list", { name: "Conversations" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(2));
    expect(within(list).getAllByText("Ana Client")).toHaveLength(1);
    expect(within(list).getByText("3")).toBeTruthy();

    releaseReads();
    expect(await screen.findByText("First question")).toBeTruthy();
    expect(screen.getAllByText("Second question").length).toBeGreaterThan(0);
    const first = screen.getByText("First question");
    const second = screen.getAllByText("Second question").at(-1)!;
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Reply as Operations"), { target: { value: "On it" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(replySupportChat).toHaveBeenCalledWith("thread-1", "On it"));
    expect((await screen.findAllByText("On it")).length).toBeGreaterThan(0);

    // The stream echoes the same reply: it must not show twice.
    act(() => {
      chatStream.current?.onEvent({
        type: "message",
        thread: { ...thread, lastMessagePreview: "On it", unreadCount: 0 },
        message: {
          id: "m2",
          threadId: "thread-1",
          senderUserId: "ops1",
          senderRole: "ops_admin",
          senderName: "Ops",
          body: "On it",
          createdAt: "2026-09-20T04:00:00.000Z",
          mine: true,
        },
      });
    });
    const transcript = screen.getByText("First question").closest("div.overflow-y-auto")!;
    expect(within(transcript as HTMLElement).getAllByText("On it")).toHaveLength(1);
    expect(transcript.contains(screen.getByRole("button", { name: "Send" }))).toBe(false);
    expect(transcript.contains(screen.getByLabelText("Reply as Operations"))).toBe(false);
    expect(
      screen.getAllByRole("heading", { name: "Ana Client" }).every((name) => !transcript.contains(name)),
    ).toBe(true);
    expect(transcript.closest("section")).not.toHaveClass("min-h-[28rem]");
    expect(transcript.closest(".grid")).toHaveClass("min-h-0", "flex-1");
    expect(transcript.closest(".grid")).not.toHaveClass("min-h-[36rem]");
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(2));
  });

  it("deletes every thread of a merged conversation", async () => {
    const older = { ...thread, id: "thread-older", lastMessageAt: "2026-09-19T03:00:00.000Z" };
    listSupportChatThreads.mockResolvedValue([thread, older]);
    render(<SupportChatDesk />);
    await screen.findByLabelText("Reply as Operations");
    fireEvent.click(screen.getByRole("button", { name: "Conversation details" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    expect(await screen.findByText("Are you sure you want to delete this chat?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete chat" }).at(-1)!);
    await waitFor(() => expect(deleteSupportChatThread).toHaveBeenCalledTimes(2));
    expect(deleteSupportChatThread).toHaveBeenCalledWith("thread-1");
    expect(deleteSupportChatThread).toHaveBeenCalledWith("thread-older");
    expect(await screen.findByText("No conversations yet")).toBeTruthy();
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

  it("places the incoming bubble on the left and the outgoing bubble on the right", async () => {
    getSupportChatThread.mockResolvedValue({
      thread: { ...thread, unreadCount: 0 },
      messages: [
        deskLine({ id: "in", body: "The colours look off.", createdAt: "2026-09-20T03:00:00.000Z" }),
        deskLine({
          id: "out",
          body: "Send a daylight photo.",
          mine: true,
          createdAt: "2026-09-20T03:05:00.000Z",
        }),
      ],
    });
    render(<SupportChatDesk />);
    const runs = await screen.findAllByTestId("chat-run");
    expect(runs).toHaveLength(2);
    expect(runs[0]).toHaveAttribute("data-side", "incoming");
    expect(runs[0]).toHaveClass("justify-start");
    expect(runs[0]).toHaveTextContent("The colours look off.");
    expect(runs[1]).toHaveAttribute("data-side", "outgoing");
    expect(runs[1]).toHaveClass("justify-end");
    expect(within(runs[1]!).getByTestId("chat-bubble")).toHaveClass("bg-[var(--color-action-yellow)]");
    expect(runs[1]).toHaveTextContent("Send a daylight photo.");
    expect(within(runs[1]!).queryByTestId("chat-avatar")).toBeNull();
  });

  it("shows one avatar and one time for two incoming messages in a row", async () => {
    getSupportChatThread.mockResolvedValue({
      thread: { ...thread, unreadCount: 0 },
      messages: [
        deskLine({
          id: "a",
          body: "The colours look off.",
          createdAt: "2026-09-20T03:00:00.000Z",
          senderImageUrl: "https://img.clerk.com/ana.jpg",
        }),
        deskLine({
          id: "b",
          body: "Can you reprint it?",
          createdAt: "2026-09-20T03:05:00.000Z",
          senderImageUrl: "https://img.clerk.com/ana.jpg",
        }),
      ],
    });
    render(<SupportChatDesk />);
    const run = await screen.findByTestId("chat-run");
    expect(run).toHaveAttribute("data-side", "incoming");
    expect(within(run).getAllByTestId("chat-avatar")).toHaveLength(1);
    expect(within(run).getAllByTestId("chat-run-time")).toHaveLength(1);
    expect(within(run).getAllByTestId("chat-bubble")).toHaveLength(2);
    expect(within(run).getByText("The colours look off.")).toBeTruthy();
    expect(within(run).getByText("Can you reprint it?")).toBeTruthy();
  });

  it("renders a photo in the bubble", async () => {
    getSupportChatThread.mockResolvedValue({
      thread: { ...thread, unreadCount: 0 },
      messages: [
        deskLine({
          id: "photo",
          body: "",
          createdAt: "2026-09-20T03:00:00.000Z",
          attachments: [{ fileId: "file_photo", originalFilename: "proof.jpg" }],
        }),
      ],
    });
    render(<SupportChatDesk />);
    const run = await screen.findByTestId("chat-run");
    const photo = await within(run).findByRole("img", { name: "proof.jpg" });
    fireEvent.click(photo);
    const preview = await screen.findByRole("img", { name: "proof.jpg preview" });
    expect(preview).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("150%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("img", { name: "proof.jpg preview" })).toBeNull();
  });

  it("shows a date chip when a new day starts", async () => {
    const today = new Date();
    today.setHours(15, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    getSupportChatThread.mockResolvedValue({
      thread: { ...thread, unreadCount: 0 },
      messages: [
        deskLine({ id: "y", body: "Noted yesterday.", createdAt: yesterday.toISOString() }),
        deskLine({
          id: "t",
          body: "Noted today.",
          mine: true,
          createdAt: today.toISOString(),
        }),
      ],
    });
    render(<SupportChatDesk />);
    const chips = await screen.findAllByTestId("chat-day");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      formatDate(yesterday.toISOString()),
      "Today",
    ]);
  });

  it("shows a teammate's reply when it is the conversation's latest message", async () => {
    const answered = {
      ...thread,
      lastMessageAt: "2026-09-20T05:12:00.000Z",
      lastMessagePreview: "Thank you, we'll take a look into this.",
      lastMessageSenderRole: "ops_admin" as const,
      unreadCount: 0,
    };
    listSupportChatThreads.mockResolvedValue([answered]);
    getSupportChatThread.mockResolvedValue({
      thread: answered,
      messages: [
        deskLine({ id: "ask", body: "The colours look off.", createdAt: "2026-09-20T04:44:00.000Z" }),
        {
          ...deskLine({
            id: "teammate",
            body: "Thank you, we'll take a look into this.",
            createdAt: "2026-09-20T05:12:00.000Z",
          }),
          senderUserId: "user_teammate",
          senderRole: "ops_admin" as const,
          senderName: "Rina Ops",
          senderImageUrl: "https://img.clerk.com/rina.jpg",
        },
      ],
    });
    render(<SupportChatDesk />);
    const runs = await screen.findAllByTestId("chat-run");
    expect(runs).toHaveLength(2);
    expect(runs[0]).toHaveAttribute("data-side", "incoming");
    expect(runs[0]).toHaveTextContent("The colours look off.");
    expect(runs[1]).toHaveAttribute("data-side", "outgoing");
    expect(runs[1]).toHaveTextContent("Rina Ops");
    expect(runs[1]).not.toHaveTextContent("You");
    expect(runs[1]).toHaveTextContent("Thank you, we'll take a look into this.");
    expect(within(runs[1]!).getByTestId("chat-bubble")).not.toHaveClass(
      "bg-[var(--color-action-yellow)]",
    );
    fireEvent.click(screen.getByRole("button", { name: "Conversation details" }));
    expect(screen.getByText("Media & files")).toBeTruthy();
    expect(screen.queryByLabelText("Ana Client, profile photo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search in conversation" }));
    fireEvent.change(await screen.findByLabelText("Search this chat"), {
      target: { value: "look" },
    });
    const when = formatDateTime("2026-09-20T05:12:00.000Z");
    expect(
      await screen.findByLabelText(`Rina Ops, Thank you, we'll take a look into this., ${when}`),
    ).toBeTruthy();
  });
});

function deskLine({
  id,
  body = "",
  mine = false,
  createdAt,
  senderImageUrl,
  attachments,
}: {
  id: string;
  body?: string;
  mine?: boolean;
  createdAt: string;
  senderImageUrl?: string;
  attachments?: { fileId: string; originalFilename?: string }[];
}) {
  return {
    id,
    threadId: thread.id,
    senderUserId: mine ? "user_ops" : "user_client",
    senderRole: mine ? ("ops_admin" as const) : ("client" as const),
    senderName: mine ? "Ops" : "Ana Client",
    senderImageUrl,
    body,
    createdAt,
    mine,
    attachments,
  };
}
