"use client";

import { useEffect, useState } from "react";

import { getFileDownloadUrl } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Props = {
  fileId?: string;
  alt: string;
  className?: string;
  emptyLabel?: string;
};

/** Print sample in a crop-mark frame — the board's tile, not a product shot. */
export function SamplePhoto({
  fileId,
  alt,
  className,
  emptyLabel = "No sample yet",
}: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) {
      setSrc(null);
      return;
    }
    let gone = false;
    void getFileDownloadUrl(fileId)
      .then((url) => {
        if (!gone) setSrc(url);
      })
      .catch(() => {
        if (!gone) setSrc(null);
      });
    return () => {
      gone = true;
    };
  }, [fileId]);

  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden bg-surface-variant",
        className,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-1.5 border border-outline/70" />
      <span aria-hidden className="absolute top-0 left-0 size-3 border-t border-l border-foreground" />
      <span aria-hidden className="absolute top-0 right-0 size-3 border-t border-r border-foreground" />
      <span aria-hidden className="absolute bottom-0 left-0 size-3 border-b border-l border-foreground" />
      <span aria-hidden className="absolute right-0 bottom-0 size-3 border-r border-b border-foreground" />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        <p className="text-caption text-text-muted m-0 flex size-full items-center justify-center px-3 text-center">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}
