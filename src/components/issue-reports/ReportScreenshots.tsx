"use client";

import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { IssueReportScreenshot } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const PLATE = "rounded-[var(--radius-field)] border border-border bg-muted";

type Props = {
  screenshots: IssueReportScreenshot[];
  /** The report's reference, as the desk shows it. */
  reference: string;
  /** Reloads the report, which signs new links. */
  onRefresh: () => Promise<unknown>;
};

/**
 * A report's screenshots: thumbnails that show the whole picture, opening a
 * larger view with next and previous. Whether they came with the report or from
 * the reporter's support chat, they read the same.
 *
 * Numbers come from list order, never `position`: a chat picture deleted later
 * leaves a gap there.
 */
export function ReportScreenshots({ screenshots, reference, onRefresh }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // By link, so a refreshed link gets a fresh try.
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const count = screenshots.length;
  if (count === 0) return null;

  // A refresh can return fewer pictures than the one on view.
  const index = openIndex === null ? null : Math.min(openIndex, count - 1);
  const shot = index === null ? null : screenshots[index];
  const fromChat = screenshots.some((entry) => entry.source === "support_chat");

  function markFailed(url: string) {
    setFailed((current) => new Set(current).add(url));
  }

  function step(by: number) {
    setOpenIndex((current) => (current === null ? current : (current + by + count) % count));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count < 2) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
  }

  function onThumbnailClick(event: MouseEvent<HTMLAnchorElement>, at: number) {
    // Ctrl, Cmd or Shift still opens the picture in its own tab or window.
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    setOpenIndex(at);
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } catch {
      // The failed picture stays on view with its message and this button.
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
        Screenshots
      </h3>
      <ul className="m-0 grid list-none grid-cols-3 gap-3 p-0">
        {screenshots.map((entry, at) => (
          <li key={entry.position}>
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-haspopup="dialog"
              aria-label={`Open screenshot ${at + 1} of ${count}`}
              onClick={(event) => onThumbnailClick(event, at)}
              className={cn("block aspect-[3/4] cursor-zoom-in overflow-hidden", PLATE)}
            >
              {failed.has(entry.url) ? (
                <span className="text-caption text-text-muted flex size-full items-center justify-center p-2 text-center">
                  Could not load
                </span>
              ) : (
                <>
                  {/* Presigned MinIO links, so next/image cannot optimise them. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.url}
                    alt={`Screenshot ${at + 1} for report ${reference}`}
                    onError={() => markFailed(entry.url)}
                    className="size-full object-contain"
                  />
                </>
              )}
            </a>
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-muted m-0">
        {fromChat ? "From the reporter's support chat. " : null}
        Open a screenshot to see it larger. Links expire after a few minutes; press Refresh for new ones.
      </p>

      <Dialog
        open={shot !== null}
        onOpenChange={(open) => {
          if (!open) setOpenIndex(null);
        }}
      >
        {shot && index !== null ? (
          <DialogContent
            onKeyDown={onKeyDown}
            className="flex h-[92dvh] w-[min(960px,calc(100%-2rem))] max-w-none flex-col gap-3 overflow-hidden sm:max-w-none"
          >
            <DialogTitle className="pr-10" aria-live="polite">
              Screenshot {index + 1} of {count}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Report {reference}.{count > 1 ? " Use the left and right arrow keys to move between screenshots." : ""}
            </DialogDescription>
            <div className={cn("relative min-h-0 flex-1 overflow-hidden", PLATE)}>
              {failed.has(shot.url) ? (
                <div className="flex size-full flex-col items-center justify-center gap-3 p-4 text-center">
                  <p role="alert" className="text-body text-text-secondary m-0 max-w-[40ch]">
                    This screenshot did not load. Its link may have expired.
                  </p>
                  <Button disabled={refreshing} onClick={() => void refresh()}>
                    {refreshing ? "Getting new links…" : "Get new links"}
                  </Button>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={shot.url}
                  src={shot.url}
                  alt={`Screenshot ${index + 1} for report ${reference}, larger`}
                  onError={() => markFailed(shot.url)}
                  className="absolute inset-0 size-full object-contain"
                />
              )}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2">
              {count > 1 ? (
                <div className="flex items-center gap-2">
                  <Button size="icon" aria-label="Previous screenshot" onClick={() => step(-1)}>
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <Button size="icon" aria-label="Next screenshot" onClick={() => step(1)}>
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <span />
              )}
              {failed.has(shot.url) ? null : (
                <a
                  href={shot.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  <ExternalLink aria-hidden="true" />
                  Open full size
                </a>
              )}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
