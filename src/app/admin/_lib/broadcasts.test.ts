import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Announcement } from "@/lib/api/types";

import {
  AUDIENCE_CHOICES,
  ANNOUNCEMENT_LIMITS,
  announcementErrorMessage,
  audienceHitsStrangers,
  audienceLabel,
  audienceReach,
  describeAge,
  findRecentDuplicate,
  phraseAccounts,
  phraseUnclaimed,
  presentAnnouncementReach,
} from "./broadcasts";

const NOW = Date.parse("2026-08-11T10:00:00.000Z");

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: "anc_1",
    title: "GRIDGO 1.4 is available",
    body: "Update from the store. This message is safe for any phone.",
    audience: "everyone",
    at: "2026-08-11T09:56:00.000Z",
    notifiedUsers: 6,
    unclaimedDevices: 3,
    ...overrides,
  };
}

describe("audience", () => {
  it("offers everyone last so it is never the resting choice", () => {
    expect(AUDIENCE_CHOICES.at(-1)?.value).toBe("everyone");
    expect(AUDIENCE_CHOICES[0]?.value).not.toBe("everyone");
  });

  it("covers the five live audiences and no others", () => {
    expect(AUDIENCE_CHOICES.map((choice) => choice.value)).toEqual([
      "clients",
      "suppliers",
      "riders",
      "ops",
      "everyone",
    ]);
  });

  it("never puts an API enum on screen", () => {
    for (const choice of AUDIENCE_CHOICES) {
      expect(choice.label).not.toMatch(
        /_|^(everyone|clients|suppliers|riders|ops)$/,
      );
    }
    expect(audienceLabel("clients")).toBe("Customers");
    expect(audienceLabel("suppliers")).toBe("Print shops");
    expect(audienceLabel("ops")).toBe("Operations");
    expect(audienceLabel("nonsense")).toBe("Unknown audience");
  });

  it("spells out who Everyone is, including unsigned-in phones", () => {
    expect(audienceReach("everyone")).toMatch(/never signed in/);
    expect(audienceReach("suppliers")).toBe("print shops");
    expect(audienceReach("ops")).toBe("operations");
    expect(audienceReach("nonsense")).toBe("this audience");
  });

  it("treats only Everyone as the stranger channel", () => {
    expect(audienceHitsStrangers("everyone")).toBe(true);
    expect(audienceHitsStrangers("clients")).toBe(false);
    expect(audienceHitsStrangers("ops")).toBe(false);
    expect(audienceHitsStrangers(null)).toBe(false);
  });

  it("says Everyone also hits unsigned-in phones before anyone sends", () => {
    const everyone = AUDIENCE_CHOICES.find((choice) => choice.value === "everyone");
    expect(everyone?.reason).toMatch(/never signed in/);
    expect(everyone?.reason).toMatch(/stranger/);
  });
});

describe("limits", () => {
  it("matches the API title and body ceilings", () => {
    expect(ANNOUNCEMENT_LIMITS.title).toBe(120);
    expect(ANNOUNCEMENT_LIMITS.body).toBe(500);
  });
});

describe("findRecentDuplicate", () => {
  const recent = [announcement()];

  it("catches the same words to the same people minutes later", () => {
    const hit = findRecentDuplicate(
      {
        title: "  GRIDGO 1.4 is available ",
        body: "Update from the store.  This message is safe for any phone.",
        audience: "everyone",
      },
      recent,
      NOW,
    );
    expect(hit?.id).toBe("anc_1");
  });

  it("does not fire for a different audience or different words", () => {
    expect(
      findRecentDuplicate(
        {
          title: "GRIDGO 1.4 is available",
          body: recent[0].body,
          audience: "riders",
        },
        recent,
        NOW,
      ),
    ).toBeNull();
    expect(
      findRecentDuplicate(
        { title: "Something else", body: recent[0].body, audience: "everyone" },
        recent,
        NOW,
      ),
    ).toBeNull();
  });

  it("does not fire outside the window, or before an audience is chosen", () => {
    const old = [announcement({ at: "2026-08-11T06:00:00.000Z" })];
    expect(
      findRecentDuplicate(
        { title: recent[0].title, body: recent[0].body, audience: "everyone" },
        old,
        NOW,
      ),
    ).toBeNull();
    expect(
      findRecentDuplicate(
        { title: recent[0].title, body: recent[0].body, audience: null },
        recent,
        NOW,
      ),
    ).toBeNull();
  });
});

