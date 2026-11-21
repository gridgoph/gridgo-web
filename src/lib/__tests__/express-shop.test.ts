// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import {
  alreadyPaidAtCounter,
  counterCodeDigits,
  counterCodeOutcome,
  downloadedFileIds,
  expressNeedsRegularSteps,
  expressReadySteps,
  expressStage,
  fileAccessJobId,
  formatOfferClock,
  offerSecondsLeft,
  paymentLine,
  printChips,
  settingsLine,
  shortcutAllowed,
  todoTitle,
  viewerBlobType,
  viewerKind,
  workLine,
} from "@/lib/express-shop";

function express(over: Partial<Order> = {}): Order {
  return {
    id: "ord_3ff0128e105a",
    title: "Document printing",
    state: "supplier_assigned",
    orderType: "express",
    fulfillmentMode: "pickup",
    paymentMethod: "qr_manual",
    shopAcceptance: {
      supplierId: "shop_1",
      assignedAt: "2026-11-22T05:00:00.000Z",
      deadlineAt: "2026-11-22T05:05:00.000Z",
      workingMinutes: 5,
      status: "pending",
    },
    expressOrder: {
      status: "sending",
      acceptBy: "2026-11-22T05:05:00.000Z",
      printSettings: [
        { fileId: "file_a", pages: { printed: 12, total: 12 }, copies: 2, paper: "a4", colour: "bw", sides: "one", layout: "fit_to_paper", note: "Staple top-left" },
      ],
    },
    ...over,
  } as Order;
}

describe("Express job words", () => {
  it("says pages across copies, colour, and paper/sides/copies", () => {
    const order = express();
    expect(workLine(order)).toBe("24 pages · B&W");
    expect(settingsLine(order)).toBe("A4 · 1 side · 2 copies");
    expect(
      printChips({
        fileId: "file_a", pages: 12, range: null, totalPages: 12, copies: 2,
        paper: "a4", colour: "bw", sides: "one", layout: "fit_to_paper", note: "",
      }),
    ).toEqual(["A4", "B&W", "1 side", "2 copies", "Fit to page"]);
  });

  it("falls back to the title when GRIDGO sent no page count", () => {
    const order = express({ expressOrder: { printSettings: [{ fileId: "f", copies: 1 }] } });
    expect(workLine(order)).toBe("Document printing");
  });

  it("names how the client paid, and says don't collect cash only when GRIDGO says so", () => {
    expect(paymentLine(express())).toBe("Paid in app");
    expect(alreadyPaidAtCounter(express())).toBe(true);
    expect(paymentLine(express({ paymentClassification: "voucher" }))).toBe("Paid by voucher");
    expect(alreadyPaidAtCounter(express({ paymentClassification: "cash" }))).toBe(false);
    expect(alreadyPaidAtCounter(express({ paymentMethod: null }))).toBe(false);
    expect(paymentLine(express({ paymentMethod: "mystery" }))).toBeNull();
  });

  it("counts the title", () => {
    expect(todoTitle(0)).toBe("All done for now");
    expect(todoTitle(1)).toBe("1 thing to do");
    expect(todoTitle(3)).toBe("3 things to do");
  });
});

describe("Express stage and clock", () => {
  it("reads offer, working, counter and rider", () => {
    expect(expressStage(express())).toBe("offer");
    expect(expressStage(express({ state: "payment_authorized" }))).toBe("working");
    expect(expressStage(express({ state: "production" }))).toBe("working");
    expect(expressStage(express({ state: "ready_for_dispatch" }))).toBe("counter");
    expect(expressStage(express({ state: "ready_for_dispatch", fulfillmentMode: "delivery" }))).toBe("rider");
    expect(expressStage({ ...express(), orderType: undefined } as Order)).toBeNull();
  });

  it("drops an offer this shop let go", () => {
    const order = express();
    order.shopAcceptance = { ...order.shopAcceptance!, status: "declined" };
    expect(expressStage(order)).toBeNull();
  });

  it("counts down the five minutes and never below zero", () => {
    const order = express();
    expect(offerSecondsLeft(order, new Date("2026-11-22T05:00:48.000Z"))).toBe(252);
    expect(formatOfferClock(252)).toBe("4:12");
    expect(offerSecondsLeft(order, new Date("2026-11-22T06:00:00.000Z"))).toBe(0);
  });
});

describe("It's ready", () => {
  it("sends one step, or the press-then-ready chain on an older API", () => {
    const accepted = express({ state: "payment_authorized" });
    expect(expressReadySteps(accepted, true)).toEqual(["ready_for_dispatch"]);
    expect(expressReadySteps(accepted, false)).toEqual(["production", "ready_for_dispatch"]);
    expect(expressReadySteps(express({ state: "production" }), false)).toEqual(["ready_for_dispatch"]);
    expect(expressReadySteps(express(), true)).toEqual([]);
  });
});

