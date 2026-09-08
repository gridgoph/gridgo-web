export type SseEvent = {
  event: string;
  data: string;
  id: string | null;
  retryMs: number | null;
};

export type SseParseResult = {
  events: SseEvent[];
  rest: string;
};

/**
 * Split a buffer into complete SSE frames.
 *
 * A line starting `:` is a comment — which is exactly what a heartbeat is.
 */
export function parseSseChunk(buffer: string): SseParseResult {
  const normalised = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalised.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: SseEvent[] = [];

  for (const frame of parts) {
    let event = "message";
    let id: string | null = null;
    let retryMs: number | null = null;
    const data: string[] = [];
    let sawField = false;

    for (const line of frame.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");

      if (field === "event") {
        event = value;
        sawField = true;
      } else if (field === "data") {
        data.push(value);
        sawField = true;
      } else if (field === "id") {
        id = value;
        sawField = true;
      } else if (field === "retry") {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) retryMs = parsed;
        sawField = true;
      }
    }

    if (sawField) events.push({ event, data: data.join("\n"), id, retryMs });
  }

  return { events, rest };
}

export function reconnectDelayMs(attempt: number, suggested: number | null): number {
  if (suggested != null) return Math.min(60_000, Math.max(1_000, suggested));
  return Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
}
