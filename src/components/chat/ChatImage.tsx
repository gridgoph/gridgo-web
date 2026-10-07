"use client";

import { useEffect, useState } from "react";

import { getFileDownloadUrl } from "@/lib/api/client";
import type { SupportChatAttachment } from "@/lib/api/types";

export function ChatImage({
  attachment,
  square = false,
}: {
  attachment: SupportChatAttachment;
  square?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void getFileDownloadUrl(attachment.fileId)
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.fileId]);

  if (failed) {
    return (
      <p className="text-caption text-text-muted m-0">
        {attachment.originalFilename || "Photo could not be opened."}
      </p>
    );
  }
  if (!url) {
    return <p className="text-caption text-text-muted m-0">Loading photo…</p>;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={attachment.originalFilename || "Chat photo"}
        className={
          square
            ? "aspect-square w-full rounded-[var(--radius-field)] object-cover"
            : "max-h-64 max-w-full rounded-[var(--radius-field)] object-contain"
        }
      />
    </a>
  );
}
