import { describe, expect, it } from "vitest";

import { readHomePromo } from "@/lib/api/home-promos";
import { emptyHomePromoDraft, inputFromHomePromoDraft, patchFromDraft, validateHomePromoDraft } from "@/lib/home-promos";
import {
  PROMO_SWATCHES,
  colorFromStyle,
  hexFromCssColor,
  normalizeHexColor,
  promoCardColors,
  readableInk,
  styleFromColor,
} from "@/lib/promo-card-colors";
import { rawHomePromo } from "@/test/home-promos";

describe("promo card colours", () => {
  it("suggests White, the GRIDGO accent and Yellow", () => {
    expect(PROMO_SWATCHES.map((s) => [s.label, s.color])).toEqual([
      ["White", "#FFFFFF"],
      ["GRIDGO accent", "#1A1A1A"],
      ["Yellow", "#FFDE58"],
    ]);
  });

  it("accepts only six-digit hex, with or without #, and uppercases it", () => {
    expect(normalizeHexColor("#3366cc")).toBe("#3366CC");
    expect(normalizeHexColor(" ff8800 ")).toBe("#FF8800");
    for (const bad of ["", "#fff", "#12345", "#1234567", "#GGGGGG", "red", "#FFDE58AA"]) {
      expect(normalizeHexColor(bad)).toBeNull();
    }
  });

  it("picks the ink with the higher contrast: dark on light and mid, white on dark", () => {
    expect(readableInk("#FFFFFF")).toBe("#1A1A1A");
    expect(readableInk("#FFDE58")).toBe("#1A1A1A");
    expect(readableInk("#808080")).toBe("#1A1A1A");
    expect(readableInk("#1A1A1A")).toBe("#FFFFFF");
    expect(readableInk("#3366CC")).toBe("#FFFFFF");
  });

  it("mutes ink at 72%, fills the tag chip at 10%, and draws a hairline only near the screen colour", () => {
    const white = promoCardColors("#FFFFFF", "#F8F8F8", "var(--color-outline)");
    expect(white).toEqual({ background: "#FFFFFF", ink: "#1A1A1A", muted: "#1A1A1AB8", chip: "#1A1A1A1A", border: "var(--color-outline)" });
    expect(promoCardColors("#FFFFFF", "#000000", "o").border).toBe("#FFFFFF");
    expect(promoCardColors("#1A1A1A", "#000000", "o")).toMatchObject({ ink: "#FFFFFF", muted: "#FFFFFFB8", border: "o" });
    expect(promoCardColors("#1a1a1a", null, "o").border).toBe("#1A1A1A");
  });

  it("maps the older API's style both ways", () => {
    expect(colorFromStyle("yellow")).toBe("#FFDE58");
    expect(colorFromStyle("light")).toBe("#FFFFFF");
    expect(colorFromStyle(undefined)).toBe("#FFFFFF");
    expect(styleFromColor("#ffde58")).toBe("yellow");
    expect(styleFromColor("#1A1A1A")).toBe("light");
  });

  it("reads the browser's computed colour", () => {
    expect(hexFromCssColor("rgb(248, 248, 248)")).toBe("#F8F8F8");
    expect(hexFromCssColor("rgba(0, 0, 0, 1)")).toBe("#000000");
    expect(hexFromCssColor("#1a1a1a")).toBe("#1A1A1A");
    expect(hexFromCssColor("oklch(0.5 0.1 200)")).toBeNull();
  });
});

describe("promo colour on read and write", () => {
  it("prefers color, falls back to style", () => {
    expect(readHomePromo(rawHomePromo({ color: "#0a7d4f", style: "light" })).color).toBe("#0A7D4F");
    expect(readHomePromo(rawHomePromo({ style: "yellow" })).color).toBe("#FFDE58");
    expect(readHomePromo(rawHomePromo({ color: "teal", style: "light" })).color).toBe("#FFFFFF");
  });

  it("sends color with its fallback style, and patches both only when the colour changed", () => {
    const draft = { ...emptyHomePromoDraft(Date.parse("2026-11-10T00:00:00Z")), color: "#3366cc" };
    expect(inputFromHomePromoDraft(draft)).toMatchObject({ color: "#3366CC", style: "light" });
    expect(inputFromHomePromoDraft({ ...draft, color: "#FFDE58" })).toMatchObject({ color: "#FFDE58", style: "yellow" });
    expect(patchFromDraft(draft, { ...draft, color: "#3366CC" })).toEqual({});
    expect(patchFromDraft(draft, { ...draft, color: "#1A1A1A" })).toEqual({ color: "#1A1A1A", style: "light" });
    expect(validateHomePromoDraft({ ...draft, color: "#12" }).color).toBe("Use a colour like #1A1A1A.");
    expect(validateHomePromoDraft(draft).color).toBeUndefined();
  });
});
