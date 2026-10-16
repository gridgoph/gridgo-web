import { describe, expect, it } from "vitest";

import {
  fitScalePercent,
  layoutItems,
  layoutLabel,
  layoutSpec,
  layoutsLine,
  paperLine,
  readPrintLayouts,
  sameLayouts,
  ticketLayoutLine,
  toggleLayout,
} from "@/lib/print-layout";
import { layoutCheck, layoutLine } from "@/test/print-layout";

describe("print layout words", () => {
  it("uses the customer app's labels, and tidies a code this build does not know", () => {
    expect(layoutLabel("fit_to_paper")).toBe("Fit to paper");
    expect(layoutLabel("actual_size_centered")).toBe("Actual size, centred");
    expect(layoutLabel("actual_size_original_position")).toBe(
      "Actual size, in its original position",
    );
    expect(layoutLabel("tile_across_pages")).toBe("Tile across pages");
  });

  it("reads a listing's set in the canonical order, and null from an older API", () => {
    expect(readPrintLayouts(["actual_size_centered", "fit_to_paper", "fit_to_paper", "x"])).toEqual([
      "fit_to_paper",
      "actual_size_centered",
    ]);
    expect(readPrintLayouts([])).toEqual([]);
    expect(readPrintLayouts(undefined)).toBeNull();
  });

  it("toggles in the canonical order and compares sets whatever their order", () => {
    expect(toggleLayout(["actual_size_centered"], "fit_to_paper")).toEqual([
      "fit_to_paper",
      "actual_size_centered",
    ]);
    expect(toggleLayout(["fit_to_paper"], "fit_to_paper")).toEqual([]);
    expect(sameLayouts(["actual_size_centered", "fit_to_paper"], ["fit_to_paper", "actual_size_centered"])).toBe(true);
    expect(sameLayouts(null, [])).toBe(true);
    expect(sameLayouts(["fit_to_paper"], [])).toBe(false);
    expect(layoutsLine([])).toBe("None: clients are not asked");
    expect(layoutsLine(["actual_size_centered", "fit_to_paper"])).toBe(
      "Fit to paper; Actual size, centred",
    );
  });

  it("names a paper once, with its size", () => {
    expect(paperLine({ optionId: "o", label: "A4", widthMilli: 210000, heightMilli: 297000, pageSize: "A4" })).toBe(
      "A4, 210 × 297 mm",
    );
    expect(
      paperLine({ optionId: "o", label: "24 x 36 in", widthMilli: 609600, heightMilli: 914400, pageSize: null }),
    ).toBe("24 x 36 in (610 × 914 mm)");
  });
});

describe("the agreed layout on an order line", () => {
  it("says an actual-size page bigger than the paper is cut off, and which paper fits", () => {
    const spec = layoutSpec(layoutLine())!;
    expect(spec.label).toBe("Actual size, centred");
    expect(spec.press).toBe("Print at 100%, centred on the paper.");
    expect(spec.paper).toBe("A4, 210 × 297 mm");
    expect(spec.page).toBe("A3, 297 × 420 mm");
    expect(spec.outcome).toEqual({
      tone: "warning",
      text: "The client's A3 page is bigger than A4, so its edges past the paper are cut off. The client was told before ordering.",
    });
    expect(spec.suggestion).toBe("A3 would have printed it whole.");
  });

  it("names the far edges for the original position", () => {
    const spec = layoutSpec(
      layoutLine({
        printLayout: "actual_size_original_position",
        printLayoutCheck: layoutCheck({ layout: "actual_size_original_position" }),
      }),
    )!;
    expect(spec.outcome?.text).toContain("its right and bottom edges past the paper are cut off");
  });

  it("says Fit to paper changes the drawing scale, and by how much", () => {
    const spec = layoutSpec(
      layoutLine({
        printLayout: "fit_to_paper",
        printLayoutCheck: layoutCheck({ layout: "fit_to_paper", cutOff: false, scaleChanges: true }),
      }),
    )!;
    expect(spec.outcome).toEqual({
      tone: "warning",
      text: "The drawing scale changes: the client's A3 page is scaled to fit A4 (about 71%). The client was told before ordering.",
    });
    expect(spec.suggestion).toBeNull();
    expect(fitScalePercent({ widthMilli: 210000, heightMilli: 297000 }, null)).toBeNull();
  });

  it("confirms a page that fits, and says when the fit was not checked", () => {
    const fits = layoutSpec(
      layoutLine({
        printLayoutCheck: layoutCheck({ exceedsPaper: false, cutOff: false, suggestedPaper: null }),
      }),
    )!;
    expect(fits.outcome).toEqual({ tone: "success", text: "The page fits on A4 at its real size." });

    const unread = layoutSpec(
      layoutLine({
        printLayoutCheck: layoutCheck({
          files: [{ fileId: "file_1", page: null, exceedsPaper: null }],
          exceedsPaper: null,
          cutOff: null,
          suggestedPaper: null,
          unknown: [{ code: "page_size_unknown", fileId: "file_1" }],
        }),
      }),
    )!;
    expect(unread.page).toBeNull();
    expect(unread.outcome?.tone).toBe("neutral");
    expect(unread.outcome?.text).toMatch(/could not read the page size/);
  });

  it("skips lines without a layout, and puts the outcome on the job ticket", () => {
    const order = {
      productionItems: [
        layoutLine(),
        layoutLine({ id: "line_2", printLayout: null, printLayoutCheck: null }),
      ],
    };
    const items = layoutItems(order);
    expect(items.map(({ item }) => item.id)).toEqual(["line_1"]);
    expect(ticketLayoutLine(items[0].spec, items[0].item)).toBe(
      "Layout: Actual size, centred, cut off on A4",
    );
    expect(layoutItems({ productionItems: undefined })).toEqual([]);
  });
});