describe("an API that still gates Express like a regular job", () => {
  it("keeps the regular steps once the job is on the press or a shop step is still owed", () => {
    expect(expressNeedsRegularSteps({ state: "payment_authorized" })).toBe(false);
    expect(expressNeedsRegularSteps({ state: "production" })).toBe(true);
    expect(expressNeedsRegularSteps({ state: "supplier_self_qc" })).toBe(true);
    const owed = (code: string) => ({
      state: "payment_authorized",
      transitionReadiness: { ready_for_dispatch: { allowed: false, missing: [{ code, message: "" }] } },
    });
    expect(expressNeedsRegularSteps(owed("production_finished_required") as never)).toBe(true);
    // A hold that is not the shop's step (a claim) does not bring them back.
    expect(expressNeedsRegularSteps(owed("claim_hold_active") as never)).toBe(false);
  });
});

describe("the client's code", () => {
  it("keeps six digits and leading zeroes", () => {
    expect(counterCodeDigits("01 23-45 67")).toBe("012345");
  });

  it("reads wrong and locked codes", () => {
    expect(counterCodeOutcome(new ApiError(409, { error: "express_pickup_code_mismatch" }))).toEqual({ kind: "wrong" });
    const now = new Date("2026-11-22T05:00:00.000Z");
    const locked = counterCodeOutcome(
      new ApiError(429, { error: "express_pickup_attempts_exceeded", retryAfter: "2026-11-22T05:15:00.000Z" }),
      now,
    );
    expect(locked).toEqual({ kind: "locked", until: new Date("2026-11-22T05:15:00.000Z") });
    expect(counterCodeOutcome(new ApiError(409, { error: "payment_required" }))).toEqual({ kind: "unpaid" });
    expect(counterCodeOutcome(new Error("x"))).toEqual({ kind: "other" });
  });
});

describe("files and the delete reminder", () => {
  const rows = [
    { jobId: "job_1", userId: "u", deviceId: "d", fileId: "file_a", action: "opened", firstAt: "2026-11-22T05:00:00Z", lastAt: "2026-11-22T05:00:00Z", count: 1 },
    { jobId: "job_1", userId: "u", deviceId: "d", fileId: "file_b", action: "download_authorized", firstAt: "2026-11-22T05:01:00Z", lastAt: "2026-11-22T05:01:00Z", count: 1 },
  ];

  it("reminds only about files actually downloaded", () => {
    expect(downloadedFileIds({ fileAccesses: rows })).toEqual([]);
    expect(
      downloadedFileIds({
        fileAccesses: [...rows, { ...rows[0], fileId: "file_c", action: "downloaded" }],
      }),
    ).toEqual(["file_c"]);
    expect(downloadedFileIds({ fileAccesses: [] }, ["file_local"])).toEqual(["file_local"]);
  });

  it("reuses GRIDGO's job id for a file read, else asks for every job", () => {
    expect(fileAccessJobId({ fileAccesses: rows }, "file_b")).toBe("job_1");
    expect(fileAccessJobId({ fileAccesses: [] }, "file_b")).toBe("");
  });

  it("prints PDFs and pictures in the browser; Word files download", () => {
    expect(viewerKind("application/pdf")).toBe("pdf");
    expect(viewerKind("image/jpeg")).toBe("image");
    expect(
      viewerKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("download_only");
  });

  it("never shows a file because of its name, and keeps SVG and HTML as downloads", () => {
    expect(viewerKind(null)).toBe("download_only");
    expect(viewerKind("text/html")).toBe("download_only");
    expect(viewerKind("image/svg+xml")).toBe("download_only");
    expect(viewerBlobType("pdf", "text/html")).toBe("application/pdf");
    expect(viewerBlobType("download_only", "text/html")).toBeNull();
  });
});

describe("shortcut keys", () => {
  const base = { key: "a", altKey: false, ctrlKey: false, metaKey: false };

  it("act on the page, never while typing or with a modifier", () => {
    expect(shortcutAllowed({ ...base, target: document.body })).toBe(true);
    expect(shortcutAllowed({ ...base, target: document.createElement("input") })).toBe(false);
    expect(shortcutAllowed({ ...base, target: document.createElement("textarea") })).toBe(false);
    expect(shortcutAllowed({ ...base, ctrlKey: true, target: document.body })).toBe(false);
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(shortcutAllowed({ ...base, target: editable })).toBe(false);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.appendChild(button);
    expect(shortcutAllowed({ ...base, target: button })).toBe(false);
  });
});
