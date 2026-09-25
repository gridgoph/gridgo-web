import type { TrackerBoard, TrackerItem } from "@/lib/api/types";

/** A small sheet shaped like GET /admin/tracker: four sections, four statuses. */
export function trackerItem(overrides: Partial<TrackerItem> & Pick<TrackerItem, "key">): TrackerItem {
  const [repo, number] = overrides.key.split("#");
  return {
    repo: repo!,
    number: Number(number),
    url: `https://github.com/gridgoph/${repo}/issues/${number}`,
    section: "general",
    order: 1,
    ref: "1.0",
    module: "Dashboard, API",
    developer: "Mark",
    requirement: "A requirement",
    category: "Feature/Change Request",
    status: "open",
    statusSource: "derived",
    decisions: [],
    ...overrides,
  };
}

export const liveItem = trackerItem({
  key: "gridgo-web#50",
  section: "general",
  order: 1,
  ref: "1.0",
  requirement: "Real-time order updates in Operations without a manual refresh",
  category: "Bug/Issue/Concern",
  status: "live",
});

export const decisionItem = trackerItem({
  key: "gridgo-client#41",
  section: "step-01",
  order: 1,
  ref: "4.0",
  module: "Client app",
  developer: "Ven",
  requirement: "Business clients sign up with a company name and TIN",
  status: "needs-decision",
  statusSource: "explicit",
  decisions: [
    {
      id: "dec_1",
      text: "Ask for the TIN only when they request an official receipt.",
      attachments: [
        { id: "file_old_png", name: "receipt-sample.png", contentType: "image/png", size: 204800 },
        { id: "file_old_pdf", name: "bir-rules.pdf", contentType: "application/pdf", size: 1048576 },
      ],
      decidedBy: { id: "user_captain", name: "Captain Reyes" },
      decidedAt: "2026-09-20T02:30:00.000Z",
    },
  ],
});

export const openItem = trackerItem({
  key: "gridgo-api#77",
  section: "step-08",
  order: 2,
  ref: "31.0",
  module: "API",
  developer: "Mark",
  requirement: "Release supplier payouts in three parts",
  status: "open",
});

export const blockedItem = trackerItem({
  key: "gridgo-supplier#12",
  section: "supplier",
  order: 1,
  ref: "2.1",
  module: "Supplier app",
  developer: "Ven",
  requirement: "Publish the supplier app on the Play Store",
  category: "Bug/Issue/Concern",
  status: "blocked",
});

export function trackerBoard(items: TrackerItem[] = [liveItem, decisionItem, openItem, blockedItem]): TrackerBoard {
  return { fetchedAt: "2026-09-25T05:00:00.000Z", items };
}
