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
const { getFileDownloadUrl } = vi.hoisted(() => ({ getFileDownloadUrl: vi.fn() }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getFileDownloadUrl,
}));

const { HomePromosDesk } = await import("@/components/home-promos/HomePromosDesk");
const { HomePromoEditor } = await import("@/components/home-promos/HomePromoEditor");
const { PromoPreview } = await import("@/components/home-promos/PromoPreview");
const { PromoStats } = await import("@/components/home-promos/PromoStats");
const { useFileUrls } = await import("@/components/home-promos/useFileUrls");
const { ApiError } = await import("@/lib/api/client");
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
  getFileDownloadUrl.mockResolvedValue("https://files.example/signed.png");
  URL.createObjectURL = vi.fn(() => "blob:local");
  URL.revokeObjectURL = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  params.promoId = "new";
});

describe("Home promos list", () => {
  it("shows each promo's status, dates and totals, live first", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T04:00:00Z"));
    api.listHomePromos.mockResolvedValue([later(), davaogo()]);
    render(<HomePromosDesk tree="ops" />);
    const table = await screen.findByRole("table", { name: "Home promos" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("DavaoGo")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Live")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/^From Nov 10, 8:00/)).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText("120 views")).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText("30 sheet opens")).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText("12 link taps")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Scheduled")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/^to Dec 31, 8:00/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Yellow" }));
    fireEvent.click(screen.getByRole("button", { name: "Add promo" }));
    await waitFor(() => expect(api.createHomePromo).toHaveBeenCalled());
    expect(api.createHomePromo.mock.calls[0][0]).toMatchObject({
      name: "DavaoGo",
      logo: { fileId: "file_new" },
      image: null,
      tag: "partner",
      tapAction: "link",
      color: "#FFDE58",
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
    await waitFor(() => expect(api.updateHomePromo).toHaveBeenCalledWith("promo_davaogo", { name: "DavaoGO" }));

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
    cardImageUrl: null,
    imageUrl: null,
    description: "Rides around Davao.",
    tag: "partner" as const,
    linkText: "Visit DavaoGo",
    linkUrl: "https://davaogo.app/",
    tapAction: "sheet" as const,
    color: "#FFDE58",
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

describe("Card colour", () => {
  async function newPromo(tree: "ops" | "admin") {
    api.listHomePromos.mockResolvedValue([]);
    render(<HomePromoEditor tree={tree} promoId="new" />);
    return screen.findByLabelText("Card colour");
  }

  it("suggests White, the GRIDGO accent and Yellow, White first by default", async () => {
    const hex = await newPromo("ops");
    expect(hex).toHaveValue("#FFFFFF");
    const group = screen.getByRole("group", { name: "Suggested colours" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["White", "GRIDGO accent", "Yellow"]);
    expect(within(group).getByRole("button", { name: "White" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(group).getByRole("button", { name: "GRIDGO accent" }));
    expect(hex).toHaveValue("#1A1A1A");
    expect(within(group).getByRole("button", { name: "GRIDGO accent" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "White" })).toHaveAttribute("aria-pressed", "false");
  });

  it("takes any colour from the picker, and no swatch stays pressed", async () => {
    const hex = await newPromo("admin");
    fireEvent.input(screen.getByLabelText("Pick any colour"), { target: { value: "#3366cc" } });
    expect(hex).toHaveValue("#3366CC");
    const group = screen.getByRole("group", { name: "Suggested colours" });
    for (const button of within(group).getAllByRole("button")) expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("preview-promo-tile")).toHaveStyle({ backgroundColor: "#3366CC" });
  });

  it("tidies a typed code and refuses one that is not a colour", async () => {
    const hex = await newPromo("ops");
    fireEvent.change(hex, { target: { value: "ff8800" } });
    fireEvent.blur(hex);
    expect(hex).toHaveValue("#FF8800");
    expect(screen.queryByText("Use a colour like #1A1A1A.")).toBeNull();

    fireEvent.focus(hex);
    fireEvent.change(hex, { target: { value: "#12" } });
    expect(screen.queryByText("Use a colour like #1A1A1A.")).toBeNull();
    // Half typed: the card keeps the colour it had.
    expect(screen.getByTestId("preview-promo-tile")).toHaveStyle({ backgroundColor: "#FFFFFF" });
    fireEvent.blur(hex);
    expect(screen.getByText("Use a colour like #1A1A1A.")).toBeInTheDocument();
    expect(hex).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Add promo" }));
    expect(api.createHomePromo).not.toHaveBeenCalled();
  });

  it.each([
    ["#FFFFFF", "#1A1A1A"],
    ["#FFDE58", "#1A1A1A"],
    ["#1A1A1A", "#FFFFFF"],
    ["#3366CC", "#FFFFFF"],
    ["#808080", "#1A1A1A"],
  ])("draws a %s card with %s text in the preview", async (color, ink) => {
    const hex = await newPromo("ops");
    fireEvent.change(screen.getByLabelText("Button words"), { target: { value: "See their offer" } });
    fireEvent.change(hex, { target: { value: color } });
    const tile = screen.getByTestId("preview-promo-tile");
    expect(tile).toHaveAttribute("data-ink", ink);
    expect(tile).toHaveStyle({ backgroundColor: color, color: ink });
    expect(within(tile).getByTestId("preview-promo-link")).toHaveTextContent("See their offer");
  });

  it.each(["ops", "admin"] as const)("saves a changed colour with its fallback style (%s)", async (tree) => {
    api.listHomePromos.mockResolvedValue([davaogo()]);
    api.getHomePromo.mockResolvedValue(davaogo());
    api.updateHomePromo.mockResolvedValue(readHomePromo(rawHomePromo({ color: "#3366CC" })));
    render(<HomePromoEditor tree={tree} promoId="promo_davaogo" />);
    const hex = await screen.findByLabelText("Card colour");
    fireEvent.change(hex, { target: { value: "#3366cc" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(api.updateHomePromo).toHaveBeenCalledWith("promo_davaogo", { color: "#3366CC", style: "light" }),
    );
  });

  it("shows a saved promo's colour, and an older promo's style as its colour", async () => {
    api.listHomePromos.mockResolvedValue([]);
    api.getHomePromo.mockResolvedValue(readHomePromo(rawHomePromo({ color: "#0a7d4f", style: "light" })));
    render(<HomePromoEditor tree="admin" promoId="promo_davaogo" />);
    expect(await screen.findByLabelText("Card colour")).toHaveValue("#0A7D4F");
    cleanup();
    api.getHomePromo.mockResolvedValue(readHomePromo(rawHomePromo({ style: "yellow" })));
    render(<HomePromoEditor tree="ops" promoId="promo_davaogo" />);
    expect(await screen.findByLabelText("Card colour")).toHaveValue("#FFDE58");
  });
});

describe("Card hairline after a theme switch", () => {
  afterEach(() => {
    document.documentElement.classList.remove("light", "dark");
    vi.restoreAllMocks();
  });

  it("re-reads the screen once the new theme settles, so a black card on Dark gets its outline", async () => {
    // The browser answers the mutation itself with the old theme's screen.
    let screenColor = "rgb(248, 248, 248)";
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
      const style = real(el, pseudo);
      if ((el as HTMLElement).getAttribute?.("role") !== "group") return style;
      return new Proxy(style, { get: (target, key) => (key === "backgroundColor" ? screenColor : Reflect.get(target, key)) });
    });
    document.documentElement.classList.add("light");
    render(
      <PromoPreview
        promos={[{ key: "p1", name: "DavaoGo", logoUrl: null, cardImageUrl: null, imageUrl: null, description: "", tag: "partner", linkText: "Visit", linkUrl: "https://davaogo.app/", tapAction: "sheet", color: "#000000" }]}
      />,
    );
    const tile = screen.getByTestId("preview-promo-tile");
    // Black on the light screen: no hairline, the card's own edge.
    await waitFor(() => expect(tile.style.borderColor).toBe("rgb(0, 0, 0)"));

    act(() => {
      document.documentElement.classList.replace("light", "dark");
      setTimeout(() => {
        screenColor = "rgb(0, 0, 0)";
      }, 0);
    });
    await waitFor(() => expect(tile.style.borderColor).toBe("var(--color-outline)"));
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

describe("Saving an edit while someone else changes the promo", () => {
  it("sends only the changed field, so a switch turned off elsewhere stays off", async () => {
    const start = readHomePromo(rawHomePromo({ startsAt: "2026-11-10T00:00:30.000Z" }));
    api.listHomePromos.mockResolvedValue([start]);
    api.getHomePromo.mockResolvedValue(start);
    render(<HomePromoEditor tree="ops" promoId="promo_davaogo" />);
    fireEvent.change(await screen.findByLabelText("Description"), { target: { value: "New line." } });

    // Another tab switches it off; this tab regains focus and re-reads.
    const off = readHomePromo(rawHomePromo({ startsAt: "2026-11-10T00:00:30.000Z", enabled: false, status: "off" }));
    api.getHomePromo.mockResolvedValue(off);
    api.listHomePromos.mockResolvedValue([off]);
    fireEvent.focus(window);
    expect(await screen.findByText(/Someone changed this promo since you opened it/)).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue("New line.");

    api.updateHomePromo.mockResolvedValue(
      readHomePromo(rawHomePromo({ enabled: false, status: "off", description: "New line." })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateHomePromo).toHaveBeenCalledTimes(1));
    expect(api.updateHomePromo.mock.calls[0]).toEqual(["promo_davaogo", { description: "New line." }]);
    // The saved promo is now the truth: off.
    expect(await screen.findByRole("switch", { name: "Off" })).not.toBeChecked();
  });

  it("takes a fresh read when nothing is being edited", async () => {
    api.listHomePromos.mockResolvedValue([davaogo()]);
    api.getHomePromo.mockResolvedValue(davaogo());
    render(<HomePromoEditor tree="admin" promoId="promo_davaogo" />);
    await screen.findByRole("switch", { name: "On" });
    api.getHomePromo.mockResolvedValue(readHomePromo(rawHomePromo({ enabled: false, status: "off" })));
    fireEvent.focus(window);
    expect(await screen.findByRole("switch", { name: "Off" })).toBeInTheDocument();
    expect(screen.queryByText(/Someone changed this promo/)).toBeNull();
  });
});

describe("By day", () => {
  const promo = () => readHomePromo(rawHomePromo({ startsAt: "2026-11-09T00:00:00.000Z" }));

  async function loaded() {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T04:00:00Z"));
    api.getHomePromoStats.mockResolvedValueOnce([{ day: "2026-11-10", views: 1, opens: 1, taps: 1 }]);
    render(<PromoStats promo={promo()} />);
    await screen.findByRole("table", { name: /by day/ });
    expect(screen.getByRole("button", { name: "CSV" })).toBeEnabled();
  }

  it("shows no figures and no CSV while a new range is loading", async () => {
    await loaded();
    api.getHomePromoStats.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-01" } });
    await waitFor(() => expect(api.getHomePromoStats).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "CSV" })).toBeDisabled();
    expect(screen.queryByRole("table", { name: /by day/ })).toBeNull();
    expect(screen.queryByText("Views")).toBeNull();
  });

  it("refuses more than 366 days before asking, with a specific message", async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2024-01-01" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick 366 days or fewer.");
    expect(screen.getByRole("button", { name: "CSV" })).toBeDisabled();
    expect(api.getHomePromoStats).toHaveBeenCalledTimes(1);
  });

  it("keeps CSV off when the new range fails, and names a rejected range", async () => {
    await loaded();
    api.getHomePromoStats.mockRejectedValueOnce(new ApiError(400, { error: "invalid_promotion_stats_range" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-02" } });
    expect(await screen.findByText(/Pick a range of 366 days or fewer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CSV" })).toBeDisabled();
    expect(screen.queryByRole("table", { name: /by day/ })).toBeNull();
  });
  it("does not reuse a range's old numbers when returning to it while it reloads or fails", async () => {
    await loaded();
    const from = screen.getByLabelText("From");
    api.getHomePromoStats.mockResolvedValueOnce([{ day: "2026-11-10", views: 5, opens: 0, taps: 0 }]);
    fireEvent.change(from, { target: { value: "2026-11-08" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "CSV" })).toBeEnabled());

    // Back to the first range: its earlier rows must not show while it reloads.
    let finish!: (rows: unknown[]) => void;
    api.getHomePromoStats.mockReturnValueOnce(new Promise((done) => (finish = done)));
    fireEvent.change(from, { target: { value: "2026-11-09" } });
    await waitFor(() => expect(api.getHomePromoStats).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("button", { name: "CSV" })).toBeDisabled();
    expect(screen.queryByText("Views")).toBeNull();
    expect(screen.queryByRole("table", { name: /by day/ })).toBeNull();
    await act(async () => finish([{ day: "2026-11-10", views: 9, opens: 0, taps: 0 }]));
    const table = await screen.findByRole("table", { name: /by day/ });
    expect(within(table).getByText("9")).toBeInTheDocument();

    // Away and back again, and this time the reload fails.
    api.getHomePromoStats.mockResolvedValueOnce([{ day: "2026-11-10", views: 5, opens: 0, taps: 0 }]);
    fireEvent.change(from, { target: { value: "2026-11-08" } });
    await waitFor(() => expect(api.getHomePromoStats).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.getByRole("button", { name: "CSV" })).toBeEnabled());
    api.getHomePromoStats.mockRejectedValueOnce(new ApiError(503, { error: "unavailable" }));
    fireEvent.change(from, { target: { value: "2026-11-09" } });
    expect(await screen.findByText("Could not load the numbers.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CSV" })).toBeDisabled();
    expect(screen.queryByText("Views")).toBeNull();
    expect(screen.queryByRole("table", { name: /by day/ })).toBeNull();
  });
});

describe("On Home now follows the clock", () => {
  it("moves a promo from Scheduled to Live to Ended while the page stays open", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-11-10T01:59:00Z"));
    api.listHomePromos.mockResolvedValue([
      readHomePromo(
        rawHomePromo({ status: "scheduled", startsAt: "2026-11-10T02:00:00.000Z", endsAt: "2026-11-10T02:30:00.000Z" }),
      ),
    ]);
    render(<HomePromosDesk tree="ops" />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    const row = () => screen.getAllByRole("row").find((r) => within(r).queryByText("DavaoGo"))!;
    expect(within(row()).getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("No live promo. Clients see Reorder only.")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(within(row()).getByText("Live")).toBeInTheDocument();
    expect(screen.queryByText("No live promo. Clients see Reorder only.")).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(30 * 60_000));
    expect(within(row()).getByText("Ended")).toBeInTheDocument();
    expect(screen.getByText("No live promo. Clients see Reorder only.")).toBeInTheDocument();
  });
});

describe("Signed media links", () => {
  function Probe({ file }: { file: { fileId: string; url: string | null; expiresAt?: string | null } }) {
    const urls = useFileUrls([file]);
    return <span data-testid="url">{urls[file.fileId] ?? "none"}</span>;
  }

  it("uses the API's link while it is fresh and renews it once it nears expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-11-10T04:00:00Z"));
    render(
      <Probe file={{ fileId: "f1", url: "https://files.example/own.png", expiresAt: "2026-11-10T04:05:00.000Z" }} />,
    );
    expect(screen.getByTestId("url")).toHaveTextContent("own.png");
    expect(getFileDownloadUrl).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(getFileDownloadUrl).toHaveBeenCalledWith("f1");
    expect(screen.getByTestId("url")).toHaveTextContent("signed.png");
  });
});

describe("Three pictures (gridgo-client#425)", () => {
  const cardFile = {
    fileId: "file_card",
    contentType: "image/jpeg",
    downloadUrl: "https://files.example/card.jpg",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  const coverFile = {
    fileId: "file_cover",
    contentType: "image/png",
    downloadUrl: "https://files.example/cover.png",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  const withPictures = () => readHomePromo(rawHomePromo({ cardImage: cardFile, image: coverFile, color: "#FFDE58" }));

  /** jsdom never loads pictures: give the slot's image a pixel size and fire its load. */
  function loadAs(img: HTMLElement, width: number, height: number) {
    Object.defineProperty(img, "naturalWidth", { configurable: true, value: width });
    Object.defineProperty(img, "naturalHeight", { configurable: true, value: height });
    fireEvent.load(img);
  }

  it("labels the logo, card image and cover with where each shows and the size to upload", async () => {
    api.listHomePromos.mockResolvedValue([]);
    render(<HomePromoEditor tree="ops" promoId="new" />);
    const logo = await screen.findByTestId("picture-logo");
    expect(logo).toHaveTextContent("Required");
    expect(logo).toHaveTextContent("512 × 512 px, square");
    expect(logo).toHaveTextContent("up to 5 MB");
    const card = screen.getByTestId("picture-cardImage");
    expect(card).toHaveTextContent("Optional");
    expect(card).toHaveTextContent("1200 × 900 px (4:3)");
    expect(card).toHaveTextContent("Without one, the card is its colour.");
    const cover = screen.getByTestId("picture-image");
    expect(cover).toHaveTextContent("1600 × 900 px (16:9)");
    expect(cover).toHaveTextContent("Never on the Home card.");
    expect(screen.getByLabelText("Card image", { selector: "input" })).toHaveAccessibleDescription(/1200 × 900 px/);
    // The logo is required: no Remove.
    expect(within(logo).queryByRole("button", { name: /Remove/ })).toBeNull();
  });

  it("uploads each picture with its own purpose and adds the promo with all three", async () => {
    api.listHomePromos.mockResolvedValue([]);
    api.uploadHomePromoFile.mockImplementation(async (purpose: string) => ({ fileId: `file_${purpose}` }));
    api.createHomePromo.mockResolvedValue(readHomePromo(rawHomePromo({ id: "promo_new" })));
    render(<HomePromoEditor tree="ops" promoId="new" />);
    const png = (name: string) => ({ target: { files: [new File(["x"], name, { type: "image/png" })] } });
    fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "Lovis Print" } });
    fireEvent.change(screen.getByLabelText("Logo", { selector: "input" }), png("logo.png"));
    await waitFor(() => expect(api.uploadHomePromoFile).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Card image", { selector: "input" }), png("card.png"));
    await waitFor(() => expect(api.uploadHomePromoFile).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("Cover image", { selector: "input" }), png("cover.png"));
    await waitFor(() => expect(api.uploadHomePromoFile).toHaveBeenCalledTimes(3));
    expect(api.uploadHomePromoFile.mock.calls.map((c) => c[0])).toEqual([
      "promotion_logo",
      "promotion_card_image",
      "promotion_image",
    ]);
    fireEvent.change(screen.getByLabelText("Button words"), { target: { value: "See the offer" } });
    fireEvent.change(screen.getByLabelText("Link"), { target: { value: "https://lovis.example/" } });
    fireEvent.click(screen.getByRole("button", { name: "Add promo" }));
    await waitFor(() => expect(api.createHomePromo).toHaveBeenCalled());
    expect(api.createHomePromo.mock.calls[0][0]).toMatchObject({
      logo: { fileId: "file_promotion_logo" },
      cardImage: { fileId: "file_promotion_card_image" },
      image: { fileId: "file_promotion_image" },
    });
  });

  it("draws the card image on the card under a scrim in white ink, and the cover only in the sheet", async () => {
    api.listHomePromos.mockResolvedValue([]);
    api.getHomePromo.mockResolvedValue(withPictures());
    render(<HomePromoEditor tree="admin" promoId="promo_davaogo" />);
    const tile = await screen.findByTestId("preview-promo-tile");
    await waitFor(() => expect(within(tile).getByTestId("preview-card-image")).toHaveAttribute("src", "https://files.example/card.jpg"));
    expect(within(tile).getByTestId("preview-card-scrim")).toBeInTheDocument();
    expect(tile).toHaveAttribute("data-ink", "#FFFFFF");
    // The colour stays behind the picture while it loads.
    expect(tile).toHaveStyle({ backgroundColor: "#FFDE58" });
    expect(within(tile).queryByRole("img")).toBeNull();
    expect(tile.innerHTML).not.toContain("cover.png");

    fireEvent.click(screen.getByRole("button", { name: "Bottom sheet" }));
    const sheet = screen.getByTestId("preview-sheet");
    expect(within(sheet).getByTestId("preview-sheet-cover")).toHaveAttribute("src", "https://files.example/cover.png");
    expect(within(sheet).getByTestId("preview-sheet-cover")).toHaveClass("aspect-video", "object-contain");
    expect(sheet.innerHTML).not.toContain("card.jpg");
  });

  it("goes back to the colour card when the card image is removed, and saves the clear as null", async () => {
    api.listHomePromos.mockResolvedValue([]);
    api.getHomePromo.mockResolvedValue(withPictures());
    api.updateHomePromo.mockResolvedValue(readHomePromo(rawHomePromo({ image: coverFile, color: "#FFDE58" })));
    render(<HomePromoEditor tree="ops" promoId="promo_davaogo" />);
    const card = await screen.findByTestId("picture-cardImage");
    fireEvent.click(within(card).getByRole("button", { name: "Remove card image" }));
    const tile = screen.getByTestId("preview-promo-tile");
    expect(within(tile).queryByTestId("preview-card-image")).toBeNull();
    expect(tile).toHaveAttribute("data-ink", "#1A1A1A");
    expect(within(card).getByRole("button", { name: "Upload card image" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateHomePromo).toHaveBeenCalledWith("promo_davaogo", { cardImage: null }));
  });

  it("clears the cover alone, keeping the card image", async () => {
    api.listHomePromos.mockResolvedValue([]);
    api.getHomePromo.mockResolvedValue(withPictures());
    api.updateHomePromo.mockResolvedValue(readHomePromo(rawHomePromo({ cardImage: cardFile })));
    render(<HomePromoEditor tree="admin" promoId="promo_davaogo" />);
    const cover = await screen.findByTestId("picture-image");
    fireEvent.click(within(cover).getByRole("button", { name: "Remove cover image" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateHomePromo).toHaveBeenCalledWith("promo_davaogo", { image: null }));
  });

  it("replaces the card image with a new upload and patches only it", async () => {
    api.listHomePromos.mockResolvedValue([]);
    api.getHomePromo.mockResolvedValue(withPictures());
    api.uploadHomePromoFile.mockResolvedValue({ fileId: "file_card2" });
    api.updateHomePromo.mockResolvedValue(withPictures());
    render(<HomePromoEditor tree="ops" promoId="promo_davaogo" />);
    const card = await screen.findByTestId("picture-cardImage");
    expect(within(card).getByRole("button", { name: "Replace card image" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Card image", { selector: "input" }), {
      target: { files: [new File(["x"], "card2.webp", { type: "image/webp" })] },
    });
    await waitFor(() => expect(api.uploadHomePromoFile).toHaveBeenCalledWith("promotion_card_image", expect.any(File)));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(api.updateHomePromo).toHaveBeenCalledWith("promo_davaogo", { cardImage: { fileId: "file_card2" } }),
    );
  });

  it("previews each crop: the logo whole on a white disc, the card's part of the picture, the cover at 16:9", async () => {
    api.listHomePromos.mockResolvedValue([]);
    api.getHomePromo.mockResolvedValue(withPictures());
    render(<HomePromoEditor tree="ops" promoId="promo_davaogo" />);
    const logo = await screen.findByTestId("picture-logo-frame");
    const disc = within(logo).getByTestId("promo-logo-disc");
    expect(disc).toHaveClass("rounded-pill", "bg-white");
    expect(within(disc).getByTestId("promo-logo-image")).toHaveClass("object-contain");

    const cardFrame = screen.getByTestId("picture-cardImage-frame");
    // A wide 1800 × 600 picture: the card keeps the middle, so the bright window is centred and narrower.
    loadAs(within(cardFrame).getByTestId("picture-cardImage-preview"), 1800, 600);
    const crop = within(cardFrame).getByTestId("picture-cardImage-crop");
    expect(crop.style.top).toBe("0%");
    expect(parseFloat(crop.style.left)).toBeGreaterThan(25);
    expect(parseFloat(crop.style.left) * 2 + parseFloat(crop.style.width)).toBeCloseTo(100);
    expect(cardFrame.style.aspectRatio).toBe("1800 / 600");

    const coverFrame = screen.getByTestId("picture-image-frame");
    expect(coverFrame).toHaveClass("aspect-video");
    expect(within(coverFrame).getByTestId("picture-image-preview")).toHaveClass("object-contain");
  });

  it("warns, without blocking, about a small or odd-shaped upload", async () => {
    api.listHomePromos.mockResolvedValue([]);
    api.getHomePromo.mockResolvedValue(withPictures());
    api.updateHomePromo.mockResolvedValue(withPictures());
    render(<HomePromoEditor tree="ops" promoId="promo_davaogo" />);
    const cardFrame = await screen.findByTestId("picture-cardImage-frame");
    loadAs(within(cardFrame).getByTestId("picture-cardImage-preview"), 1800, 600);
    expect(await screen.findByTestId("picture-cardImage-note")).toHaveTextContent(
      "much wider than 4:3, so the card trims its sides. You can still save it.",
    );
    loadAs(within(screen.getByTestId("picture-logo-frame")).getByTestId("promo-logo-image"), 120, 120);
    expect(await screen.findByTestId("picture-logo-note")).toHaveTextContent("120 × 120 px, much smaller than 512 × 512");
    loadAs(within(screen.getByTestId("picture-image-frame")).getByTestId("picture-image-preview"), 1600, 900);
    expect(screen.queryByTestId("picture-image-note")).toBeNull();
    expect(screen.getByLabelText("Card image", { selector: "input" })).toHaveAccessibleDescription(/trims its sides/);

    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "DavaoGO" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateHomePromo).toHaveBeenCalledWith("promo_davaogo", { name: "DavaoGO" }));
  });

  it("names the upload that failed, in that slot", async () => {
    api.listHomePromos.mockResolvedValue([]);
    api.uploadHomePromoFile.mockRejectedValue(new ApiError(413, { error: "file_too_large", maxMiB: 15 }));
    render(<HomePromoEditor tree="ops" promoId="new" />);
    fireEvent.change(await screen.findByLabelText("Card image", { selector: "input" }), {
      target: { files: [new File(["x"], "big.png", { type: "image/png" })] },
    });
    const card = screen.getByTestId("picture-cardImage");
    expect(await within(card).findByText(/This card image is larger than 15 MB/)).toBeInTheDocument();
    expect(within(screen.getByTestId("picture-image")).queryByText(/larger than/)).toBeNull();
  });

  it("says plainly when the server does not take card images yet", async () => {
    api.listHomePromos.mockResolvedValue([]);
    api.getHomePromo.mockResolvedValue(davaogo());
    api.uploadHomePromoFile.mockResolvedValue({ fileId: "file_card" });
    api.updateHomePromo.mockRejectedValue(new ApiError(400, { error: "invalid_promotion", field: "body" }));
    render(<HomePromoEditor tree="ops" promoId="promo_davaogo" />);
    fireEvent.change(await screen.findByLabelText("Card image", { selector: "input" }), {
      target: { files: [new File(["x"], "card.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/The server does not take card images yet/)).toBeInTheDocument();
  });
});
