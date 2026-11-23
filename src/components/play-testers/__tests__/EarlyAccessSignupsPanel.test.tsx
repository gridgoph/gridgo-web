// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EarlyAccessSignup } from "@/lib/api/early-access";

const { api } = vi.hoisted(() => ({
  api: {
    listEarlyAccessSignups: vi.fn(),
    grantEarlyAccess: vi.fn(),
  },
}));

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/api/early-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/early-access")>(
    "@/lib/api/early-access",
  );
  return { ...actual, ...api };
});

import { EarlyAccessSignupsPanel } from "@/components/play-testers/EarlyAccessSignupsPanel";

describe("EarlyAccessSignupsPanel", () => {
  const mockSignups: EarlyAccessSignup[] = [
    {
      id: "ea-1",
      email: "pending@gmail.com",
      source: "booth",
      app: "client",
      status: "pending",
      createdAt: "2026-11-17T10:00:00Z",
      grantedAt: null,
    },
    {
      id: "ea-2",
      email: "granted@gmail.com",
      source: "web",
      app: "client",
      status: "granted",
      createdAt: "2026-11-17T09:00:00Z",
      grantedAt: "2026-11-17T09:15:00Z",
    },
  ];

  beforeEach(() => {
    api.listEarlyAccessSignups.mockResolvedValue({
      ok: true,
      total: 2,
      signups: mockSignups,
    });
    api.grantEarlyAccess.mockResolvedValue({
      ok: true,
      signup: {
        ...mockSignups[0],
        status: "granted",
        grantedAt: "2026-11-17T11:00:00Z",
      },
      optInUrl: "https://play.google.com/apps/testing/com.gridgo.client",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders sign-ups and summary stats", async () => {
    render(<EarlyAccessSignupsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Website Early-Access Sign-ups")).toBeInTheDocument();
      expect(screen.getAllByText("pending@gmail.com").length).toBeGreaterThan(0);
      expect(screen.getAllByText("granted@gmail.com").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("Total Requests")).toBeInTheDocument();
    expect(screen.getByText("Pending Approval")).toBeInTheDocument();
    expect(screen.getByText("Access Granted")).toBeInTheDocument();
  });

  it("opens confirmation dialog and grants early access", async () => {
    render(<EarlyAccessSignupsPanel />);

    await waitFor(() => {
      expect(screen.getAllByText("pending@gmail.com").length).toBeGreaterThan(0);
    });

    // Find and click the Grant access button for the pending row
    const grantButtons = screen.getAllByRole("button", { name: /grant access/i });
    expect(grantButtons.length).toBeGreaterThan(0);
    fireEvent.click(grantButtons[0]);

    // Dialog should open
    expect(
      screen.getByText(/Grant Google Play early access to pending@gmail.com/i),
    ).toBeInTheDocument();

    // Confirm grant
    const confirmButton = screen.getByRole("button", { name: /grant & send email/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.grantEarlyAccess).toHaveBeenCalledWith("ea-1");
      expect(
        screen.getByText(/Access granted for pending@gmail.com/i),
      ).toBeInTheDocument();
    });
  });
});
