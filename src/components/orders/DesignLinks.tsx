/**
 * Design links on an order, as rows beside the artwork file plates.
 *
 * The file plate is dark because it holds the picture; a link row is light
 * and outlined because it only points at one. Whoever prints must open it to
 * get the file, so a link-only order says exactly that — never "no artwork".
 * Rules and copy live in `src/lib/design-links.ts`.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Check,
  Copy,
  ExternalLink,
  HardDrive,
  Link2,
  Palette,
  PenTool,
  Send,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { EvidenceStrip } from "@/components/orders/EvidencePreview";
import { Button } from "@/components/ui/button";
import type { Order } from "@/lib/api/types";
import {
  DESIGN_LINK_BESIDE_FILE_COPY,
  DESIGN_LINK_ONLY_COPY,
  linkDisplayParts,
  orderDesignLinks,
  providerName,
  safeLinkHref,
  type LinkProvider,
  type OrderDesignLink,
} from "@/lib/design-links";
import { artworkEvidence } from "@/lib/evidence";

/** The same glyphs the client app shows beside its design-link field. */
const PROVIDER_ICONS: Record<LinkProvider, LucideIcon> = {
  canva: Palette,
  google_drive: HardDrive,
  dropbox: Box,
  we_transfer: Send,
  figma: PenTool,
  other: Link2,
};

type CopyState = "idle" | "copied" | "failed";

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function DesignLinkRow({ link }: { link: OrderDesignLink }) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (reset.current) clearTimeout(reset.current);
    },
    [],
  );

  const Icon = PROVIDER_ICONS[link.provider] ?? Link2;
  const name = providerName(link.provider);
  const href = safeLinkHref(link.url);
  const { head, tail } = linkDisplayParts(link.url);

  const copyLabel =
    copy === "copied" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy link";

  const onCopy = async () => {
    const ok = await copyText(link.url);
    setCopy(ok ? "copied" : "failed");
    if (reset.current) clearTimeout(reset.current);
    reset.current = setTimeout(() => setCopy("idle"), 2500);
  };

  const body = (
    <>
      <span
        className="bg-surface-variant text-text-secondary flex size-8 shrink-0 items-center justify-center rounded-field"
        aria-hidden
      >
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
          {name}
          {link.lineName ? (
            <span className="text-caption text-text-muted"> · {link.lineName}</span>
          ) : null}
        </span>
        {/*
          The head truncates and the tail stays: two Canva links differ only
          in the design id near the end of the address.
        */}
        <span className="text-caption text-text-muted flex min-w-0" title={link.url}>
          <span className="truncate">{head}</span>
          {tail ? <span className="shrink-0">{tail}</span> : null}
        </span>
      </span>
    </>
  );

  return (
    // A container, not a breakpoint: the same row sits in a wide QA step and
    // in the narrow rail beside it, at the same viewport width.
    <li className="@container flex min-w-0 items-center gap-1 rounded-card border border-outline bg-surface p-1">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-field px-1.5 py-1 hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {body}
          <ExternalLink size={14} className="text-text-muted shrink-0" aria-hidden />
          <span className="sr-only">(opens {name} in a new tab)</span>
        </a>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1">
          {body}
          <span className="text-caption text-text-muted flex shrink-0 items-center gap-1">
            <TriangleAlert size={14} aria-hidden />
            Not a secure link
          </span>
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={() => void onCopy()}
        aria-label={`Copy ${name} link`}
      >
        {copy === "copied" ? (
          <Check aria-hidden />
        ) : copy === "failed" ? (
          <TriangleAlert aria-hidden />
        ) : (
          <Copy aria-hidden />
        )}
        {/* Narrow rows keep the icon; the accessible name always says it. */}
        <span className="hidden @[26rem]:inline" aria-hidden>
          {copyLabel}
        </span>
      </Button>
      <span className="sr-only" role="status">
        {copy === "idle" ? "" : copyLabel}
      </span>
    </li>
  );
}

export function DesignLinkList({ links }: { links: OrderDesignLink[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Design links">
      {links.map((link) => (
        <DesignLinkRow key={link.key} link={link} />
      ))}
    </ul>
  );
}

/** The lead line above the links: plain words for what there is to open. */
export function DesignLinkLead({ fileToo }: { fileToo: boolean }) {
  return (
    <p className="text-body text-text-secondary m-0">
      {fileToo ? DESIGN_LINK_BESIDE_FILE_COPY : DESIGN_LINK_ONLY_COPY}
    </p>
  );
}

/**
 * Everything the order carries as artwork: file plates, then design links.
 * Renders nothing when there is neither, so a caller keeps its own empty copy.
 */
export function OrderArtwork({
  order,
}: {
  order: Pick<Order, "artworkFileIds" | "artworkName" | "size" | "productionItems">;
}) {
  const files = artworkEvidence(order);
  const links = orderDesignLinks(order);
  if (files.length === 0 && links.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {files.length ? <EvidenceStrip items={files} deletable /> : null}
      {links.length ? (
        <div className="flex flex-col gap-2">
          <DesignLinkLead fileToo={files.length > 0} />
          <DesignLinkList links={links} />
        </div>
      ) : null}
    </div>
  );
}
