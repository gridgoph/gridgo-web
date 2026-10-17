/**
 * A hardbound book's cover and spine (gridgo-client#247; contract gridgo-api
 * docs/HARDBOUND_COVER_API.md, "Orders: the agreed spec").
 *
 * The client chooses how the cover is made and types what the spine says;
 * checkout freezes both onto the order line. The shop works out the cover and
 * spine dimensions itself, so nothing here measures or sizes anything. The
 * words follow the customer app (gridgo-client `lib/coverSpine.ts`) so the
 * client, the shop and the GRIDGO Team read the same record.
 *
 * A line whose product does not ask carries `null` and shows nothing. A line
 * whose product asks but the client gave nothing reads "Not given": the shop
 * asks the client then.
 */

import type { CoverSpineRecord, Order, ProductionItem } from "@/lib/api/types";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type GivenCoverSpine = Extract<CoverSpineRecord, { status: "given" }>;

export const NOT_GIVEN = "Not given";

export function isGiven(
  record: CoverSpineRecord | null | undefined,
): record is GivenCoverSpine {
  return record?.status === "given" && record.spine != null;
}

/** How the cover was made, said as a record rather than a choice. */
export function coverRecordLabel(cover: string | null | undefined): string {
  switch (cover) {
    case "first_page":
      return "First page of the file";
    case "separate_file":
      return "Separate cover page";
    case "text_only":
      return "Plain cover, text only";
    default:
      return "As agreed with the shop";
  }
}

/** "October 2026": the API's `spineDate`, else built from the month and year. */
export function spineDateOf(record: GivenCoverSpine): string {
  const given = record.spineDate?.trim();
  if (given) return given;
  const month = MONTH_NAMES[record.spine.month - 1];
  return month ? `${month} ${record.spine.year}` : String(record.spine.year);
}

/** The spine top to bottom, the way the shop letters it; an empty code is skipped. */
export function spineLines(record: GivenCoverSpine): { label: string; text: string }[] {
  const lines: { label: string; text: string }[] = [];
  const code = record.spine.institutionCode?.trim();
  if (code) lines.push({ label: "Institution code", text: code });
  lines.push({ label: "Title", text: record.spine.title });
  lines.push({ label: "Author", text: record.spine.author });
  lines.push({ label: "Month and year", text: spineDateOf(record) });
  return lines;
}

/** The spine on one line, for lists and tables: GRIDGO's `spineSummary`. */
export function spineSummaryOf(record: GivenCoverSpine): string {
  return (
    record.spineSummary?.trim() ||
    spineLines(record)
      .map((line) => line.text)
      .join(" | ")
  );
}

/** The lines whose product asks for a cover and spine, in order. */
export function coverSpineItems(
  order: Pick<Order, "productionItems">,
): { item: ProductionItem; record: CoverSpineRecord }[] {
  return (order.productionItems ?? []).flatMap((item) =>
    item.coverSpine ? [{ item, record: item.coverSpine }] : [],
  );
}

export type CoverFile = { fileId: string; downloadUrl?: string; downloadUrlExpiresAt?: string };

/**
 * The separate cover page on the line: the artwork entry with the same file
 * id, signed like the other artwork. `null` for the other covers, or when the
 * file is no longer on the line.
 */
export function coverFileOf(
  item: Pick<ProductionItem, "artworkAttachments" | "artworkFileId">,
  record: CoverSpineRecord,
): CoverFile | null {
  if (!isGiven(record) || record.cover !== "separate_file" || !record.coverFileId) return null;
  const entry = (item.artworkAttachments ?? []).find(
    (attachment) => attachment.kind === "file" && attachment.fileId === record.coverFileId,
  );
  if (entry && entry.kind === "file") {
    return {
      fileId: entry.fileId,
      downloadUrl: entry.downloadUrl,
      downloadUrlExpiresAt: entry.downloadUrlExpiresAt,
    };
  }
  // An older API without `artworkAttachments` still names the file.
  return item.artworkAttachments === undefined ? { fileId: record.coverFileId } : null;
}

export type CoverSpineCompareRow = {
  item: string;
  ordered: string;
  file: string;
  match: "Check by eye";
  /** The separate cover page to open from the File column. */
  coverFile?: CoverFile;
};

/**
 * The cover and spine as rows of the quality check's comparison: what was
 * agreed, held against the file by eye. Nothing for an order without them.
 */
export function coverSpineComparisonRows(
  order: Pick<Order, "productionItems">,
): CoverSpineCompareRow[] {
  const named = (order.productionItems ?? []).length > 1;
  return coverSpineItems(order).flatMap(({ item, record }) => {
    const suffix = named ? `, ${item.itemName}` : "";
    if (!isGiven(record)) {
      return [
        {
          item: `Cover and spine${suffix}`,
          ordered: NOT_GIVEN,
          file: "The shop asks the client",
          match: "Check by eye" as const,
        },
      ];
    }
    const coverFile = coverFileOf(item, record);
    const coverRow: CoverSpineCompareRow = {
      item: `Cover${suffix}`,
      ordered: coverRecordLabel(record.cover),
      file:
        record.cover === "separate_file"
          ? coverFile
            ? "Cover page on file"
            : "Cover page not on the order"
          : record.cover === "first_page"
            ? "Page 1 of the file"
            : "No printed cover",
      match: "Check by eye",
      ...(coverFile ? { coverFile } : {}),
    };
    return [
      coverRow,
      {
        item: `Spine${suffix}`,
        ordered: spineSummaryOf(record),
        file: "Lettered by the shop",
        match: "Check by eye" as const,
      },
    ];
  });
}
