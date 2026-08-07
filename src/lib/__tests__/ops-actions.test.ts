import { describe, expect, it } from "vitest";

import {
  actionsForOps,
  isOpsQueueState,
  primaryOpsAction,
} from "@/lib/ops-actions";

describe("ops queue membership", () => {
  it("includes QA and dispatch follow-up states", () => {
    expect(isOpsQueueState("submitted")).toBe(true);
    expect(isOpsQueueState("needs_qa")).toBe(true);
    expect(isOpsQueueState("ready_for_dispatch")).toBe(true);
    expect(isOpsQueueState("issue_window_open")).toBe(true);
    expect(isOpsQueueState("production")).toBe(false);
    expect(isOpsQueueState("draft")).toBe(false);
  });
});

describe("actionsForOps", () => {
  it("opens QA from submitted", () => {
    expect(primaryOpsAction("submitted")?.targetState).toBe("needs_qa");
  });

  it("offers approve as primary from needs_qa with secondary paths", () => {
    const actions = actionsForOps("needs_qa");
    expect(actions.find((a) => a.primary)?.targetState).toBe(
      "approved_for_matching",
    );
    expect(actions.some((a) => a.targetState === "client_correction")).toBe(
      true,
    );
    expect(actions.filter((a) => a.primary)).toHaveLength(1);
  });

  it("requires supplierId when matching", () => {
    const action = primaryOpsAction("approved_for_matching");
    expect(action?.requires).toBe("supplierId");
  });

  it("assigns rider from ready_for_dispatch", () => {
    expect(primaryOpsAction("ready_for_dispatch")?.requires).toBe("riderId");
  });
});
