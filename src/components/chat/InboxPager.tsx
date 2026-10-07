"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export const INBOX_PAGE_SIZE = 8;

export function inboxPageCount(total: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / INBOX_PAGE_SIZE));
}

export function sliceInboxPage<T>(rows: T[], page: number): T[] {
  const safePage = Math.min(Math.max(0, page), inboxPageCount(rows.length) - 1);
  const start = safePage * INBOX_PAGE_SIZE;
  return rows.slice(start, start + INBOX_PAGE_SIZE);
}

export function InboxPager({
  page,
  total,
  onPageChange,
  label = "Inbox pages",
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  if (total <= 0) return null;
  const pageCount = inboxPageCount(total);
  const safePage = Math.min(Math.max(0, page), pageCount - 1);

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-2 pt-1">
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
      <p className="text-caption text-text-muted m-0 tabular-nums" aria-live="polite">
        Page {safePage + 1} of {pageCount}
      </p>
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
