import type { ArtworkColorsRecord, ColorTargetRecord, ProductionItem } from "@/lib/api/types";

/** The four targets the shop app's screenshots use, as GRIDGO normalises them. */
export const MAROON: ColorTargetRecord = {
  label: "School maroon",
  format: "pantone",
  value: "PANTONE 201 C",
  cmyk: null,
  hex: null,
  swatchHex: "#9D2235",
  swatchApproximate: true,
};
export const GOLD: ColorTargetRecord = {
  label: "Crest gold",
  format: "pantone",
  value: "PANTONE 7406 C",
  cmyk: null,
  hex: null,
  swatchHex: null,
  swatchApproximate: null,
};
export const RED: ColorTargetRecord = {
  label: "Brand red",
  format: "cmyk",
  value: "C0 M100 Y65 K34",
  cmyk: { c: 0, m: 100, y: 65, k: 34 },
  hex: null,
  swatchHex: "#A8003B",
  swatchApproximate: true,
};
export const BLUE: ColorTargetRecord = {
  label: "Logo blue",
  format: "hex",
  value: "#1A5FB4",
  cmyk: null,
  hex: "#1A5FB4",
  swatchHex: "#1A5FB4",
  swatchApproximate: false,
};

/** A PDF stating the maroon spot and the red, a PNG with the blue, a JPEG nobody read. */
export const FILE_COLOURS: ArtworkColorsRecord[] = [
  {
    fileId: "file_pdf",
    colors: {
      version: 1,
      status: "partial",
      reasons: ["embedded_images_not_read"],
      colors: [
        { kind: "spot", name: "PANTONE 201 C", space: "cmyk", cmyk: { c: 0, m: 100, y: 63, k: 29 }, hex: "#B5003A", uses: 3, shareBps: null },
        { kind: "process", name: null, space: "cmyk", cmyk: { c: 0, m: 100, y: 65, k: 34 }, hex: "#A8003B", uses: 12, shareBps: null },
      ],
    },
  },
  {
    fileId: "file_png",
    colors: {
      version: 1,
      status: "read",
      reasons: [],
      colors: [{ kind: "pixels", name: null, space: "rgb", cmyk: null, hex: "#1A5FB4", uses: null, shareBps: 4600 }],
    },
  },
  {
    fileId: "file_jpg",
    colors: { version: 1, status: "unknown", reasons: ["not_read_for_this_file_type"], colors: [] },
  },
];

export function colourLine(overrides: Partial<ProductionItem> = {}): ProductionItem {
  return {
    id: "line_1",
    itemName: "Club shirts",
    quantity: 40,
    measurement: null,
    artworkFileId: "file_pdf",
    artworkAttachments: [
      { kind: "file", fileId: "file_pdf", label: "Shirt front" },
      { kind: "file", fileId: "file_png", label: null },
      { kind: "file", fileId: "file_jpg", label: null },
    ],
    colorTargets: [MAROON, RED, BLUE, GOLD],
    artworkColors: FILE_COLOURS,
    ...overrides,
  };
}
