import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Broadcast } from "@/lib/api/types";

import {
  AUDIENCE_CHOICES,
  audienceLabel,
  audienceReach,
  broadcastErrorMessage,
  describeAge,
  findRecentDuplicate,
  phrasePhones,
  presentDelivery,
  validateDestination,
} from "./broadcasts";

const NOW = Date.parse("2026-08-11T10:00:00.000Z");

function broadcast(overrides: Partial<Broadcast> = {}): Broadcast {
  return {
    id: "bc_1",
    title: "GRIDGO 2.0 is out",
    body: "Faster quotes and live delivery tracking. Update now.",
    audience: "all",
    url: "https://gridgo.talasora.com/download",
    sentAt: "2026-08-11T09:56:00.000Z",
    sentBy: "u_admin",
    sentByName: "Super Admin",
    deliveredCount: 820,
    failedCount: 420,
    ...overrides,
  };
}

describe("audience", () => {
  it("offers everyone last so it is never the resting choice", () => {
    expect(AUDIENCE_CHOICES.at(-1)?.value).toBe("all");
  });

  it("never puts an API enum on screen", () => {
    for (const choice of AUDIENCE_CHOICES) {
      expect(choice.label).not.toMatch(/_|^(all|client|supplier|rider)$/);
    }
    expect(audienceLabel("client")).toBe("Customers");
    expect(audienceLabel("supplier")).toBe("Print shops");
    expect(audienceLabel("nonsense")).toBe("Unknown audience");
  });

  it("spells out who 'Everyone' is when it sits inside a sentence", () => {
    expect(audienceReach("all")).toBe("every customer, print shop and rider");
    expect(audienceReach("supplier")).toBe("print shops");
    expect(audienceReach("nonsense")).toBe("this audience");
  });
});

describe("validateDestination", () => {
  it("accepts the captain's download link", () => {
    const result = validateDestination("https://gridgo.talasora.com/download");
    expect(result).toEqual({
      ok: true,
      url: "https://gridgo.talasora.com/download",
    });
  });

  it("accepts the bare root domain and hyphenated subdomains", () => {
    expect(validateDestination("https://talasora.com/news").ok).toBe(true);
    expect(validateDestination("https://gridgo-dash.talasora.com/").ok).toBe(true);
  });

  it("trims and normalises before judging", () => {
    const result = validateDestination("  https://GRIDGO.talasora.com/download  ");
    expect(result.ok).toBe(true);
  });

  it("refuses an outside domain and says why", () => {
    const result = validateDestination("https://bit.ly/free-print");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/bit\.ly/);
    expect(result.reason).toMatch(/phishing/);
  });

  it("refuses a look-alike domain that only ends in the right words", () => {
    expect(validateDestination("https://talasora.com.evil.example/x").ok).toBe(false);
    expect(validateDestination("https://nottalasora.com/x").ok).toBe(false);
  });

  it("refuses credentials smuggled into the authority", () => {
    const result = validateDestination(
      "https://gridgo.talasora.com@evil.example/x",
    );
    expect(result.ok).toBe(false);
  });

  it("refuses non-https schemes", () => {
    expect(validateDestination("http://gridgo.talasora.com/x").ok).toBe(false);
    expect(
      validateDestination("javascript:alert(document.cookie)").ok,
    ).toBe(false);
    expect(validateDestination("data:text/html,<h1>hi").ok).toBe(false);
  });

  it("refuses a port, whitespace, and anything that is not a URL", () => {
    expect(validateDestination("https://gridgo.talasora.com:8443/x").ok).toBe(false);
    expect(validateDestination("https://gridgo.talasora.com/a b").ok).toBe(false);
    expect(validateDestination("gridgo.talasora.com/download").ok).toBe(false);
    expect(validateDestination("").ok).toBe(false);
  });

  it("refuses a punycode homoglyph of the real domain", () => {
    // "tаlasora.com" with a Cyrillic а — new URL() encodes it to xn--…
    expect(validateDestination("https://tаlasora.com/x").ok).toBe(false);
  });
});

describe("findRecentDuplicate", () => {
  const recent = [broadcast()];

  it("catches the same words to the same people minutes later", () => {
    const hit = findRecentDuplicate(
      {
        title: "  GRIDGO 2.0 is out ",
        body: "Faster quotes and live delivery tracking.  Update now.",
        audience: "all",
      },
      recent,
      NOW,
    );
    expect(hit?.id).toBe("bc_1");
  });

  it("does not fire for a different audience or different words", () => {
    expect(
      findRecentDuplicate(
        { title: "GRIDGO 2.0 is out", body: recent[0].body, audience: "rider" },
        recent,
        NOW,
      ),
    ).toBeNull();
    expect(
      findRecentDuplicate(
        { title: "Something else", body: recent[0].body, audience: "all" },
        recent,
        NOW,
      ),
    ).toBeNull();
  });

  it("does not fire outside the window, or before an audience is chosen", () => {
    const old = [broadcast({ sentAt: "2026-08-11T06:00:00.000Z" })];
    expect(
      findRecentDuplicate(
        { title: recent[0].title, body: recent[0].body, audience: "all" },
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

describe("presentDelivery", () => {
  it("reads a partial delivery as normal, not as failure", () => {
    const partial = presentDelivery(820, 420);
    expect(partial.tone).not.toBe("error");
    expect(partial.label).toBe("Reached 820 of 1,240");
    expect(partial.detail).toMatch(/normal/);
  });

  it("reads a total failure as a failure", () => {
    const none = presentDelivery(0, 1240);
    expect(none.tone).toBe("error");
    expect(none.label).toBe("Reached no phones");
    expect(none.detail).toMatch(/notification service/);
  });

  it("separates a clean sweep from an empty audience", () => {
    expect(presentDelivery(1240, 0).tone).toBe("success");
    expect(presentDelivery(0, 0).tone).toBe("neutral");
    expect(presentDelivery(0, 0).label).toBe("No phones to reach");
  });
});

describe("phrasePhones", () => {
  it("counts and pluralises", () => {
    expect(phrasePhones(1)).toBe("1 phone");
    expect(phrasePhones(0)).toBe("0 phones");
    expect(phrasePhones(1240)).toBe("1,240 phones");
  });
});

describe("broadcastErrorMessage", () => {
  it("says plainly that nothing was sent, and never leaks a code", () => {
    const missing = broadcastErrorMessage(
      new ApiError(404, { error: "not_found" }),
      "fallback",
    );
    expect(missing).toMatch(/not available/);
    expect(missing).toMatch(/Nothing was sent/);
    expect(missing).not.toMatch(/not_found/);

    expect(
      broadcastErrorMessage(new ApiError(403, { error: "forbidden" }), "f"),
    ).toMatch(/Super Admin/);
  });

  it("does not claim nothing was sent when nothing was being sent", () => {
    const reading = broadcastErrorMessage(
      new ApiError(404, { error: "not_found" }),
      "fallback",
      "read",
    );
    expect(reading).toMatch(/not available/);
    expect(reading).not.toMatch(/sent/i);
  });

  it("does not claim nothing was sent when the server broke mid-send", () => {
    const server = broadcastErrorMessage(
      new ApiError(500, { error: "internal" }),
      "fallback",
    );
    expect(server).toMatch(/may or may not/);
  });
});
