import { describe, expect, it } from "vitest";

import { readHomePromo } from "@/lib/api/home-promos";
import {
  draftStatus,
  emptyHomePromoDraft,
  fillDays,
  inputFromHomePromoDraft,
  isHttpsUrl,
  nextDisplayOrder,
  presentHomePromoStatus,
  rate,
  rotationOrder,
  sortHomePromos,
  statsRange,
  validateHomePromoDraft,
  type HomePromoDraft,
} from "@/lib/home-promos";
import { rawHomePromo } from "@/test/home-promos";

const NOW = Date.parse("2026-11-10T04:00:00Z"); // 12:00 Manila

function filled(extra: Partial<HomePromoDraft> = {}): HomePromoDraft {
  return {
    ...emptyHomePromoDraft(NOW),
    name: "DavaoGo",
    logo: { fileId: "file_logo", url: null },
    description: "Rides and deliveries around Davao.",
    linkText: "Visit DavaoGo",
    linkUrl: "https://davaogo.app/",
    ...extra,
  };
}

describe("isHttpsUrl", () => {
  it("takes a full https address", () => {
    expect(isHttpsUrl("https://davaogo.app/")).toBe(true);
    expect(isHttpsUrl(" https://davaogo.app/promo?x=1 ")).toBe(true);
  });
  it("refuses http, bare hosts, other schemes, spaces and credentials", () => {
    for (const bad of [
      "http://davaogo.app",
      "davaogo.app",
      "https://",
      "https://localhost",
      "javascript:alert(1)",
      "https://davao go.app",
      "https://user:pw@davaogo.app",
    ]) {
      expect(isHttpsUrl(bad), bad).toBe(false);
    }
  });
});

describe("validateHomePromoDraft", () => {
  it("passes a complete draft", () => {
    expect(validateHomePromoDraft(filled())).toEqual({});
  });

  it("names every missing required field", () => {
    const errors = validateHomePromoDraft(emptyHomePromoDraft(NOW));
    expect(Object.keys(errors).sort()).toEqual(["description", "linkText", "linkUrl", "logo", "name"]);
  });

  it("refuses a link that is not https", () => {
    expect(validateHomePromoDraft(filled({ linkUrl: "http://davaogo.app" })).linkUrl).toMatch(/https/);
  });

  it("refuses an end at or before the start, and an unreadable start", () => {
    expect(
      validateHomePromoDraft(filled({ startsAt: "2026-11-10T12:00", endsAt: "2026-11-10T12:00" })).endsAt,
    ).toBe("End after the start.");
    expect(validateHomePromoDraft(filled({ startsAt: "" })).startsAt).toBeTruthy();
  });

  it("keeps the description to 140 characters and the order to a whole number", () => {
    expect(validateHomePromoDraft(filled({ description: "x".repeat(141) })).description).toMatch(/140/);
    expect(validateHomePromoDraft(filled({ displayOrder: "1.5" })).displayOrder).toBeTruthy();
    expect(validateHomePromoDraft(filled({ displayOrder: "-1" })).displayOrder).toBeTruthy();
    expect(validateHomePromoDraft(filled({ displayOrder: "0" })).displayOrder).toBeUndefined();
  });
});

describe("inputFromHomePromoDraft", () => {
  it("sends Manila wall time as instants, trimmed text and the file ids", () => {
    const input = inputFromHomePromoDraft(
      filled({ name: " DavaoGo ", startsAt: "2026-11-10T08:00", endsAt: "2026-12-31T23:59", displayOrder: "2" }),
    );
    expect(input).toMatchObject({
      name: "DavaoGo",
      logo: { fileId: "file_logo" },
      image: null,
      tag: "partner",
      tapAction: "sheet",
      style: "light",
      startsAt: "2026-11-10T00:00:00.000Z",
      endsAt: "2026-12-31T15:59:00.000Z",
      enabled: true,
      displayOrder: 2,
    });
  });

  it("sends no end when the end is blank", () => {
    expect(inputFromHomePromoDraft(filled()).endsAt).toBeNull();
  });
});

