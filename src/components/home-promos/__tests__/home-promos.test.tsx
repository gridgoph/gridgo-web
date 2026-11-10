// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readHomePromo } from "@/lib/api/home-promos";
import { rawHomePromo } from "@/test/home-promos";

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);

const { replace, params } = vi.hoisted(() => ({ replace: vi.fn(), params: { promoId: "new" } }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/ops/home-promos",
  useRouter: () => ({ replace, push: vi.fn() }),
  useParams: () => params,
}));

const api = vi.hoisted(() => ({
  listHomePromos: vi.fn(),
  getHomePromo: vi.fn(),
  createHomePromo: vi.fn(),
  updateHomePromo: vi.fn(),
  removeHomePromo: vi.fn(),
  getHomePromoStats: vi.fn(),
  uploadHomePromoFile: vi.fn(),
}));
vi.mock("@/lib/api/home-promos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/home-promos")>()),
  ...api,
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getFileDownloadUrl: vi.fn().mockResolvedValue("https://files.example/signed.png"),
}));

const { HomePromosDesk } = await import("@/components/home-promos/HomePromosDesk");
const { HomePromoEditor } = await import("@/components/home-promos/HomePromoEditor");
const { PromoPreview } = await import("@/components/home-promos/PromoPreview");
const OpsPage = (await import("@/app/ops/home-promos/page")).default;
const AdminPage = (await import("@/app/admin/home-promos/page")).default;
const OpsEditPage = (await import("@/app/ops/home-promos/[promoId]/page")).default;
const AdminEditPage = (await import("@/app/admin/home-promos/[promoId]/page")).default;

const davaogo = () => readHomePromo(rawHomePromo());
const later = () =>
  readHomePromo(
    rawHomePromo({
      id: "promo_shop",
      name: "Lovis Print",
      tag: "featured_shop",
      status: "scheduled",
      enabled: true,
      startsAt: "2026-12-01T00:00:00.000Z",
      endsAt: "2026-12-31T00:00:00.000Z",
      displayOrder: 2,
      views: 0,
      opens: 0,
      taps: 0,
    }),
  );

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:local");
  URL.revokeObjectURL = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  params.promoId = "new";
});

describe("Home promos list", () => {
  it("shows each promo's status, dates and totals, live first", async () => {
    api.listHomePromos.mockResolvedValue([later(), davaogo()]);
    render(<HomePromosDesk tree="ops" />);
    const table = await screen.findByRole("table", { name: "Home promos" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("DavaoGo")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Live")).toBeInTheDocument();
    expect(within(rows[0]).getByText("From Nov 10")).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText("120 views")).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText("30 sheet opens")).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText("12 link taps")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Scheduled")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Dec 1 to Dec 31")).toBeInTheDocument();
    expect(screen.getByText("New promo").closest("a")).toHaveAttribute("href", "/ops/home-promos/new");
  });

  it("switches a promo off from its row", async () => {
    api.listHomePromos.mockResolvedValue([davaogo()]);
    api.updateHomePromo.mockResolvedValue(readHomePromo(rawHomePromo({ enabled: false, status: "off" })));
    render(<HomePromosDesk tree="admin" />);
    fireEvent.click((await screen.findAllByRole("switch", { name: "DavaoGo on" }))[0]);
    await waitFor(() => expect(api.updateHomePromo).toHaveBeenCalledWith("promo_davaogo", { enabled: false }));
    expect((await screen.findAllByText("Off")).length).toBeGreaterThan(0);
  });

  it("invites the first promo when there are none, and says Home shows Reorder only", async () => {
    api.listHomePromos.mockResolvedValue([]);
    render(<HomePromosDesk tree="ops" />);
    expect(await screen.findByText("No Home promos yet")).toBeInTheDocument();
    expect(screen.getByText("No live promo. Clients see Reorder only.")).toBeInTheDocument();
  });
});

