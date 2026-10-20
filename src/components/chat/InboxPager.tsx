"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export const INBOX_PAGE_SIZE = 8;

export const INBOX_PAGE_SIZES = [8, 16, 24] as const;

export function inboxPageCount(total: number, pageSize = INBOX_PAGE_SIZE): number {
  const size = pageSize > 0 ? pageSize : INBOX_PAGE_SIZE;
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

export function sliceInboxPage<T>(rows: T[], page: number, pageSize = INBOX_PAGE_SIZE): T[] {
  const size = pageSize > 0 ? pageSize : INBOX_PAGE_SIZE;
  const safePage = Math.min(Math.max(0, page), inboxPageCount(rows.length, size) - 1);
  const start = safePage * size;
  return rows.slice(start, start + size);
}

export function InboxPager({
  page,
  total,
  onPageChange,
  pageSize = INBOX_PAGE_SIZE,
  onPageSizeChange,
  pageSizeLabel = "Conversations per page",
  label = "Inbox pages",
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeLabel?: string;
  label?: string;
}) {
  if (total <= 0) return null;
  const pageCount = inboxPageCount(total, pageSize);
  const safePage = Math.min(Math.max(0, page), pageCount - 1);

  return (
    <nav aria-label={label} className="flex shrink-0 items-center justify-between gap-2 pt-1">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        disabled={safePage <= 0}
        aria-label="Previous page"
        onClick={() => onPageChange(safePage - 1)}
      >
        <ChevronLeft />
      </Button>
      <div className="flex min-w-0 items-center justify-center gap-2">
        <p className="text-caption text-text-muted m-0 tabular-nums" aria-live="polite">
          Page {safePage + 1} of {pageCount}
        </p>
        {onPageSizeChange ? (
          <label className="text-caption text-text-muted flex items-center gap-1">
            <span>Per page</span>
            <select
              aria-label={pageSizeLabel}
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="text-caption text-text-primary h-8 rounded-[var(--radius-field)] border border-border bg-surface px-1"
            >
              {INBOX_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        disabled={safePage >= pageCount - 1}
        aria-label="Next page"
        onClick={() => onPageChange(safePage + 1)}
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}
