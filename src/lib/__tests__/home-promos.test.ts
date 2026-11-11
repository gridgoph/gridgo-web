import { describe, expect, it } from "vitest";

import { readHomePromo } from "@/lib/api/home-promos";
import {
  coverCrop,
  draftFromHomePromo,
  nextBoundary,
  patchFromDraft,
  pictureFitNote,
  statsRangeError,
  statusAt,
  withStatusAt,
} from "@/lib/home-promos";
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
  it("takes any https host the API takes, dotted or not", () => {
    expect(isHttpsUrl("https://localhost/")).toBe(true);
  });

  it("refuses http, bare hosts, other schemes, spaces and credentials", () => {
    for (const bad of [
      "http://davaogo.app",
      "davaogo.app",
      "https://",
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
    expect(Object.keys(errors).sort()).toEqual(["linkText", "linkUrl", "logo", "name"]);
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

  it("lets the description be empty, as the API does", () => {
    expect(validateHomePromoDraft(filled({ description: "" })).description).toBeUndefined();
  });

  it("takes display orders up to the API's maximum", () => {
    expect(validateHomePromoDraft(filled({ displayOrder: "2147483647" })).displayOrder).toBeUndefined();
    expect(validateHomePromoDraft(filled({ displayOrder: "2147483648" })).displayOrder).toBeTruthy();
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
      color: "#FFFFFF",
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
      readHomePromo(rawHomePromo({ id: "a", status: "off", enabled: false, displayOrder: 1 })),
      readHomePromo(rawHomePromo({ id: "b", status: "live", displayOrder: 3 })),
      readHomePromo(rawHomePromo({ id: "c", status: "live", displayOrder: 2 })),
      readHomePromo(rawHomePromo({ id: "d", status: "scheduled", startsAt: "2026-12-01T00:00:00.000Z", displayOrder: 1 })),
    ];
    expect(sortHomePromos(promos).map((p) => p.id)).toEqual(["c", "b", "d", "a"]);
    expect(rotationOrder(promos, NOW).map((p) => p.id)).toEqual(["c", "b"]);
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
    expect(promo.logo).toEqual({ fileId: "file_x", url: "https://files.example/x.png", expiresAt: null });
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

describe("patchFromDraft", () => {
  const promo = () =>
    readHomePromo(rawHomePromo({ startsAt: "2026-11-10T00:00:30.000Z", endsAt: "2026-12-01T00:00:45.000Z" }));

  it("sends only the changed field, never the switch or the dates", () => {
    const origin = draftFromHomePromo(promo());
    expect(patchFromDraft(origin, { ...origin, description: "New line." })).toEqual({ description: "New line." });
  });

  it("sends nothing for untouched values, keeping stored seconds", () => {
    const origin = draftFromHomePromo(promo());
    expect(patchFromDraft(origin, { ...origin })).toEqual({});
  });

  it("compares media by file id, and sends a changed date or image", () => {
    const origin = draftFromHomePromo(promo());
    const next = {
      ...origin,
      logo: { fileId: "file_logo", url: "blob:local" },
      image: { fileId: "file_img", url: "blob:img" },
      endsAt: "",
      enabled: false,
    };
    expect(patchFromDraft(origin, next)).toEqual({ image: { fileId: "file_img" }, endsAt: null, enabled: false });
  });
});

describe("statusAt and boundaries", () => {
  const promo = readHomePromo(
    rawHomePromo({ status: "scheduled", startsAt: "2026-11-10T02:00:00.000Z", endsAt: "2026-11-10T06:00:00.000Z" }),
  );

  it("moves Scheduled to Live at the start and Ended at the end, by the API's rule", () => {
    expect(statusAt(promo, Date.parse("2026-11-10T01:59:59Z"))).toBe("scheduled");
    expect(statusAt(promo, Date.parse("2026-11-10T02:00:00Z"))).toBe("live");
    expect(statusAt(promo, Date.parse("2026-11-10T06:00:00Z"))).toBe("ended");
    expect(statusAt({ ...promo, enabled: false }, Date.parse("2026-11-10T03:00:00Z"))).toBe("off");
    expect(withStatusAt([promo], Date.parse("2026-11-10T03:00:00Z"))[0].status).toBe("live");
  });

  it("finds the next start or end among enabled promos", () => {
    expect(nextBoundary([promo], Date.parse("2026-11-10T01:00:00Z"))).toBe(Date.parse("2026-11-10T02:00:00Z"));
    expect(nextBoundary([promo], Date.parse("2026-11-10T03:00:00Z"))).toBe(Date.parse("2026-11-10T06:00:00Z"));
    expect(nextBoundary([promo], Date.parse("2026-11-10T07:00:00Z"))).toBeNull();
    expect(nextBoundary([{ ...promo, enabled: false }], Date.parse("2026-11-10T01:00:00Z"))).toBeNull();
  });
});

describe("statsRangeError", () => {
  it("allows 366 days inclusive and names what is wrong otherwise", () => {
    expect(statsRangeError({ from: "2025-11-10", to: "2026-11-10" })).toBeNull();
    expect(statsRangeError({ from: "2025-11-09", to: "2026-11-10" })).toBe("Pick 366 days or fewer.");
    expect(statsRangeError({ from: "2026-11-11", to: "2026-11-10" })).toBe("From must be on or before To.");
  });
});

describe("Card image (gridgo-client#425)", () => {
  const withCard = () =>
    readHomePromo(
      rawHomePromo({
        cardImage: {
          fileId: "file_card",
          contentType: "image/jpeg",
          downloadUrl: "https://files.example/card.jpg",
          expiresAt: "2026-11-10T00:05:00.000Z",
        },
        image: { fileId: "file_cover", contentType: "image/png", downloadUrl: "https://files.example/cover.png" },
      }),
    );

  it("reads the card image beside the cover, and null from an API without it", () => {
    const promo = withCard();
    expect(promo.cardImage).toEqual({
      fileId: "file_card",
      url: "https://files.example/card.jpg",
      expiresAt: "2026-11-10T00:05:00.000Z",
    });
    expect(promo.image?.fileId).toBe("file_cover");
    expect(readHomePromo(rawHomePromo()).cardImage).toBeNull();
    expect(draftFromHomePromo(promo).cardImage?.fileId).toBe("file_card");
  });

  it("sends a new promo's card image, and leaves the field out when there is none", () => {
    expect(inputFromHomePromoDraft(filled({ cardImage: { fileId: "file_card", url: null } }))).toMatchObject({
      cardImage: { fileId: "file_card" },
      image: null,
    });
    expect(inputFromHomePromoDraft(filled())).not.toHaveProperty("cardImage");
  });

  it("patches a new, replaced or cleared card image by file id only", () => {
    const origin = draftFromHomePromo(withCard());
    expect(patchFromDraft(origin, { ...origin, cardImage: { fileId: "file_card", url: "blob:x" } })).toEqual({});
    expect(patchFromDraft(origin, { ...origin, cardImage: { fileId: "file_card2", url: "blob:x" } })).toEqual({
      cardImage: { fileId: "file_card2" },
    });
    expect(patchFromDraft(origin, { ...origin, cardImage: null })).toEqual({ cardImage: null });
    expect(patchFromDraft(origin, { ...origin, image: null })).toEqual({ image: null });
  });
});

describe("pictureFitNote", () => {
  it("is quiet for the recommended sizes and anything near them", () => {
    expect(pictureFitNote("logo", { width: 512, height: 512 })).toBeNull();
    expect(pictureFitNote("logo", { width: 1024, height: 900 })).toBeNull();
    expect(pictureFitNote("cardImage", { width: 1200, height: 900 })).toBeNull();
    expect(pictureFitNote("cardImage", { width: 1600, height: 1000 })).toBeNull();
    expect(pictureFitNote("image", { width: 1920, height: 1080 })).toBeNull();
  });

  it("warns when a picture is much smaller than recommended", () => {
    expect(pictureFitNote("logo", { width: 200, height: 200 })).toMatch(/200 × 200 px, much smaller than 512 × 512/);
    expect(pictureFitNote("image", { width: 640, height: 360 })).toMatch(/much smaller than 1600 × 900/);
  });

  it("says what a very different shape means in each slot", () => {
    expect(pictureFitNote("logo", { width: 1200, height: 400 })).toMatch(/wide, not square.*above and below/);
    expect(pictureFitNote("cardImage", { width: 1800, height: 600 })).toMatch(/wider than 4:3, so the card trims its sides/);
    expect(pictureFitNote("cardImage", { width: 900, height: 1600 })).toMatch(/taller than 4:3.*top and bottom/);
    expect(pictureFitNote("image", { width: 1080, height: 1080 })).toMatch(/taller than 16:9.*bands at the sides/);
  });

  it("names both when a picture is small and an odd shape", () => {
    const note = pictureFitNote("cardImage", { width: 300, height: 600 });
    expect(note).toMatch(/much smaller/);
    expect(note).toMatch(/taller than 4:3/);
  });
});

describe("coverCrop", () => {
  it("keeps the middle of a wide picture and the middle of a tall one", () => {
    expect(coverCrop({ width: 400, height: 100 }, 2)).toEqual({ left: 0.25, top: 0, width: 0.5, height: 1 });
    expect(coverCrop({ width: 100, height: 400 }, 1)).toEqual({ left: 0, top: 0.375, width: 1, height: 0.25 });
    expect(coverCrop({ width: 200, height: 100 }, 2)).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });
});
