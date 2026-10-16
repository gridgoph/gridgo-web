/**
 * Design links on an order, as rows beside the artwork file plates.
 *
 * The file plate is dark because it holds the picture; a link row is light
 * and outlined because it only points at one. Whoever prints must open it to
 * get the file, so a link-only order says exactly that — never "no artwork".
 * Rules and copy live in `src/lib/design-links.ts`.
 */

"use client";

import { ExternalLink, Link2, TriangleAlert } from "lucide-react";

import { ArtworkAttachments } from "@/components/orders/ArtworkAttachments";
import { CopyLinkButton, PROVIDER_ICONS } from "@/components/orders/design-link-parts";
import { EvidenceStrip } from "@/components/orders/EvidencePreview";
import type { Order } from "@/lib/api/types";
import { showsAttachmentList } from "@/lib/artwork-attachments";
import {
  DESIGN_LINK_BESIDE_FILE_COPY,
  DESIGN_LINK_ONLY_COPY,
  linkDisplayParts,
  orderDesignLinks,
  providerName,
  safeLinkHref,
  type OrderDesignLink,
} from "@/lib/design-links";
import { artworkEvidence } from "@/lib/evidence";

export function DesignLinkRow({ link }: { link: OrderDesignLink }) {
  const Icon = PROVIDER_ICONS[link.provider] ?? Link2;
  const name = providerName(link.provider);
  const href = safeLinkHref(link.url);
  const { head, tail } = linkDisplayParts(link.url);
  // The client's own name for the link leads; the host follows it.
  const label = link.label?.trim() || null;

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
          {label ?? name}
          {label || link.lineName ? (
            <span className="text-caption text-text-muted">
              {[label ? name : null, link.lineName]
                .filter(Boolean)
                .map((part) => ` · ${part}`)
                .join("")}
            </span>
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
      <CopyLinkButton url={link.url} name={name} />
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
 * Everything the order carries as artwork: file plates, then design links,
 * or the attachment list when an item carries several or labelled entries.
 * Renders nothing when there is neither, so a caller keeps its own empty copy.
 */
export function OrderArtwork({
  order,
  review = false,
}: {
  order: Pick<
    Order,
    "id" | "artworkFileIds" | "artworkName" | "size" | "productionItems"
  >;
  /** Count what the GRIDGO Team has opened, where the file check is made. */
  review?: boolean;
}) {
  // Several files or a label on any item: every entry, item by item, in the
  // client's order. An older one-file order keeps its plates.
  if (showsAttachmentList(order)) {
    return <ArtworkAttachments order={order} audience="staff" review={review} />;
  }
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
