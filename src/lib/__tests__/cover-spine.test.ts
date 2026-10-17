import { describe, expect, it } from "vitest";

import type { Order } from "@/lib/api/types";
import {
  coverFileOf,
  coverRecordLabel,
  coverSpineComparisonRows,
  coverSpineItems,
  spineLines,
  spineSummaryOf,
} from "@/lib/cover-spine";
import { givenCoverSpine, hardboundLine, NOT_GIVEN_RECORD } from "@/test/cover-spine";

const order = (productionItems: Order["productionItems"]) => ({ productionItems });

describe("cover and spine", () => {
  it("names each cover as a record, and an unknown one without breaking", () => {
    expect(coverRecordLabel("first_page")).toBe("First page of the file");
    expect(coverRecordLabel("separate_file")).toBe("Separate cover page");
    expect(coverRecordLabel("text_only")).toBe("Plain cover, text only");
    expect(coverRecordLabel("embossed")).toBe("As agreed with the shop");
  });

  it("letters the spine top to bottom and skips an empty institution code", () => {
    expect(spineLines(givenCoverSpine()).map((line) => line.text)).toEqual([
      "ABC-CS",
      "Flood Risk Mapping of a River Basin",
      "Sample Author",
      "October 2026",
    ]);
    const bare = givenCoverSpine({
      spine: { institutionCode: null, title: "A Study", author: "Sample Author", month: 3, year: 2027 },
      spineDate: null,
      spineSummary: null,
    });
    expect(spineSummaryOf(bare)).toBe("A Study | Sample Author | March 2027");
  });

  it("finds the cover page among the line's artwork, and not once it is gone", () => {
    const line = hardboundLine();
    expect(coverFileOf(line, line.coverSpine!)).toMatchObject({
      fileId: "file_cover",
      downloadUrl: "https://files.test/cover",
    });
    const gone = hardboundLine({ artworkAttachments: [{ kind: "file", fileId: "file_body" }] });
    expect(coverFileOf(gone, gone.coverSpine!)).toBeNull();
    const firstPage = hardboundLine({ coverSpine: givenCoverSpine({ cover: "first_page", coverFileId: null }) });
    expect(coverFileOf(firstPage, firstPage.coverSpine!)).toBeNull();
  });

  it("adds cover and spine rows to the comparison, named per item on a longer order", () => {
    expect(coverSpineComparisonRows(order([hardboundLine()]))).toEqual([
      {
        item: "Cover",
        ordered: "Separate cover page",
        file: "Cover page on file",
        match: "Check by eye",
        coverFile: expect.objectContaining({ fileId: "file_cover" }),
      },
      {
        item: "Spine",
        ordered: "ABC-CS | Flood Risk Mapping of a River Basin | Sample Author | October 2026",
        file: "Lettered by the shop",
        match: "Check by eye",
      },
    ]);
    const rows = coverSpineComparisonRows(
      order([
        hardboundLine({ coverSpine: NOT_GIVEN_RECORD }),
        hardboundLine({ id: "line_2", itemName: "Flyers", coverSpine: null }),
      ]),
    );
    expect(rows).toEqual([
      {
        item: "Cover and spine, Thesis, hardbound",
        ordered: "Not given",
        file: "The shop asks the client",
        match: "Check by eye",
      },
    ]);
  });

  it("finds nothing on other products and older orders", () => {
    expect(coverSpineItems(order([hardboundLine({ coverSpine: null })]))).toEqual([]);
    expect(coverSpineItems(order([hardboundLine({ coverSpine: undefined })]))).toEqual([]);
    expect(coverSpineComparisonRows(order(undefined))).toEqual([]);
  });
});
