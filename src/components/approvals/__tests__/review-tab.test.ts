import { describe, expect, it } from "vitest";

import { reviewQueueTab } from "@/components/approvals/review-tab";

describe("reviewQueueTab", () => {
  it("opens the service queue only when the inbox asked for it", () => {
    expect(reviewQueueTab(new URLSearchParams("tab=services"))).toBe("services");
    expect(reviewQueueTab(new URLSearchParams("tab=signups"))).toBe("signups");
    expect(reviewQueueTab(new URLSearchParams())).toBe("signups");
  });
});
