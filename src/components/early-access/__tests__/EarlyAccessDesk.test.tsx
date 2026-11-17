// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EarlyAccessPage, EarlyAccessSignup } from "@/lib/api/early-access";

vi.setConfig({ testTimeout: 30_000 });
vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

const api = vi.hoisted(() => ({ listEarlyAccess: vi.fn(), grantEarlyAccess: vi.fn() }));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
const live = vi.hoisted(() => ({ reload: null as null | (() => Promise<void> | void) }));

vi.mock("@/lib/api/early-access", () => api);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/ops/early-access",
}));
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "staff-1" } }),
}));
vi.mock("@/lib/live/useLiveReload", () => ({
  useLiveReload: (_resource: unknown, load: () => Promise<void>) => {
    live.reload = load;
  },
}));
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));

import { EarlyAccessDesk } from "@/components/early-access/EarlyAccessDesk";

function signup(n: number, over: Partial<EarlyAccessSignup> = {}): EarlyAccessSignup {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    email: `tester${n}@example.com`,
    source: n % 2 ? "booth" : null,
    platform: "android",
    status: "pending",
    createdAt: "2026-11-17T10:00:00.000Z",
    grantedAt: null,
    grantedBy: null,
    ...over,
  };
}

function page(
  rows: EarlyAccessSignup[],
  total: number,
  counts = { pending: total, granted: 0 },
): EarlyAccessPage {
  return { signups: rows, counts, total, limit: 50, offset: 0 };
}

const firstPage = Array.from({ length: 50 }, (_, i) => signup(i + 1));
const secondPage = [signup(51), signup(52)];

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset().mockImplementation((href: string) => {
    nav.params = new URLSearchParams(href.split("?")[1] ?? "");
  });
  api.listEarlyAccess.mockReset();
  api.grantEarlyAccess.mockReset();
  live.reload = null;
});
afterEach(cleanup);

