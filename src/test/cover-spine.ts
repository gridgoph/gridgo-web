import type { CoverSpineRecord, ProductionItem } from "@/lib/api/types";

/** The contract's example: a thesis with its own cover page. */
type Given = Extract<CoverSpineRecord, { status: "given" }>;

export function givenCoverSpine(overrides: Partial<Given> = {}): Given {
  return {
    status: "given",
    cover: "separate_file",
    coverFileId: "file_cover",
    spine: {
      institutionCode: "ABC-CS",
      title: "Flood Risk Mapping of a River Basin",
      author: "Sample Author",
      month: 10,
      year: 2026,
    },
    spineDate: "October 2026",
    spineSummary: "ABC-CS | Flood Risk Mapping of a River Basin | Sample Author | October 2026",
    ...overrides,
  };
}

export const NOT_GIVEN_RECORD: CoverSpineRecord = {
  status: "not_given",
  cover: null,
  coverFileId: null,
  spine: null,
  spineDate: null,
  spineSummary: null,
};

export function hardboundLine(overrides: Partial<ProductionItem> = {}): ProductionItem {
  return {
    id: "line_1",
    itemName: "Thesis, hardbound",
    quantity: 3,
    measurement: null,
    artworkFileId: "file_body",
    artworkLinks: [],
    artworkAttachments: [
      { kind: "file", fileId: "file_body", label: null },
      {
        kind: "file",
        fileId: "file_cover",
        label: "Cover",
        downloadUrl: "https://files.test/cover",
        downloadUrlExpiresAt: "2999-01-01T00:00:00.000Z",
      },
    ],
    coverSpine: givenCoverSpine(),
    ...overrides,
  };
}
