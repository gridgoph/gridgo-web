import type { TrackerBoard, TrackerDecisionQuestion, TrackerItem } from "@/lib/api/types";

import sections from "./decision-sections.json";

const decisionSections = sections as Record<
  string,
  { decisionQuestions: TrackerDecisionQuestion[]; decisionMarkdown: string }
>;

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

/**
 * `parseDecisionSection` output from gridgoph/gridgo-api#134 for the real
 * issue bodies in its tests/fixtures/tracker-decisions (#116 has no context;
 * gridgo-client#170's second question has context with a list).
 */
export const questionsItem = trackerItem({
  key: "gridgo-web#116",
  section: "general",
  order: 29,
  ref: "29.0",
  module: "Dashboard, API",
  developer: "Ven",
  requirement: "Per-listing suspension, real account removal, and clearer Accreditation and Roles pages",
  category: "Bug/Issue/Concern",
  status: "needs-decision",
  statusSource: "explicit",
  ...decisionSections["gridgo-web-116"],
});

export const contextItem = trackerItem({
  key: "gridgo-client#170",
  section: "general",
  order: 25,
  ref: "25.0",
  module: "Client app",
  requirement: "Maps, routes and delivery distance: when to move to paid map services",
  status: "needs-decision",
  ...decisionSections["gridgo-client-170"],
});

/** Questions that did not parse: only the raw section is there to read. */
export const markdownOnlyItem = trackerItem({
  key: "gridgo-api#140",
  section: "general",
  order: 30,
  ref: "30.0",
  requirement: "A decision written as prose",
  status: "needs-decision",
  decisionQuestions: [],
  decisionMarkdown:
    "Should refunds wait for the shop's agreement?\n\n- **Yes:** Operations asks the shop first.\n- **No:** Operations decides alone.\n\n*Recommended: yes.* The shop pays for most refunds.",
});
