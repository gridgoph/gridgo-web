/**
 * The cover and spine agreed at checkout on a hardbound line, as part of the
 * agreed spec (gridgo-client#247; contract gridgo-api
 * docs/HARDBOUND_COVER_API.md, "Orders: the agreed spec").
 *
 * How the cover is made, the spine drawn top to bottom the way the shop
 * letters it, and the separate cover page to open when the client sent one.
 * The shop reads it on its job; the GRIDGO Team reads the same record on the
 * order workspace and at the file check. A line whose product asked and was
 * given nothing reads "Not given".
 *
 * Renders nothing when no line carries a record (other products, older
 * orders), so a caller keeps its own layout.
 */

"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getFileDownloadUrl } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import {
  NOT_GIVEN,
  coverFileOf,
  coverRecordLabel,
  coverSpineItems,
  isGiven,
  spineLines,
  spineSummaryOf,
  type CoverFile,
  type GivenCoverSpine,
} from "@/lib/cover-spine";
import { cn } from "@/lib/utils";

type Audience = "staff" | "shop";

const NOT_GIVEN_NOTE: Record<Audience, string> = {
  staff: "The client gave no cover or spine details. The shop asks the client.",
  shop: "The client gave no cover or spine details. Ask the client before binding.",
};

export function CoverSpineRecord({
  order,
  audience,
  className,
}: {
  order: Pick<Order, "productionItems">;
  audience: Audience;
  className?: string;
}) {
  const items = coverSpineItems(order);
  if (!items.length) return null;
  const named = (order.productionItems ?? []).length > 1;
  return (
    <div className={cn("flex flex-col gap-3", className)} data-testid="cover-spine-record">
      {items.map(({ item, record }) => {
        const title = named ? `Cover and spine · ${item.itemName}` : "Cover and spine";
        return (
          <section
            key={item.id}
            aria-label={title}
            className="flex flex-col gap-2.5 rounded-card border border-outline p-3"
          >
            <span className="text-caption text-text-muted">{title}</span>
            {isGiven(record) ? (
              <GivenBlock
                record={record}
                coverFile={coverFileOf(item, record)}
                audience={audience}
              />
            ) : (
              <>
                <span
                  className="text-body-lg text-text-muted"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  {NOT_GIVEN}
                </span>
                <span className="text-body text-text-secondary">
                  {NOT_GIVEN_NOTE[audience]}
                </span>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function GivenBlock({
  record,
  coverFile,
  audience,
}: {
  record: GivenCoverSpine;
  coverFile: ReturnType<typeof coverFileOf>;
  audience: Audience;
}) {
  const lines = spineLines(record);
  return (
    <div className="flex flex-wrap items-start gap-4">
      <SpineDrawing lines={lines.map((line) => line.text)} />
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className="text-caption text-text-muted">Cover</dt>
          <dd className="text-body text-text-primary m-0">{coverRecordLabel(record.cover)}</dd>
          {lines.map((line) => (
            <div key={line.label} className="contents">
              <dt className="text-caption text-text-muted">{line.label}</dt>
              <dd className="text-body text-text-primary m-0 break-words">{line.text}</dd>
            </div>
          ))}
        </dl>
        {record.cover === "text_only" ? (
          <span className="text-caption text-text-secondary">
            The front is lettered with the same details.
          </span>
        ) : null}
        {record.cover === "separate_file" ? (
          coverFile ? (
            <OpenCoverPage file={coverFile} />
          ) : (
            <span className="text-caption text-text-secondary">
              {audience === "shop"
                ? "The cover page is not on this job. Ask the GRIDGO Team."
                : "The cover page is no longer on this order."}
            </span>
          )
        ) : null}
        <span className="text-caption text-text-muted">
          {audience === "shop"
            ? "You work out the cover and spine sizes from the page count."
            : "The shop works out the cover and spine sizes."}
        </span>
        <span className="sr-only">Spine on one line: {spineSummaryOf(record)}</span>
      </div>
    </div>
  );
}

/**
 * The spine standing up, lettered top to bottom as the shop letters it. A
 * picture of the order, not a proof: it is not drawn to size.
 */
function SpineDrawing({ lines }: { lines: string[] }) {
  return (
    <div
      aria-hidden
      className="flex h-56 w-12 shrink-0 items-center justify-center overflow-hidden rounded-field border border-outline bg-surface-variant py-3"
      data-testid="spine-drawing"
    >
      <span
        className="text-caption text-text-primary flex max-h-full items-center gap-3 overflow-hidden whitespace-nowrap [writing-mode:vertical-rl]"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {lines.map((text, index) => (
          <span key={index} className="truncate">
            {text}
          </span>
        ))}
      </span>
    </div>
  );
}

/** A signed link that came with the order, while it still has a moment to run. */
function freshLink(file: CoverFile): string | null {
  if (!file.downloadUrl) return null;
  const expires = file.downloadUrlExpiresAt ? Date.parse(file.downloadUrlExpiresAt) : NaN;
  if (!Number.isFinite(expires) || expires - Date.now() < 30_000) return null;
  return file.downloadUrl;
}

export function OpenCoverPage({ file }: { file: CoverFile }) {
  const [failed, setFailed] = useState(false);

  async function open() {
    setFailed(false);
    // Opened before the link is asked for, so a popup blocker lets it through.
    const tab = window.open("", "_blank");
    try {
      const url = freshLink(file) ?? (await getFileDownloadUrl(file.fileId));
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else window.location.assign(url);
    } catch {
      tab?.close();
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        onClick={() => void open()}
      >
        <ExternalLink aria-hidden />
        Open cover page
      </Button>
      {failed ? (
        <span className="text-caption text-error" role="alert">
          The cover page did not open. Try again.
        </span>
      ) : null}
    </div>
  );
}
