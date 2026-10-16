import { describe, expect, it } from "vitest";

import {
  artworkColorDetail,
  artworkColorLabel,
  artworkColorsOf,
  artworkColorsView,
  colorFileNamer,
  colorTargetsOf,
  colourComparisonRows,
  exactColourCount,
  itemsWithColours,
  normalisePantone,
  swatchKind,
  swatchNote,
  swatchStrip,
  targetFoundIn,
} from "@/lib/color-targets";
import { BLUE, FILE_COLOURS, GOLD, MAROON, RED, colourLine } from "@/test/exact-colours";

describe("colorTargetsOf", () => {
  it("reads the normalised targets and skips what it cannot read", () => {
    expect(
      colorTargetsOf({ colorTargets: [MAROON, RED, BLUE, { label: "" }, null, "x"] as never }),
    ).toHaveLength(3);
  });

  it("is empty on an older API and on a line without colours", () => {
    expect(colorTargetsOf({})).toEqual([]);
    expect(colorTargetsOf({ colorTargets: [] })).toEqual([]);
    expect(itemsWithColours({ productionItems: [colourLine({ colorTargets: [] })] })).toEqual([]);
  });

  it("counts the colours across an order's lines", () => {
    expect(
      exactColourCount({
        productionItems: [
          colourLine({ colorTargets: [MAROON, BLUE] }),
          colourLine({ id: "line_2", colorTargets: undefined }),
          colourLine({ id: "line_3", colorTargets: [RED] }),
        ],
      }),
    ).toBe(3);
  });
});

describe("what a swatch may claim", () => {
  it("calls a hex a screen colour, CMYK approximate and a client's Pantone hex theirs", () => {
    expect(swatchKind(BLUE)).toBe("exact");
    expect(swatchNote(BLUE)).toBe("Screen colour");
    expect(swatchStrip(BLUE)).toBe("HEX");
    expect(swatchNote(RED)).toBe("Approximate on screen");
    expect(swatchStrip(RED)).toBe("≈ CMYK");
    expect(swatchNote(MAROON)).toBe("Client's approximate swatch");
    expect(swatchStrip(MAROON)).toBe("≈ PMS");
  });

  it("keeps a Pantone without a hex as text only", () => {
    const [target] = colorTargetsOf({ colorTargets: [GOLD] });
    expect(swatchKind(target)).toBe("none");
    expect(swatchNote(target)).toBe("Pantone code only, no swatch");
    expect(swatchStrip(target)).toBe("PMS");
  });

  it("never paints a swatch from a value that is not a hex", () => {
    const [target] = colorTargetsOf({ colorTargets: [{ ...MAROON, swatchHex: "red" }] });
    expect(target.swatchHex).toBeNull();
    expect(target.swatchApproximate).toBeNull();
  });
});

describe("the colours GRIDGO read from a file", () => {
  it("says a file it could not read in a sentence, never as an empty palette", () => {
    expect(
      artworkColorsView({ status: "unknown", reasons: ["not_read_for_this_file_type"], colors: [] }),
    ).toEqual({
      kind: "unknown",
      headline: "We could not read the colours in this file",
      notes: ["GRIDGO does not read colours from this file type."],
    });
    expect(artworkColorsView(null).kind).toBe("unknown");
    expect(artworkColorsView({ status: "read", reasons: [], colors: [] }).notes).toEqual([
      "GRIDGO could not find colours to list in this file.",
    ]);
  });

  it("lists a partly read file's colours and says what was left out", () => {
    const view = artworkColorsView(FILE_COLOURS[0].colors);
    expect(view.kind).toBe("read");
    expect(view.notes).toEqual(["Pictures placed in the PDF were not read."]);
  });

  it("names spot colours, process colours and a PNG colour's share", () => {
    const [spot, process] = FILE_COLOURS[0].colors!.colors;
    const pixels = FILE_COLOURS[1].colors!.colors[0];
    expect(artworkColorLabel(spot)).toBe("PANTONE 201 C");
    expect(artworkColorDetail(spot)).toBe("Spot colour");
    expect(artworkColorDetail({ ...spot, uses: 0 })).toBe("Spot colour, not used");
    expect(artworkColorLabel(process)).toBe("C0 M100 Y65 K34");
    expect(artworkColorDetail(process)).toBe("CMYK");
    expect(artworkColorLabel(pixels)).toBe("#1A5FB4");
    expect(artworkColorDetail(pixels)).toBe("46% of the image");
    expect(artworkColorDetail({ ...pixels, shareBps: 60 })).toBe("Under 1% of the image");
  });

  it("reads one entry per uploaded file", () => {
    expect(
      artworkColorsOf({
        artworkColors: [
          { fileId: "file_a", colors: { status: "read", reasons: [], colors: [] } },
          { colors: {} },
        ] as never,
      }),
    ).toEqual([{ fileId: "file_a", colors: { status: "read", reasons: [], colors: [] } }]);
  });
});

