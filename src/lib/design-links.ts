/**
 * Design links: the artwork a client kept on Canva, Drive, Dropbox or
 * WeTransfer instead of (or beside) an uploaded file.
 *
 * Contract: "Artwork design links" in `gridgo-api/docs/ORDER_MATCH_API.md`.
 * The API snapshots them per checkout line as
 * `order.productionItems[].artworkLinks: [{ formatCode, url }]`, visible to the
 * owning client, Operations/Super Admin, and the assigned shop (its own lines).
 * A link is a pointer, not the file: whoever prints must open it to get one.
 *
 * Provider names and host boundaries match the client app
 * (`gridgo-client/lib/designLink.ts`), so a Canva link reads "Canva" to the
 * client who pasted it and to the shop that prints it.
 */

import type { ArtworkLink, Order, ProductionItem } from "@/lib/api/types";

export type LinkProvider =
  | "canva"
  | "google_drive"
  | "dropbox"
  | "we_transfer"
  | "figma"
  | "other";

const PROVIDER_NAMES: Record<LinkProvider, string> = {
  canva: "Canva",
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  we_transfer: "WeTransfer",
  figma: "Figma",
  other: "Web link",
};

export function providerName(provider: LinkProvider): string {
  return PROVIDER_NAMES[provider] ?? PROVIDER_NAMES.other;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Where a link points, by its address. `other_link` may still hold a Drive
 * or Canva link from an older client, so the host decides, not the code.
 */
export function providerOf(url: string): LinkProvider {
  const host = hostOf(url);
  if (onDomain(host, "canva.com") || host === "canva.link") return "canva";
  if (host === "drive.google.com" || host === "docs.google.com") return "google_drive";
  if (onDomain(host, "dropbox.com") || onDomain(host, "dropboxusercontent.com")) {
    return "dropbox";
  }
  if (onDomain(host, "wetransfer.com") || host === "we.tl") return "we_transfer";
  if (onDomain(host, "figma.com")) return "figma";
  return "other";
}

/**
 * The address without scheme, `www.`, query or fragment. Canva share links
 * carry a tail of tracking parameters that says nothing about which design
 * it is.
 */
export function linkDisplay(url: string): string {
  return url
    .replace(/[?#].*$/, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

/**
 * The display address split so the end survives truncation: two Canva links
 * differ only in the design id near the end, so the head is what gets cut.
 */
export function linkDisplayParts(url: string, tailLength = 14): { head: string; tail: string } {
  const text = linkDisplay(url);
  if (text.length <= tailLength * 2) return { head: text, tail: "" };
  return { head: text.slice(0, -tailLength), tail: text.slice(-tailLength) };
}

/**
 * Only an HTTPS address becomes a clickable link. The API refuses anything
 * else on write; this keeps a `javascript:` value from ever reaching an href
 * if that rule is ever loosened.
 */
export function safeLinkHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Links on one checkout line. An API without the field sends none. */
export function lineArtworkLinks(
  line: Pick<ProductionItem, "artworkLinks"> | null | undefined,
): ArtworkLink[] {
  const links = line?.artworkLinks;
  if (!Array.isArray(links)) return [];
  return links.filter(
    (link): link is ArtworkLink =>
      Boolean(link) && typeof link.url === "string" && link.url.trim() !== "",
  );
}

export type OrderDesignLink = ArtworkLink & {
  key: string;
  provider: LinkProvider;
  /** The line's item name, only when the order has more than one line. */
  lineName: string | null;
};

/** Every design link on the order, in line order, without repeats. */
export function orderDesignLinks(
  order: Pick<Order, "productionItems">,
): OrderDesignLink[] {
  const items = order.productionItems ?? [];
  const seen = new Set<string>();
  const out: OrderDesignLink[] = [];
  for (const item of items) {
    for (const link of lineArtworkLinks(item)) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      out.push({
        ...link,
        key: `${item.id}:${link.url}`,
        provider: providerOf(link.url),
        lineName: items.length > 1 ? item.itemName || null : null,
      });
    }
  }
  return out;
}

/** What the order's artwork is, so a screen never says "none" over a link. */
export type ArtworkSource = "file" | "link" | "file_and_link" | "none";

export function artworkSource(
  order: Pick<Order, "artworkFileIds" | "productionItems">,
): ArtworkSource {
  // The same file list the artwork plates draw (`artworkEvidence`), so a
  // section never opens over nothing.
  const hasFile = (order.artworkFileIds ?? []).some(Boolean);
  const hasLink = orderDesignLinks(order).length > 0;
  if (hasFile && hasLink) return "file_and_link";
  if (hasFile) return "file";
  if (hasLink) return "link";
  return "none";
}

/** The lead line above link-only artwork. */
export const DESIGN_LINK_ONLY_COPY = "Design link: open it to get the file";

/** The lead line when a file came with a link beside it. */
export const DESIGN_LINK_BESIDE_FILE_COPY =
  "The client also sent a design link. Check it matches the file.";

/** The QA tick for artwork, in the words of what there is to check. */
export function artworkQaCheckLabel(source: ArtworkSource): string {
  switch (source) {
    case "link":
      return "Design link opens without signing in, and the design is high enough resolution";
    case "file_and_link":
      return "Artwork opens and is high enough resolution, and the design link matches it";
    default:
      return "Artwork opens and is high enough resolution";
  }
}
