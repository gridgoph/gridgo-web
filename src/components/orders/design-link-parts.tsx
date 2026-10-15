/**
 * The pieces every design-link row shares: the provider glyph and the Copy
 * control. Kept apart from `DesignLinks.tsx` so the attachment list can use
 * them without the two components importing each other.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Check,
  Copy,
  HardDrive,
  Link2,
  Palette,
  PenTool,
  Send,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LinkProvider } from "@/lib/design-links";

/** The same glyphs the client app shows beside its design-link field. */
export const PROVIDER_ICONS: Record<LinkProvider, LucideIcon> = {
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

/**
 * Copy for one address. Narrow rows keep the icon; the words show once the
 * row's container has room (the row must be an `@container`).
 */
export function CopyLinkButton({ url, name }: { url: string; name: string }) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (reset.current) clearTimeout(reset.current);
    },
    [],
  );

  const copyLabel =
    copy === "copied" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy link";

  const onCopy = async () => {
    const ok = await copyText(url);
    setCopy(ok ? "copied" : "failed");
    if (reset.current) clearTimeout(reset.current);
    reset.current = setTimeout(() => setCopy("idle"), 2500);
  };

  return (
    <>
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
        <span className="hidden @[26rem]:inline" aria-hidden>
          {copyLabel}
        </span>
      </Button>
      <span className="sr-only" role="status">
        {copy === "idle" ? "" : copyLabel}
      </span>
    </>
  );
}
