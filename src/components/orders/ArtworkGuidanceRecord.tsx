/**
 * What each uploaded file measured against its product type at checkout, and
 * which warnings the client accepted (gridgo-client#242; contract gridgo-api
 * docs/ARTWORK_GUIDANCE_API.md, "Order line record").
 *
 * The record is frozen when the order is placed, so a later settings change
 * never rewrites it. The GRIDGO Team reads it at the quality check, before
 * passing a file, and again when a claim comes in: a print that is soft or
 * off-colour because of an accepted warning is not the shop's fault. The shop
 * reads the same record on its released job.
 *
 * Renders nothing when no line carries a record (older orders, design links
 * only), so a caller keeps its own layout.
 */

import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";

import type {
  ArtworkGuidanceFile,
  ArtworkGuidanceRecord as GuidanceRecord,
  ArtworkGuidanceWarning,
  Order,
  ProductionItem,
} from "@/lib/api/types";
import {
  acceptanceLine,
  colorModeLabel,
  countsLine,
  dpiReach,
  guidanceItems,
  orderGuidanceCounts,
  orderedSizeLabel,
  recordCounts,
  warningLine,
  warningTitle,
  type GuidanceCounts,
} from "@/lib/artwork-guidance";
import { formatDateTime } from "@/lib/format";
import { StatusChip } from "@/components/ui/StatusChip";
import { cn } from "@/lib/utils";

type Audience = "staff" | "shop";

export function ArtworkGuidanceRecord({
  order,
  audience,
  className,
}: {
  order: Pick<Order, "productionItems">;
  audience: Audience;
  className?: string;
}) {
  const items = guidanceItems(order);
  if (!items.length) return null;
  const named = (order.productionItems ?? []).length > 1;
  return (
    <div className={cn("flex flex-col gap-3", className)} data-testid="artwork-guidance-record">
      {items.map(({ item, record }) => (
        <ItemRecord
          key={item.id}
          item={item}
          record={record}
          named={named}
        />
      ))}
      <p className="text-caption text-text-muted m-0">
        {audience === "staff"
          ? "Recorded when the client checked out; later changes to the targets do not change it. A print that is soft or off-colour because of a warning the client accepted is not the shop's fault."
          : "Recorded when the client checked out. If a warning was accepted, the client chose to print from this file."}
      </p>
    </div>
  );
}

/** The queue row's one line: how many warnings, how many the client accepted. */
export function ArtworkGuidanceCountChip({ order }: { order: Pick<Order, "productionItems"> }) {
  const counts = orderGuidanceCounts(order);
  if (!counts || !counts.warnings) return null;
  return <CountChip counts={counts} />;
}

function CountChip({ counts }: { counts: GuidanceCounts }) {
  if (!counts.warnings) {
    return <StatusChip tone="success" icon="circle-check" label="Meets its targets" />;
  }
  return (
    <StatusChip
      tone={counts.open ? "warning" : "neutral"}
      icon="triangle-alert"
      label={countsLine(counts)}
    />
  );
}

