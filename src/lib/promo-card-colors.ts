/**
 * The Home promo card's colour (contract: gridgo-api `docs/HOME_PROMOTIONS_API.md`,
 * `color`). The card is the promo's `#RRGGBB`; everything drawn on it is
 * whichever of GRIDGO ink or white reads better on that colour. The same rule
 * as gridgo-client `lib/promoCardColors.ts`: change both together.
 *
 * The hex values here are promo data (what the API stores), not portal tokens.
 */

const INK = "#1A1A1A";
const WHITE = "#FFFFFF";
const YELLOW = "#FFDE58";
/** Closer than this in relative luminance and the card would melt into the screen. */
const NEAR_SURFACE = 0.1;
/** Over a card image the tag chip is a dark wash, so the tag reads on any picture. */
const ON_IMAGE_CHIP = "#00000073";

/** The three suggested card colours, in the order the form shows them. */
export const PROMO_SWATCHES = [
  { label: "White", color: WHITE },
  { label: "GRIDGO accent", color: INK },
  { label: "Yellow", color: YELLOW },
] as const;

export const DEFAULT_PROMO_COLOR = WHITE;
/** The initial drawn on the logo's white disc when there is no logo. */
export const PROMO_LOGO_INITIAL_INK = INK;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

/** `#RRGGBB` uppercase from what a person typed (`#` optional), or null. */
export function normalizeHexColor(value: string): string | null {
  const text = value.trim();
  const hex = text.startsWith("#") ? text : `#${text}`;
  return isHexColor(hex) ? hex.toUpperCase() : null;
}

/** The older API's two styles, as colours. */
export function colorFromStyle(style: unknown): string {
  return style === "yellow" ? YELLOW : WHITE;
}

/** The style an API without `color` understands: yellow only for the yellow swatch. */
export function styleFromColor(color: string): "light" | "yellow" {
  return color.toUpperCase() === YELLOW ? "yellow" : "light";
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** GRIDGO ink or white, whichever has the higher contrast on `background`. */
export function readableInk(background: string): string {
  return contrastRatio(background, INK) >= contrastRatio(background, WHITE) ? INK : WHITE;
}

function alpha(hex: string, amount: number): string {
  return `${hex}${Math.round(amount * 255).toString(16).padStart(2, "0").toUpperCase()}`;
}

export type PromoCardColors = {
  background: string;
  ink: string;
  /** Ink at 72%: the link text, the tag, the inactive pager dots. */
  muted: string;
  /** Ink at 10%: the tag chip's fill. */
  chip: string;
  /** A hairline only when the card is close to the screen behind it, else the card's own colour. */
  border: string;
};

/**
 * `screen` is the theme's colour behind the card (`#RRGGBB`, or null when
 * unknown); `outline` is the hairline drawn when the two are too close.
 * `onImage` is true while the card draws its card image (gridgo-client#425):
 * the colour stays behind it while it loads, and the ink is white over the
 * bottom scrim.
 */
export function promoCardColors(
  color: string,
  screen: string | null,
  outline: string,
  onImage = false,
): PromoCardColors {
  const background = isHexColor(color) ? color.toUpperCase() : DEFAULT_PROMO_COLOR;
  const ink = onImage ? WHITE : readableInk(background);
  const near = isHexColor(screen) && Math.abs(luminance(background) - luminance(screen)) < NEAR_SURFACE;
  return {
    background,
    ink,
    muted: alpha(ink, onImage ? 0.85 : 0.72),
    chip: onImage ? ON_IMAGE_CHIP : alpha(ink, 0.1),
    border: near && !onImage ? outline : background,
  };
}

/** `rgb(r, g, b)` / `rgba(…)` as computed by the browser, to `#RRGGBB`; null otherwise. */
export function hexFromCssColor(value: string): string | null {
  const text = value.trim();
  if (isHexColor(text)) return text.toUpperCase();
  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(text);
  if (!match) return null;
  return `#${match
    .slice(1, 4)
    .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}