async function openSecondPage() {
  api.listEarlyAccess
    .mockResolvedValueOnce(page(firstPage, 52))
    .mockResolvedValueOnce(page(secondPage, 52));
  const view = render(<EarlyAccessDesk />);
  await screen.findAllByText("tester1@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  await screen.findAllByText("tester52@example.com");
  expect(api.listEarlyAccess).toHaveBeenLastCalledWith({
    status: "pending",
    q: "",
    limit: 50,
    offset: 50,
  });
  return view;
}

describe("EarlyAccessDesk", () => {
  it("shows the counts as the filter and every column", async () => {
    api.listEarlyAccess.mockResolvedValue(
      page(
        [
          signup(1),
          signup(2, {
            status: "granted",
            grantedAt: "2026-11-17T11:00:00.000Z",
            grantedBy: "user_2x",
          }),
        ],
        1,
        {
          pending: 1,
          granted: 1,
        },
      ),
    );
    nav.params = new URLSearchParams("status=all");
    render(<EarlyAccessDesk />);
    await screen.findAllByText("tester1@example.com");
    expect(screen.getByRole("button", { name: "Waiting, 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Granted, 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All, 2" })).toBeInTheDocument();
    expect(screen.getAllByText("booth").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Direct").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Android").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Nov 17, 2026, 7:00\sPM on the support desk/).length,
    ).toBeGreaterThan(0);
    // A granted sign-up has nothing to grant.
    expect(screen.getAllByRole("button", { name: "Grant access" })).toHaveLength(2); // desktop row + mobile card
  });

  it("grants after a confirm that names the email, and keeps every page read", async () => {
    await openSecondPage();
    api.grantEarlyAccess.mockResolvedValue(
      signup(52, {
        status: "granted",
        grantedAt: new Date().toISOString(),
        grantedBy: "staff-1",
      }),
    );
    const before = api.listEarlyAccess.mock.calls.length;

    const rowButtons = screen.getAllByRole("button", { name: "Grant access" });
    // tester52 is the last row on desktop.
    fireEvent.click(rowButtons[51]);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("tester52@example.com")).toBeInTheDocument();
    expect(api.grantEarlyAccess).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Grant access" }));
    await waitFor(() => expect(api.grantEarlyAccess).toHaveBeenCalledWith(signup(52).id));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    // No reload: both pages stay, the row says Granted, the counts moved.
    expect(api.listEarlyAccess.mock.calls.length).toBe(before);
    expect(screen.getAllByText("tester1@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("tester52@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/by you/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Waiting, 51" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Granted, 1" })).toBeInTheDocument();
    expect(
      screen.getByText("Showing 51 of 51, plus 1 granted just now"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();

    // The stream's ping for this grant finds counts that already match.
    api.listEarlyAccess.mockResolvedValueOnce(
      page([signup(1)], 51, { pending: 51, granted: 1 }),
    );
    await act(async () => {
      await live.reload?.();
    });
    expect(screen.queryByText(/since this list loaded/)).not.toBeInTheDocument();
  });

  it("keeps a failed grant open with the reason", async () => {
    api.listEarlyAccess.mockResolvedValue(page([signup(1)], 1));
    api.grantEarlyAccess.mockRejectedValue(new Error("offline"));
    render(<EarlyAccessDesk />);
    await screen.findAllByText("tester1@example.com");
    fireEvent.click(screen.getAllByRole("button", { name: "Grant access" })[0]);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Grant access" }));
    expect(await within(dialog).findByText(/Access was not granted/)).toBeInTheDocument();
  });

  it("drops a stale Show more when the filter changes", async () => {
    let resolveMore: (value: EarlyAccessPage) => void = () => {};
    api.listEarlyAccess
      .mockResolvedValueOnce(page(firstPage, 52))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveMore = resolve)))
      .mockResolvedValueOnce(
        page(
          [signup(90, { status: "granted", grantedAt: "2026-11-17T11:00:00.000Z" })],
          1,
          { pending: 52, granted: 1 },
        ),
      );
    const view = render(<EarlyAccessDesk />);
    await screen.findAllByText("tester1@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));

    fireEvent.click(screen.getByRole("button", { name: "Granted, 0" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/ops/early-access?status=granted", {
      scroll: false,
    });
    view.rerender(<EarlyAccessDesk />);
    await screen.findAllByText("tester90@example.com");
    expect(api.listEarlyAccess).toHaveBeenLastCalledWith({
      status: "granted",
      q: "",
      limit: 50,
    });

    // The Waiting page that was in flight lands after the switch and is dropped.
    await act(async () => resolveMore(page(secondPage, 52)));
    expect(screen.queryByText("tester52@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("tester1@example.com")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("searches by email through the URL and offers to clear an empty result", async () => {
    api.listEarlyAccess
      .mockResolvedValueOnce(page([signup(1)], 1))
      .mockResolvedValueOnce(page([], 0));
    const view = render(<EarlyAccessDesk />);
    await screen.findAllByText("tester1@example.com");
    const box = screen.getByRole("searchbox", { name: "Search sign-ups by email" });
    fireEvent.change(box, { target: { value: "nobody" } });
    fireEvent.submit(box.closest("form")!);
    expect(nav.replace).toHaveBeenLastCalledWith("/ops/early-access?q=nobody", {
      scroll: false,
    });
    view.rerender(<EarlyAccessDesk />);
    expect(await screen.findByText("No sign-ups match this search")).toBeInTheDocument();
    expect(api.listEarlyAccess).toHaveBeenLastCalledWith({
      status: "pending",
      q: "nobody",
      limit: 50,
    });
    const clears = screen.getAllByRole("button", { name: "Clear search" });
    fireEvent.click(clears[clears.length - 1]);
    expect(nav.replace).toHaveBeenLastCalledWith("/ops/early-access", { scroll: false });
  });

  it("offers a refresh when sign-ups change elsewhere, without moving rows", async () => {
    api.listEarlyAccess
      .mockResolvedValueOnce(page([signup(1)], 1))
      .mockResolvedValueOnce(page([signup(2)], 2, { pending: 2, granted: 0 }))
      .mockResolvedValueOnce(page([signup(2), signup(1)], 2));
    render(<EarlyAccessDesk />);
    await screen.findAllByText("tester1@example.com");
    await act(async () => {
      await live.reload?.();
    });
    expect(screen.getByText("1 new sign-up since this list loaded.")).toBeInTheDocument();
    expect(screen.queryByText("tester2@example.com")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));
    await screen.findAllByText("tester2@example.com");
    expect(screen.queryByText(/since this list loaded/)).not.toBeInTheDocument();
  });

  it("shows a recoverable error when the list cannot load", async () => {
    api.listEarlyAccess
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page([signup(1)], 1));
    render(<EarlyAccessDesk />);
    expect(await screen.findByText("Could not load sign-ups")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findAllByText("tester1@example.com");
  });
});
