"use client";

import { ImageOff } from "lucide-react";

import type { FeaturedPhoto } from "@/lib/featured-prints";
import { cn } from "@/lib/utils";

/** Eight hairlines, two at each corner, meeting on the trimmed edge. */
const MARKS = [
  "left-0 top-1.5 h-px w-1.5",
  "left-1.5 top-0 h-1.5 w-px",
  "right-0 top-1.5 h-px w-1.5",
  "right-1.5 top-0 h-1.5 w-px",
  "bottom-1.5 left-0 h-px w-1.5",
  "bottom-0 left-1.5 h-1.5 w-px",
  "bottom-1.5 right-0 h-px w-1.5",
  "bottom-0 right-1.5 h-1.5 w-px",
];

/**
 * A sample photo inside printer's crop marks, as the client app draws it
 * (gridgo-client `CropMarkFrame`). The 4:3 well is the Home strip's cut.
 *
 * `downloadUrl` is the signed image; `url` is never image bytes. Without a
 * signed link the frame shows a neutral placeholder, as the client does.
 * A link that fails to load has usually expired, so `onStale` asks for a
 * fresh read.
 */
export function SampleFrame({
  photo,
  className,
  onStale,
}: {
  photo: FeaturedPhoto | null;
  className?: string;
  onStale?: () => void;
}) {
  const url = photo?.downloadUrl ?? null;
  return (
    <div className={cn("relative p-1.5", className)}>
      <div className="overflow-hidden rounded-sm border border-outline bg-surface-variant">
        <div className="relative aspect-[4/3] w-full">
          {url ? (
            // Signed MinIO links are not a Next image domain; same as the other sample plates.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={onStale}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-text-muted">
              <ImageOff aria-hidden className="size-4" />
              <span className="sr-only">No sample photo</span>
            </span>
          )}
        </div>
      </div>
      {MARKS.map((mark) => (
        <span key={mark} aria-hidden className={cn("absolute bg-text-muted", mark)} />
      ))}
    </div>
  );
}
