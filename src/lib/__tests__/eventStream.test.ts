import { describe, expect, it } from "vitest";

import { parseSseChunk, reconnectDelayMs } from "@/lib/eventStream";

describe("parseSseChunk", () => {
  it("ignores heartbeat comments and reads notification plus invalidate frames", () => {
    const { events, rest } = parseSseChunk(
      [
        ": heartbeat",
        "",
        "id: ntf_1",
        "event: notification",
        'data: {"notification":{"id":"ntf_1","title":"Job"}}',
        "",
        "event: invalidate",
        'data: {"resource":"orders","id":"ord_1"}',
        "",
        "id: ntf_2",
        "",
      ].join("\n"),
    );

    expect(events).toEqual([
      {
        event: "notification",
        data: '{"notification":{"id":"ntf_1","title":"Job"}}',
        id: "ntf_1",
        retryMs: null,
      },
      {
        event: "invalidate",
        data: '{"resource":"orders","id":"ord_1"}',
        id: null,
        retryMs: null,
      },
    ]);
    expect(rest).toBe("id: ntf_2\n");
  });
});

describe("reconnectDelayMs", () => {
  it("backs off exponentially and honours a suggested retry", () => {
    expect(reconnectDelayMs(0, null)).toBe(1000);
    expect(reconnectDelayMs(3, null)).toBe(8000);
    expect(reconnectDelayMs(1, 4000)).toBe(4000);
  });
});
