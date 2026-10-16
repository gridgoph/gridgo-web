import { describe, expect, it } from "vitest";

import type { Order, ProductionItem } from "@/lib/api/types";
import {
  ATTACHMENTS_QA_CHECK_LABEL,
  attachmentCountLine,
  attachmentFileEvidence,
  attachmentGroups,
  describeAttachmentFile,
  fileTypeName,
  freshOrderLink,
  itemAttachments,
  showsAttachmentList,
  type AttachmentFile,
} from "@/lib/artwork-attachments";
import { lineArtworkLinks } from "@/lib/design-links";
import { qaChecksFor } from "@/lib/file-check";

const CANVA = "https://www.canva.com/design/DAG-demo/view";

function line(partial: Partial<ProductionItem> & Pick<ProductionItem, "id">): ProductionItem {
  return { itemName: "Printed T-shirt", quantity: 10, measurement: null, ...partial };
}

const SHIRT = line({
  id: "shirt",
  artworkFileId: "front",
  artworkLinks: [{ formatCode: "canva_link", url: CANVA, label: "Logo design" }],
  artworkAttachments: [
    { kind: "file", fileId: "front", label: "Front", downloadUrl: "https://s/front", downloadUrlExpiresAt: "2026-10-16T00:05:00.000Z" },
    { kind: "file", fileId: "back", label: " Back " },
    { kind: "link", formatCode: "canva_link", url: CANVA, label: "Logo design" },
    { kind: "file", fileId: "logo", label: "Logo PDF" },
  ],
});

const TOTE = line({ id: "tote", itemName: "Tote bag", artworkFileId: "tote", artworkAttachments: [{ kind: "file", fileId: "tote" }] });

function order(items: ProductionItem[]): Pick<Order, "productionItems" | "size"> {
  return { productionItems: items, size: "A4" };
}

describe("itemAttachments", () => {
  it("keeps the client's order and labels, and marks only the first file as main", () => {
    const entries = itemAttachments(SHIRT);
    expect(entries.map((entry) => (entry.kind === "file" ? entry.fileId : entry.link.url))).toEqual([
      "front",
      "back",
      CANVA,
      "logo",
    ]);
    expect(entries.map((entry) => entry.label)).toEqual(["Front", "Back", "Logo design", "Logo PDF"]);
    expect(entries.filter((entry) => entry.kind === "file" && entry.main)).toHaveLength(1);
    expect((entries[0] as AttachmentFile).downloadUrl).toBe("https://s/front");
    expect(entries[2]).toMatchObject({ kind: "link", link: { provider: "canva", label: "Logo design" } });
  });

  it("reads an older line as its one file first, then its links", () => {
    const entries = itemAttachments(
      line({ id: "old", artworkFileId: "flyer", artworkLinks: [{ formatCode: "canva_link", url: CANVA }] }),
    );
    expect(entries).toMatchObject([
      { kind: "file", fileId: "flyer", label: null, main: true },
      { kind: "link", label: null, link: { url: CANVA } },
    ]);
  });

  it("drops repeated and malformed entries", () => {
    const entries = itemAttachments(
      line({
        id: "messy",
        artworkAttachments: [
          { kind: "file", fileId: "a" },
          { kind: "file", fileId: "a", label: "Again" },
          { kind: "file", fileId: "  " },
          { kind: "link", formatCode: "canva_link", url: "" },
          null as never,
          { kind: "link", formatCode: "canva_link", url: CANVA },
          { kind: "link", formatCode: "canva_link", url: CANVA },
        ],
      }),
    );
    expect(entries).toHaveLength(2);
  });
});

describe("when the list is used", () => {
  it("is used for several entries or a label, never for an older one-file order", () => {
    expect(showsAttachmentList(order([SHIRT, TOTE]))).toBe(true);
    expect(showsAttachmentList(order([TOTE]))).toBe(false);
    expect(showsAttachmentList(order([line({ id: "old", artworkFileId: "flyer" })]))).toBe(false);
    expect(
      showsAttachmentList(order([line({ id: "one", artworkAttachments: [{ kind: "file", fileId: "x", label: "Front" }] })])),
    ).toBe(true);
  });

  it("counts files and links per item", () => {
    const [shirt, tote] = attachmentGroups(order([SHIRT, TOTE]));
    expect(attachmentCountLine(shirt.entries)).toBe("3 files · 1 design link");
    expect(attachmentCountLine(tote.entries)).toBe("1 file");
    expect(shirt.productSize).toBe("A4");
  });

  it("asks the GRIDGO Team to check every entry, and keeps the plain artwork check otherwise", () => {
    const base = { artworkFileIds: ["front"], requestFulfillment: null } as unknown as Order;
    expect(qaChecksFor({ ...base, productionItems: [SHIRT] })[0].label).toBe(ATTACHMENTS_QA_CHECK_LABEL);
    expect(qaChecksFor({ ...base, productionItems: [TOTE] })[0].label).toBe(
      "Artwork is print-ready",
    );
  });
});

describe("files", () => {
  it("names the type by contents, then by extension, with the size", () => {
    const pdf = { detectedContentType: "application/pdf", declaredContentType: "application/pdf", originalFilename: "logo.pdf", size: 795834 };
    expect(describeAttachmentFile(pdf)).toBe("PDF · 777 KB");
    expect(fileTypeName({ detectedContentType: null, declaredContentType: "", originalFilename: "cover.psd" })).toBe("PSD");
    expect(fileTypeName({ detectedContentType: null, declaredContentType: "", originalFilename: "noext" })).toBe("File");
  });

  it("uses the order's signed link only while it has time left", () => {
    const entry: AttachmentFile = { kind: "file", fileId: "f", label: null, main: true, downloadUrl: "https://s/f", downloadUrlExpiresAt: "2026-10-16T00:05:00.000Z" };
    expect(freshOrderLink(entry, Date.parse("2026-10-16T00:00:00.000Z"))).toBe("https://s/f");
    expect(freshOrderLink(entry, Date.parse("2026-10-16T00:04:45.000Z"))).toBeNull();
    expect(freshOrderLink({ ...entry, downloadUrlExpiresAt: undefined })).toBeNull();
  });

  it("offers every file on the shop's lines as a download choice, by label and item", () => {
    expect(attachmentFileEvidence(order([SHIRT, TOTE])).map((item) => item.label)).toEqual([
      "Front · Printed T-shirt",
      "Back · Printed T-shirt",
      "Logo PDF · Printed T-shirt",
      "Artwork · Tote bag",
    ]);
  });
});

describe("design links", () => {
  it("reads links from the attachments so they keep their label", () => {
    expect(lineArtworkLinks(SHIRT)).toEqual([{ formatCode: "canva_link", url: CANVA, label: "Logo design" }]);
    expect(lineArtworkLinks(line({ id: "old", artworkLinks: [{ formatCode: "canva_link", url: CANVA }] }))).toEqual([
      { formatCode: "canva_link", url: CANVA },
    ]);
  });
});