describe("status", () => {
  it("reads every API status as a labelled chip", () => {
    expect(presentHomePromoStatus("live").label).toBe("Live");
    expect(presentHomePromoStatus("scheduled").label).toBe("Scheduled");
    expect(presentHomePromoStatus("off").label).toBe("Off");
    expect(presentHomePromoStatus("ended").label).toBe("Ended");
    expect(presentHomePromoStatus("something_new").label).toBe("Off");
  });

  it("tells the draft's status from the switch and the dates", () => {
    expect(draftStatus(filled({ enabled: false }), NOW)).toBe("off");
    expect(draftStatus(filled({ startsAt: "2026-11-11T08:00" }), NOW)).toBe("scheduled");
    expect(draftStatus(filled({ startsAt: "2026-11-01T08:00", endsAt: "2026-11-09T08:00" }), NOW)).toBe("ended");
    expect(draftStatus(filled({ startsAt: "2026-11-10T08:00" }), NOW)).toBe("live");
  });

  it("lists live first, by display order, and rotates only live ones", () => {
    const promos = [
      readHomePromo(rawHomePromo({ id: "a", status: "off", displayOrder: 1 })),
      readHomePromo(rawHomePromo({ id: "b", status: "live", displayOrder: 3 })),
      readHomePromo(rawHomePromo({ id: "c", status: "live", displayOrder: 2 })),
      readHomePromo(rawHomePromo({ id: "d", status: "scheduled", displayOrder: 1 })),
    ];
    expect(sortHomePromos(promos).map((p) => p.id)).toEqual(["c", "b", "d", "a"]);
    expect(rotationOrder(promos).map((p) => p.id)).toEqual(["c", "b"]);
    expect(nextDisplayOrder(promos)).toBe(4);
    expect(nextDisplayOrder([])).toBe(1);
  });
});

describe("readHomePromo", () => {
  it("reads the contract's fields and totals", () => {
    const promo = readHomePromo(rawHomePromo());
    expect(promo).toMatchObject({
      id: "promo_davaogo",
      name: "DavaoGo",
      tag: "partner",
      logo: { fileId: "file_logo", url: "https://files.example/logo.png" },
      image: null,
      views: 120,
      opens: 30,
      taps: 12,
    });
  });

  it("takes bare file ids and nested totals", () => {
    const promo = readHomePromo(
      rawHomePromo({ logo: "file_x", logoUrl: "https://files.example/x.png", totals: { views: 3, opens: 2, taps: 1 } }),
    );
    expect(promo.logo).toEqual({ fileId: "file_x", url: "https://files.example/x.png" });
    expect([promo.views, promo.opens, promo.taps]).toEqual([3, 2, 1]);
  });

  it("reads bigint counters sent as digit strings", () => {
    const promo = readHomePromo(rawHomePromo({ views: "1200", opens: "30", taps: "x" }));
    expect([promo.views, promo.opens, promo.taps]).toEqual([1200, 30, 0]);
  });
});

describe("stats", () => {
  it("runs from the start to today, at most 92 days", () => {
    expect(statsRange({ startsAt: "2026-11-01T00:00:00Z", endsAt: null }, NOW)).toEqual({
      from: "2026-11-01",
      to: "2026-11-10",
    });
    expect(statsRange({ startsAt: "2025-01-01T00:00:00Z", endsAt: null }, NOW).from).toBe("2026-08-11");
    expect(
      statsRange({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-05T00:00:00Z" }, NOW),
    ).toEqual({ from: "2026-10-01", to: "2026-10-05" });
  });

  it("fills missing days with zero, newest first", () => {
    const days = fillDays({ from: "2026-11-08", to: "2026-11-10" }, [
      { day: "2026-11-09", views: 5, opens: 2, taps: 1 },
    ]);
    expect(days.map((d) => [d.day, d.views])).toEqual([
      ["2026-11-10", 0],
      ["2026-11-09", 5],
      ["2026-11-08", 0],
    ]);
  });

  it("gives a rate only when there were views", () => {
    expect(rate(1, 4)).toBe(25);
    expect(rate(1, 0)).toBeNull();
  });
});

describe("statsCsv", () => {
  it("writes one row per day, oldest first, and defuses formula-looking names", async () => {
    const { statsCsv } = await import("@/components/home-promos/PromoStats");
    const csv = statsCsv('=HYPERLINK("x")', [
      { day: "2026-11-10", views: 2, opens: 1, taps: 0 },
      { day: "2026-11-09", views: 5, opens: 0, taps: 0 },
    ]);
    expect(csv.split("\n")).toEqual([
      "promo,day,views,sheet_opens,link_taps",
      `"'=HYPERLINK(""x"")",2026-11-09,5,0,0`,
      `"'=HYPERLINK(""x"")",2026-11-10,2,1,0`,
      "",
    ]);
  });
});
