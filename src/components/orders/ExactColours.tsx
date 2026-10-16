"use client";

/**
 * The client's exact colours, as part of the agreed spec (gridgo-client#249,
 * contract gridgo-api `docs/EXACT_COLOURS_API.md`): each colour's label, its
 * value as text and a chip that says how far its swatch can be trusted, then
 * the colours GRIDGO read from each uploaded file so the shop or the GRIDGO
 * Team can hold one against the other. A colour a file states exactly is
 * marked with the file's name. The shop app draws the same block
 * (gridgo-supplier `components/ExactColoursSpec.tsx`).
 *
 * Renders nothing when no line carries colours, so an order without them
 * looks exactly as it did.
 */

import { CircleCheck, FileQuestion, Info } from "lucide-react";
import { useEffect, useState } from "react";

import { getFile } from "@/lib/api/client";
import type { Order, ProductionItem } from "@/lib/api/types";
import {
  artworkColorDetail,
  artworkColorLabel,
  artworkColorsView,
  colorFileNamer,
  colorTargetsOf,
  fileLabels,
  foundLine,
  itemsWithColours,
  screenPrintNote,
  swatchKind,
  swatchNote,
  swatchStrip,
  targetFoundIn,
  type ArtworkColorsEntry,
  type ColorTarget,
  type ColourAudience,
} from "@/lib/color-targets";
import { cn } from "@/lib/utils";

/** Enough to compare against a handful of brand colours without a wall of chips. */
const SHOWN = 8;

/**
 * The names files were uploaded with, read once per file. A file that cannot
 * be read stays unnamed, and the caller falls back to its own words for it.
 */
export function useUploadedNames(fileIds: readonly string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = fileIds.join(" ");
  useEffect(() => {
    let current = true;
    for (const fileId of key ? key.split(" ") : []) {
      getFile(fileId).then(
        (file) => {
          const name = file.originalFilename?.trim();
          if (current && name) {
            setNames((known) => (known[fileId] === name ? known : { ...known, [fileId]: name }));
          }
        },
        () => undefined,
      );
    }
    return () => {
      current = false;
    };
  }, [key]);
  return names;
}

/**
 * One exact colour as a fan-deck chip: the colour on top, the format under
 * it, the way a printer's swatch book is laid out, the same chip the client
 * saw when they named it. An approximate swatch says so in the strip (≈); a
 * Pantone with no swatch is an empty chip struck through, because GRIDGO has
 * no Pantone colours to paint it with. The words beside it say the same, so
 * the chip never carries it alone.
 */
export function ColorChip({
  target,
  compact = false,
}: {
  target: Pick<ColorTarget, "format" | "swatchHex" | "swatchApproximate">;
  /** The job ticket's small chip: the swatch only, no format strip. */
  compact?: boolean;
}) {
  const none = swatchKind(target) === "none";
  return (
    <span
      aria-hidden
      data-testid="color-chip"
      data-swatch={swatchKind(target)}
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border border-outline bg-surface",
        compact ? "h-5 w-5 rounded-[4px]" : "h-16 w-14 rounded-[6px]",
      )}
    >
      <span
        className={cn(
          "relative block",
          compact ? "h-full" : "h-11 border-b border-outline-subtle",
          none && "bg-surface-variant",
        )}
        // The client's colour is data, not a theme token.
        style={none ? undefined : { backgroundColor: target.swatchHex ?? undefined }}
      >
        {none ? (
          <svg
            className="absolute inset-0 h-full w-full text-text-muted"
            viewBox="0 0 56 44"
            preserveAspectRatio="none"
          >
            <line
              x1={4}
              y1={40}
              x2={52}
              y2={4}
              stroke="currentColor"
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
      </span>
      {compact ? null : (
        <span className="flex flex-1 items-center justify-center">
          <span className="text-caption text-text-secondary whitespace-nowrap" style={{ fontFamily: "var(--font-medium)" }}>
            {swatchStrip(target)}
          </span>
        </span>
      )}
    </span>
  );
}

/** A colour GRIDGO read from a file: a dot of it, or a ring where the file stated no value. */
export function ColorDot({ hex }: { hex: string | null }) {
  return (
    <span
      aria-hidden
      className="block size-5 shrink-0 rounded-pill border border-outline"
      style={{ backgroundColor: hex ?? "transparent" }}
    />
  );
}

/**
 * Every item's exact colours with the colours read from its files. Item
 * names head each block only when the order has several lines.
 */
export function ExactColoursRecord({
  order,
  audience,
  className,
}: {
  order: Pick<Order, "productionItems">;
  audience: ColourAudience;
  className?: string;
}) {
  const items = itemsWithColours(order);
  const fileIds = items.flatMap(({ read }) => read.map((entry) => entry.fileId));
  const names = useUploadedNames(fileIds);
  if (!items.length) return null;
  const named = (order.productionItems ?? []).length > 1;
  return (
    <div className={cn("@container flex flex-col gap-4", className)} data-testid="exact-colours">
      {items.map(({ item, targets, read }) => (
        <ItemColours
          key={item.id}
          item={item}
          targets={targets}
          read={read}
          heading={named ? `Exact colours, ${item.itemName}` : "Exact colours"}
          name={colorFileNamer(fileLabels(item), (fileId) => names[fileId])}
        />
      ))}
      <ScreenPrintNote audience={audience} />
    </div>
  );
}