function ItemRecord({
  item,
  record,
  named,
}: {
  item: ProductionItem;
  record: GuidanceRecord;
  named: boolean;
}) {
  const size = orderedSizeLabel(record.orderedSize);
  const several = record.files.length > 1;
  return (
    <section
      className="flex flex-col gap-2 rounded-card border border-outline p-3"
      aria-label={named ? `Artwork check, ${item.itemName}` : "Artwork check"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-body font-medium text-text-primary m-0">
            {named ? `Artwork check · ${item.itemName}` : "Artwork check"}
          </h3>
          <span className="text-caption text-text-secondary">
            Target:{" "}
            {record.minimumDpi === null
              ? "no resolution check"
              : `${record.minimumDpi} DPI at the ordered size`}
            , {record.acceptsRgb ? "RGB accepted" : "expects CMYK"}
          </span>
          <span className="text-caption text-text-secondary">
            {size ? `Ordered size ${size}` : "No size on the order, so resolution was not judged"}
          </span>
        </div>
        <CountChip counts={recordCounts(record)} />
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {record.files.map((file, index) => (
          <FileRecord
            key={file.fileId}
            file={file}
            label={fileLabel(item, file, index, several)}
            record={record}
            hasSize={Boolean(size)}
          />
        ))}
      </ul>
      <span className="text-caption text-text-muted">
        Checked {formatDateTime(record.evaluatedAt)}
      </span>
    </section>
  );
}

function fileLabel(
  item: ProductionItem,
  file: ArtworkGuidanceFile,
  index: number,
  several: boolean,
): string {
  const attachment = (item.artworkAttachments ?? []).find(
    (entry) => entry.kind === "file" && entry.fileId === file.fileId,
  );
  const label = attachment?.label?.trim();
  if (label) return label;
  if (!several) return "Uploaded file";
  return file.fileId === item.artworkFileId ? `File ${index + 1}, main file` : `File ${index + 1}`;
}

function FileRecord({
  file,
  label,
  record,
  hasSize,
}: {
  file: ArtworkGuidanceFile;
  label: string;
  record: GuidanceRecord;
  hasSize: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-card bg-surface-variant p-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-body text-text-primary">{label}</span>
        {file.pixelWidth && file.pixelHeight ? (
          <span className="text-caption text-text-muted">
            {file.pixelWidth} × {file.pixelHeight} px
          </span>
        ) : null}
      </div>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
        <dt className="text-caption text-text-muted">Resolution</dt>
        <dd className="m-0">
          <ResolutionGauge
            effectiveDpi={file.effectiveDpi}
            minimumDpi={record.minimumDpi}
            reason={notJudged(file, record, hasSize)}
          />
        </dd>
        <dt className="text-caption text-text-muted">Colour</dt>
        <dd className="text-body text-text-secondary m-0">{colorModeLabel(file.colorMode)}</dd>
      </dl>
      {file.warnings.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {file.warnings.map((warning) => (
            <WarningRow key={warning.code} warning={warning} />
          ))}
        </ul>
      ) : (
        <span className="text-caption text-success inline-flex items-center gap-1.5">
          <CircleCheck size={14} aria-hidden />
          No warning on this file
        </span>
      )}
    </li>
  );
}

function notJudged(
  file: ArtworkGuidanceFile,
  record: GuidanceRecord,
  hasSize: boolean,
): string | null {
  if (record.minimumDpi === null) return "Not checked for this product type";
  if (file.effectiveDpi !== null) return null;
  if (!file.pixelWidth || !file.pixelHeight) {
    return "Not judged: the file has no pixel size (a PDF or document)";
  }
  if (!hasSize) return "Not judged: no ordered size";
  return "Not judged";
}

/**
 * The file's resolution at the ordered size as a bar reaching toward the
 * target. Words carry the figures; the bar is the glance.
 */
function ResolutionGauge({
  effectiveDpi,
  minimumDpi,
  reason,
}: {
  effectiveDpi: number | null;
  minimumDpi: number | null;
  reason: string | null;
}) {
  const reach = dpiReach(effectiveDpi, minimumDpi);
  if (reason || reach === null || effectiveDpi === null || minimumDpi === null) {
    return (
      <span className="text-body text-text-secondary">
        {effectiveDpi !== null ? `${effectiveDpi} DPI at the ordered size` : (reason ?? "Not judged")}
      </span>
    );
  }
  const short = effectiveDpi < minimumDpi;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span
        className="relative h-2 w-28 shrink-0 overflow-hidden rounded-pill bg-outline"
        role="img"
        aria-label={`${effectiveDpi} DPI against a target of ${minimumDpi} DPI`}
      >
        <span
          className={cn("absolute inset-y-0 left-0 rounded-pill", short ? "bg-warning" : "bg-success")}
          style={{ width: `${Math.max(4, Math.round(reach * 100))}%` }}
        />
      </span>
      <span className={cn("text-body", short ? "text-text-primary" : "text-text-secondary")}>
        {effectiveDpi} DPI
        <span className="text-text-muted"> of {minimumDpi}</span>
      </span>
    </span>
  );
}

function WarningRow({ warning }: { warning: ArtworkGuidanceWarning }) {
  const accepted = Boolean(warning.acceptedAt);
  return (
    <li
      className={cn(
        "flex flex-col gap-1 rounded-field border bg-surface p-2",
        accepted ? "border-outline" : "border-error",
      )}
      data-testid={`artwork-warning-${warning.code}`}
    >
      <span className="text-body text-text-primary inline-flex items-center gap-1.5">
        <TriangleAlert size={14} aria-hidden className="shrink-0 text-warning" />
        {warningTitle(warning)}
      </span>
      <span className="text-caption text-text-secondary">{warningLine(warning)}</span>
      <span
        className={cn(
          "text-caption inline-flex items-center gap-1.5",
          accepted ? "text-text-primary" : "text-error",
        )}
      >
        {accepted ? (
          <CircleCheck size={14} aria-hidden className="shrink-0 text-success" />
        ) : (
          <CircleX size={14} aria-hidden className="shrink-0" />
        )}
        {acceptanceLine(warning)}
      </span>
    </li>
  );
}