describe("targetFoundIn", () => {
  const entries = artworkColorsOf({ artworkColors: FILE_COLOURS });

  it("marks a file that states the colour exactly", () => {
    expect(targetFoundIn(MAROON, entries)).toEqual(["file_pdf"]);
    expect(targetFoundIn(RED, entries)).toEqual(["file_pdf"]);
    expect(targetFoundIn(BLUE, entries)).toEqual(["file_png"]);
    expect(targetFoundIn(GOLD, entries)).toEqual([]);
  });

  it("never marks a near colour", () => {
    expect(targetFoundIn({ ...BLUE, value: "#1A5FB5", hex: "#1A5FB5" }, entries)).toEqual([]);
    expect(targetFoundIn({ ...RED, cmyk: { c: 0, m: 100, y: 65, k: 35 } }, entries)).toEqual([]);
  });

  it("normalises a Pantone name the way GRIDGO does", () => {
    expect(normalisePantone("pms 201c")).toBe("PANTONE 201 C");
    expect(normalisePantone("PANTONE® warm red c")).toBe("PANTONE Warm Red C");
    expect(normalisePantone("18-1663tpx")).toBe("PANTONE 18-1663 TPX");
  });
});

describe("colorFileNamer", () => {
  it("prefers the client's label, then the uploaded name, then its place", () => {
    const name = colorFileNamer(
      [
        { fileId: "file_a", label: "Front" },
        { fileId: "file_b", label: null },
        { fileId: "file_c", label: null },
      ],
      (fileId) => (fileId === "file_b" ? "logo.png" : null),
    );
    expect(name("file_a")).toBe("Front");
    expect(name("file_b")).toBe("logo.png");
    expect(name("file_c")).toBe("File 3");
  });

  it("calls a single unnamed file the client's file", () => {
    expect(colorFileNamer([{ fileId: "file_a", label: null }], () => null)("file_a")).toBe(
      "The client's file",
    );
  });
});

describe("colourComparisonRows", () => {
  it("adds one row per agreed colour, a match only where a file states it exactly", () => {
    const rows = colourComparisonRows({ productionItems: [colourLine()] }, (fileId) =>
      fileId === "file_png" ? "logo.png" : null,
    );
    expect(rows.map(({ item, ordered, file, match }) => [item, ordered, file, match])).toEqual([
      ["Colour: School maroon", "PANTONE 201 C", "In Shirt front", "Match"],
      ["Colour: Brand red", "C0 M100 Y65 K34", "In Shirt front", "Match"],
      ["Colour: Logo blue", "#1A5FB4", "In logo.png", "Match"],
      ["Colour: Crest gold", "PANTONE 7406 C", "Not stated exactly in the file", "Check by eye"],
    ]);
  });

  it("never calls a colour different, and says when no file was read", () => {
    const unread = colourComparisonRows(
      { productionItems: [colourLine({ artworkColors: [FILE_COLOURS[2]] })] },
      () => null,
    );
    expect(unread.every((row) => row.match === "Check by eye")).toBe(true);
    expect(unread[0].file).toBe("Colours not read from the file");
    const linkOnly = colourComparisonRows(
      { productionItems: [colourLine({ artworkColors: [], artworkAttachments: [] })] },
      () => null,
    );
    expect(linkOnly[0].file).toBe("No uploaded file to read");
  });

  it("names the line on an order with several, and adds nothing without colours", () => {
    const rows = colourComparisonRows(
      {
        productionItems: [
          colourLine({ colorTargets: [BLUE] }),
          colourLine({ id: "line_2", itemName: "Flyers", colorTargets: [] }),
        ],
      },
      () => null,
    );
    expect(rows.map((row) => row.item)).toEqual(["Colour: Logo blue, Club shirts"]);
    expect(colourComparisonRows({ productionItems: [colourLine({ colorTargets: [] })] }, () => null)).toEqual([]);
  });
});
