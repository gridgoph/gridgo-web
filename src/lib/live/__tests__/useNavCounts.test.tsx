// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

import type { InvalidatePing } from "@/lib/api/types";
import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";
import { NavCountsProvider, useNavCounts } from "@/lib/live/useNavCounts";

const { listIssueReports, listSupportChatThreads } = vi.hoisted(() => ({
  listIssueReports: vi.fn(),
  listSupportChatThreads: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  getTracker: vi.fn(),
  listApprovalCases: vi.fn(),
  listClaims: vi.fn(),
  listEscalations: vi.fn(),
  listIssueReports,
  listJobs: vi.fn(),
  listOrders: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("@/lib/api/support-chat", () => ({
  listSupportChatThreads,
}));

afterEach(() => cleanup());

function Badges() {
  const counts = useNavCounts();
  return (
    <div>
      <span>{`chat ${counts["chat-unread"] ?? ""}`}</span>
      <span>{`reports ${counts["issue-reports-new"] ?? ""}`}</span>
    </div>
  );
}

describe("nav badges", () => {
  it("refreshes chat and issue-report counts when those resources change", async () => {
    listSupportChatThreads.mockResolvedValue([{ unreadCount: 2 }, { unreadCount: 1 }]);
    listIssueReports.mockResolvedValue({ counts: { new: 4 } });
    const listeners = new Set<(ping: InvalidatePing) => void>();
    const live: LiveContextValue = {
      notifications: [],
      unreadCount: 0,
      snapshot: null,
      live: true,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      markRead: async () => undefined,
      markAllRead: async () => undefined,
      remove: async () => undefined,
      refreshInbox: async () => undefined,
    };

    render(
      <LiveContext.Provider value={live}>
        <NavCountsProvider sources={["chat-unread", "issue-reports-new"]} pathname="/ops/overview">
          <Badges />
        </NavCountsProvider>
      </LiveContext.Provider>,
    );

    expect(await screen.findByText("chat 3")).toBeInTheDocument();
    expect(screen.getByText("reports 4")).toBeInTheDocument();

    listSupportChatThreads.mockResolvedValue([{ unreadCount: 5 }]);
    listIssueReports.mockResolvedValue({ counts: { new: 6 } });
    for (const listener of listeners) {
      listener({ resource: "chat" });
      listener({ resource: "issue-reports" });
    }

    await waitFor(() => {
      expect(screen.getByText("chat 5")).toBeInTheDocument();
      expect(screen.getByText("reports 6")).toBeInTheDocument();
    });
  });
});