describe("Add and edit", () => {
  it("refuses to save until the required fields are right", async () => {
    api.listHomePromos.mockResolvedValue([]);
    render(<HomePromoEditor tree="ops" promoId="new" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add promo" }));
    expect(await screen.findByText("Enter the business name.")).toBeInTheDocument();
    expect(screen.getByText("Add the logo.")).toBeInTheDocument();
    expect(screen.getByText("Enter a full https:// link.")).toBeInTheDocument();
    expect(api.createHomePromo).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Link"), { target: { value: "http://davaogo.app" } });
    expect(screen.getByText("Enter a full https:// link.")).toBeInTheDocument();
  });

  it("uploads the logo, adds the promo and opens it", async () => {
    api.listHomePromos.mockResolvedValue([]);
    api.uploadHomePromoFile.mockResolvedValue({ fileId: "file_new" });
    api.createHomePromo.mockResolvedValue(readHomePromo(rawHomePromo({ id: "promo_new" })));
    render(<HomePromoEditor tree="admin" promoId="new" />);
    fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "DavaoGo" } });
    fireEvent.change(screen.getByLabelText("Logo", { selector: "input" }), {
      target: { files: [new File(["x"], "logo.png", { type: "image/png" })] },
    });
    await waitFor(() =>
      expect(api.uploadHomePromoFile).toHaveBeenCalledWith("promotion_logo", expect.any(File)),
    );
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Rides around Davao." } });
    fireEvent.change(screen.getByLabelText("Button words"), { target: { value: "Visit DavaoGo" } });
    fireEvent.change(screen.getByLabelText("Link"), { target: { value: "https://davaogo.app/" } });
    fireEvent.click(screen.getByRole("radio", { name: /Open link directly/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Yellow/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add promo" }));
    await waitFor(() => expect(api.createHomePromo).toHaveBeenCalled());
    expect(api.createHomePromo.mock.calls[0][0]).toMatchObject({
      name: "DavaoGo",
      logo: { fileId: "file_new" },
      image: null,
      tag: "partner",
      tapAction: "link",
      style: "yellow",
      linkUrl: "https://davaogo.app/",
      enabled: true,
      displayOrder: 1,
    });
    expect(replace).toHaveBeenCalledWith("/admin/home-promos/promo_new?created=1");
  });

  it("saves only what changed, shows the numbers by day and removes with confirmation", async () => {
    api.listHomePromos.mockResolvedValue([davaogo()]);
    api.getHomePromo.mockResolvedValue(davaogo());
    api.getHomePromoStats.mockResolvedValue([{ day: "2026-11-10", views: 7, opens: 3, taps: 2 }]);
    api.updateHomePromo.mockResolvedValue(readHomePromo(rawHomePromo({ name: "DavaoGO", updatedAt: "2026-11-10T01:00:00Z" })));
    api.removeHomePromo.mockResolvedValue(undefined);
    render(<HomePromoEditor tree="ops" promoId="promo_davaogo" />);

    const save = await screen.findByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "DavaoGO" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateHomePromo).toHaveBeenCalledWith("promo_davaogo", expect.objectContaining({ name: "DavaoGO" })));

    const stats = await screen.findByRole("table", { name: /by day/ });
    await waitFor(() => expect(within(stats).getByText("7")).toBeInTheDocument());
    expect(api.getHomePromoStats).toHaveBeenCalledWith("promo_davaogo", expect.objectContaining({ from: "2026-11-10" }));

    fireEvent.click(screen.getByRole("button", { name: "Remove promo" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.removeHomePromo).toHaveBeenCalledWith("promo_davaogo"));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("/ops/home-promos?removed="));
  });
});

describe("Preview", () => {
  const promo = {
    key: "p1",
    name: "DavaoGo",
    logoUrl: null,
    imageUrl: null,
    description: "Rides around Davao.",
    tag: "partner" as const,
    linkText: "Visit DavaoGo",
    linkUrl: "https://davaogo.app/",
    tapAction: "sheet" as const,
    style: "yellow" as const,
  };

  it("rotates Reorder and the promo every five seconds, with dots", async () => {
    vi.useFakeTimers();
    try {
      render(<PromoPreview promos={[promo]} />);
      const phone = screen.getByRole("group", { name: /Phone preview/ });
      expect(phone).toHaveAccessibleName(/showing Reorder, 1 of 2/);
      expect(screen.getByTestId("preview-dots").children).toHaveLength(2);
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(phone).toHaveAccessibleName(/showing DavaoGo, 2 of 2/);
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(phone).toHaveAccessibleName(/showing Reorder, 1 of 2/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows Reorder alone with no promo", () => {
    render(<PromoPreview promos={[]} />);
    expect(screen.getByRole("group", { name: /showing Reorder, 1 of 1/ })).toBeInTheDocument();
    expect(screen.queryByTestId("preview-dots")).toBeNull();
  });

  it("draws the sheet with the logo, name, tag, description and button", () => {
    render(<PromoPreview promos={[promo]} />);
    fireEvent.click(screen.getByRole("button", { name: "Bottom sheet" }));
    const sheet = screen.getByTestId("preview-sheet");
    expect(within(sheet).getByText("DavaoGo")).toBeInTheDocument();
    expect(within(sheet).getByText("Partner")).toBeInTheDocument();
    expect(within(sheet).getByText("Rides around Davao.")).toBeInTheDocument();
    expect(within(sheet).getByText("Visit DavaoGo")).toBeInTheDocument();
  });
});

describe("Role access", () => {
  it("mounts the same desk for Operations and Super Admin, each linking in its own tree", async () => {
    api.listHomePromos.mockResolvedValue([davaogo()]);
    render(<OpsPage />);
    expect((await screen.findAllByRole("link", { name: /DavaoGo/ }))[0]).toHaveAttribute("href", "/ops/home-promos/promo_davaogo");
    cleanup();
    render(<AdminPage />);
    expect((await screen.findAllByRole("link", { name: /DavaoGo/ }))[0]).toHaveAttribute("href", "/admin/home-promos/promo_davaogo");
  });

  it("opens the editor for both roles", async () => {
    api.listHomePromos.mockResolvedValue([]);
    render(<OpsEditPage />);
    expect(await screen.findByRole("button", { name: "Add promo" })).toBeInTheDocument();
    cleanup();
    render(<AdminEditPage />);
    expect(await screen.findByRole("button", { name: "Add promo" })).toBeInTheDocument();
  });
});