function ItemColours({
  item,
  targets,
  read,
  heading,
  name,
}: {
  item: ProductionItem;
  targets: ColorTarget[];
  read: ArtworkColorsEntry[];
  heading: string;
  name: (fileId: string) => string;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={heading} data-item={item.id}>
      <h3 className="text-caption text-text-muted m-0">{heading}</h3>
      <ul className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-3 p-0 @md:grid-cols-2">
        {targets.map((target, index) => (
          <TargetRow
            key={`${index}:${target.label}:${target.value}`}
            target={target}
            found={foundLine(targetFoundIn(target, read), name)}
          />
        ))}
      </ul>
      {read.length ? (
        <div className="flex flex-col gap-3 rounded-field bg-surface-variant p-3">
          <p className="text-caption text-text-muted m-0">Colours GRIDGO read from the files</p>
          {read.map((entry) => (
            <FileColours key={entry.fileId} entry={entry} name={name(entry.fileId)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TargetRow({ target, found }: { target: ColorTarget; found: string | null }) {
  return (
    <li className="flex min-w-0 items-start gap-3">
      <ColorChip target={target} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="text-body text-text-primary break-words"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {target.label}
        </span>
        <span className="text-body text-text-primary break-words tabular-nums">{target.value}</span>
        <span className="text-caption text-text-muted">{swatchNote(target)}</span>
        {found ? (
          <span className="text-caption text-text-secondary flex items-start gap-1.5">
            <CircleCheck size={14} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-success" />
            <span className="min-w-0 break-words">{found}</span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * One file's colours: spot colours by name, the rest by their own values. A
 * file whose colours could not be read says so in a sentence rather than an
 * empty palette, and a partly read file says what was left out.
 */
function FileColours({ entry, name }: { entry: ArtworkColorsEntry; name: string }) {
  const view = artworkColorsView(entry.colors);
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="file-colours">
      <p
        className="text-body text-text-primary m-0 truncate"
        style={{ fontFamily: "var(--font-medium)" }}
        title={name}
      >
        {name}
      </p>
      {view.kind === "unknown" ? (
        <div className="flex items-start gap-2">
          <FileQuestion size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body text-text-secondary">{view.headline}.</span>
            {view.notes.map((note) => (
              <span key={note} className="text-caption text-text-muted">
                {note}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {view.colors.slice(0, SHOWN).map((color, index) => {
              const label = artworkColorLabel(color);
              return (
                <li
                  key={`${index}:${label}`}
                  className="flex min-w-0 items-center gap-2 rounded-pill border border-outline bg-surface py-1 pr-3 pl-1.5"
                >
                  <ColorDot hex={color.hex} />
                  <span className="flex min-w-0 flex-col">
                    <span
                      className="text-caption text-text-primary break-words"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {label}
                    </span>
                    <span className="text-caption text-text-muted">{artworkColorDetail(color)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {view.colors.length > SHOWN ? (
            <span className="text-caption text-text-muted">
              And {view.colors.length - SHOWN} more in this file.
            </span>
          ) : null}
          {view.notes.map((note) => (
            <span key={note} className="text-caption text-text-muted">
              {note}
            </span>
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Only the colours read from the files, item by item, for the GRIDGO Team's
 * comparison table: the table already carries the agreed values, so this is
 * the other half. Nothing for an order without colours.
 */
export function ReadColoursPanel({ order }: { order: Pick<Order, "productionItems"> }) {
  const items = itemsWithColours(order);
  const fileIds = items.flatMap(({ read }) => read.map((entry) => entry.fileId));
  const names = useUploadedNames(fileIds);
  if (!items.length) return null;
  const named = (order.productionItems ?? []).length > 1;
  const withFiles = items.filter(({ read }) => read.length);
  return (
    <div className="flex flex-col gap-2" data-testid="read-colours">
      {withFiles.length ? (
        <div className="flex flex-col gap-3 rounded-field bg-surface-variant p-3">
          <p className="text-caption text-text-muted m-0">Colours GRIDGO read from the files</p>
          {withFiles.map(({ item, read }) => {
            const name = colorFileNamer(fileLabels(item), (fileId) => names[fileId]);
            return read.map((entry) => (
              <FileColours
                key={`${item.id}:${entry.fileId}`}
                entry={entry}
                name={named ? `${name(entry.fileId)}, ${item.itemName}` : name(entry.fileId)}
              />
            ));
          })}
        </div>
      ) : null}
      <ScreenPrintNote audience="staff" />
    </div>
  );
}

export function ScreenPrintNote({ audience }: { audience: ColourAudience }) {
  return (
    <p className="text-caption text-text-secondary m-0 flex items-start gap-2">
      <Info size={14} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-info" />
      <span className="min-w-0">{screenPrintNote(audience)}</span>
    </p>
  );
}

/**
 * The job ticket's line: each agreed colour as a small swatch and its value,
 * so the finished photos can be held against them. Nothing for a line
 * without colours.
 */
export function TicketColours({ item }: { item: ProductionItem }) {
  const targets = colorTargetsOf(item);
  if (!targets.length) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Exact colours">
      {targets.map((target, index) => (
        <li key={`${index}:${target.value}`} className="flex min-w-0 items-center gap-2">
          <ColorChip target={target} compact />
          <span className="text-caption text-text-secondary min-w-0 break-words">
            {target.label}: <span className="text-text-primary">{target.value}</span>
            <span className="text-text-muted"> ({swatchNote(target)})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
