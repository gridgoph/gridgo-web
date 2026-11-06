import { describe, expect, it } from "vitest";

import { presentSlip } from "@/components/shell/slip";
import type { Notification } from "@/lib/api/types";

function note(partial: Partial<Notification>): Notification {
  return {
    id: "ntf_1",
    userId: "user_1",
    title: "Hello",
    body: "Open GRIDGO to review the latest update.",
    read: false,
    at: "2026-11-03T00:00:00.000Z",
    ...partial,
  };
}

describe("presentSlip", () => {
  it("words each Sample First staff notice plainly and names the order", () => {
    const rows: [string, string, string][] = [
      ["sample_approved", "Sample approved", "Client approved a sample"],
      ["sample_rejected", "Sample rejected", "Client rejected a sample"],
      ["sample_batch_cancelled", "Sample batch draft cancelled", "Client cancelled a sampled batch"],
      [
        "sample_batch_ordered",
        "Batch ordered from an approved sample",
        "Batch ordered from an approved sample",
      ],
    ];
    for (const [type, title, headline] of rows) {
      expect(
        presentSlip(note({ type, title, orderId: "ord_c6af26dd9caf", orderTitle: "Flyers A5" })),
      ).toEqual({ headline, reference: "Flyers A5" });
    }
  });

  it("keeps the API's own title for any other notice", () => {
    expect(presentSlip(note({ type: "order_paid", title: "Order paid · ord_c6af26dd9caf" }))).toEqual(
      { headline: "Order paid", reference: null },
    );
  });
});