describe("describeAge", () => {
  it("reads in the units a mistake is measured in", () => {
    expect(describeAge("2026-08-11T09:56:00.000Z", NOW)).toBe("4 minutes ago");
    expect(describeAge("2026-08-11T09:59:40.000Z", NOW)).toBe(
      "less than a minute ago",
    );
    expect(describeAge("2026-08-11T08:00:00.000Z", NOW)).toBe("2 hours ago");
    expect(describeAge("2026-08-08T10:00:00.000Z", NOW)).toBe("3 days ago");
    expect(describeAge("not a date", NOW)).toBe("at an unknown time");
  });
});

describe("presentAnnouncementReach", () => {
  it("reads a mixed everyone result as normal, not as failure", () => {
    const partial = presentAnnouncementReach(6, 3, "everyone");
    expect(partial.tone).not.toBe("error");
    expect(partial.label).toBe("6 signed-in accounts, 3 unsigned-in phones");
    expect(partial.detail).toMatch(/normal/);
  });

  it("reads a zero-zero result as a broken send", () => {
    const none = presentAnnouncementReach(0, 0, "everyone");
    expect(none.tone).toBe("error");
    expect(none.label).toBe("Reached nobody");
    expect(none.detail).toMatch(/broken send/);
  });

  it("does not treat a role send with zero unsigned-in phones as a miss", () => {
    const shops = presentAnnouncementReach(4, 0, "suppliers");
    expect(shops.tone).toBe("success");
    expect(shops.label).toBe("4 signed-in accounts");
    expect(shops.detail).toMatch(/only Everyone/);
  });

  it("reads an everyone send that reached only unsigned-in phones as partial", () => {
    const strangers = presentAnnouncementReach(0, 3, "everyone");
    expect(strangers.tone).not.toBe("error");
    expect(strangers.label).toBe("3 unsigned-in phones");
    expect(strangers.detail).toMatch(/normal/);
  });
});

describe("count phrases", () => {
  it("counts and pluralises accounts and unsigned-in phones", () => {
    expect(phraseAccounts(1)).toBe("1 signed-in account");
    expect(phraseAccounts(6)).toBe("6 signed-in accounts");
    expect(phraseUnclaimed(1)).toBe("1 unsigned-in phone");
    expect(phraseUnclaimed(3)).toBe("3 unsigned-in phones");
  });
});

describe("announcementErrorMessage", () => {
  it("says plainly that nothing was sent, and never leaks a code", () => {
    const missing = announcementErrorMessage(
      new ApiError(404, { error: "not_found" }),
      "fallback",
    );
    expect(missing).toMatch(/does not accept announcements/);
    expect(missing).toMatch(/Nothing was sent/);
    expect(missing).not.toMatch(/not_found/);

    expect(
      announcementErrorMessage(new ApiError(403, { error: "forbidden" }), "f"),
    ).toMatch(/Super Admin/);
  });

  it("maps title and body validation without showing the API error name", () => {
    const title = announcementErrorMessage(
      new ApiError(400, { error: "invalid_announcement_title" }),
      "fallback",
    );
    expect(title).toMatch(/120/);
    expect(title).not.toMatch(/invalid_announcement/);

    const body = announcementErrorMessage(
      new ApiError(400, { error: "invalid_announcement_body" }),
      "fallback",
    );
    expect(body).toMatch(/500/);
    expect(body).not.toMatch(/invalid_announcement/);

    const image = announcementErrorMessage(
      new ApiError(400, { error: "invalid_announcement_image" }),
      "fallback",
    );
    expect(image).toMatch(/picture/i);
    expect(image).not.toMatch(/invalid_announcement/);
  });

  it("does not claim nothing was sent when the server broke mid-send", () => {
    const server = announcementErrorMessage(
      new ApiError(500, { error: "internal" }),
      "fallback",
    );
    expect(server).toMatch(/may or may not/);
  });
});
