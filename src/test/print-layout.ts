import type { PrintLayoutCheck, ProductionItem } from "@/lib/api/types";

const A4 = { optionId: "opt_a4", label: "A4", widthMilli: 210000, heightMilli: 297000, pageSize: "A4" };
const A3 = { optionId: "opt_a3", label: "A3", widthMilli: 297000, heightMilli: 420000, pageSize: "A3" };

/** An A3 drawing checked against A4 paper, as the contract's example. */
export function layoutCheck(overrides: Partial<PrintLayoutCheck> = {}): PrintLayoutCheck {
  return {
    supportedLayouts: ["fit_to_paper", "actual_size_centered"],
    layout: "actual_size_centered",
    paper: A4,
    files: [
      {
        fileId: "file_1",
        page: {
          widthMilli: 297000,
          heightMilli: 420000,
          pageSize: "A3",
          orientation: "portrait",
          largestShortSideMilli: 297000,
          largestLongSideMilli: 420000,
          mixedPageSizes: false,
        },
        exceedsPaper: true,
      },
    ],
    exceedsPaper: true,
    cutOff: true,
    scaleChanges: false,
    suggestedPaper: A3,
    unknown: [],
    ...overrides,
  };
}

export function layoutLine(overrides: Partial<ProductionItem> = {}): ProductionItem {
  return {
    id: "line_1",
    itemName: "Floor plans",
    quantity: 2,
    measurement: null,
    options: [{ groupName: "Paper size", label: "A4" }],
    printLayout: "actual_size_centered",
    printLayoutCheck: layoutCheck(),
    ...overrides,
  };
}
