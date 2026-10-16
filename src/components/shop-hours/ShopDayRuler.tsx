import { timeLabel } from "@/lib/shop-hours";

type Props = {
  /** Today's usual hours, or null on a closed day. */
  opensMinute: number | null;
  closesMinute: number | null;
  /** Today's extension close, drawn after the usual close. */
  extensionUntil: number | null;
  /** Where the extension starts (it can start after the usual close). */
  extensionFrom?: number | null;
  /** Minutes since Manila midnight. */
  nowMinute: number;
  /** Whose day: "Today" for the shop, the shop's name for the GRIDGO Team. */
  subject?: string;
};

const DAY = 1440;
const TICKS: ReadonlyArray<{ minute: number; label: string }> = [
  { minute: 0, label: "12 AM" },
  { minute: 360, label: "6 AM" },
  { minute: 720, label: "12 PM" },
  { minute: 1080, label: "6 PM" },
  { minute: 1440, label: "12 AM" },
];

const percent = (minute: number) => `${(Math.min(Math.max(minute, 0), DAY) / DAY) * 100}%`;

/** Extra hours are hatched, so they read apart from the usual hours in greyscale too. */
export const EXTENSION_HATCH =
  "repeating-linear-gradient(135deg, var(--season-track-peak) 0 4px, transparent 4px 8px)";

/**
 * Today as one bar, midnight to midnight, in Philippine time: the usual hours
 * filled, an extension hatched after them, and a needle where the clock stands.
 *
 * "Open until 8:00 PM" reads faster as a shape than as a sentence, and the same
 * bar shows why an extension is short when it was declared after closing. The
 * sentence is still said beside it and to a screen reader, so nothing depends
 * on the drawing.
 */
export function ShopDayRuler({
  opensMinute,
  closesMinute,
  extensionUntil,
  extensionFrom,
  nowMinute,
  subject = "Today",
}: Props) {
  const open = opensMinute != null && closesMinute != null;
  const from =
    open && extensionUntil != null
      ? Math.max(closesMinute, extensionFrom ?? closesMinute)
      : null;
  const now = timeLabel(Math.floor(nowMinute));
  const summary = open
    ? `${subject}: open ${timeLabel(opensMinute)} to ${timeLabel(closesMinute)}${
        extensionUntil != null ? `, extended to ${timeLabel(extensionUntil)}` : ""
      }. It is ${now} now.`
    : `${subject}: closed. It is ${now} now.`;

  return (
    <div role="img" aria-label={summary} className="flex flex-col gap-1.5">
      <div className="relative flex h-8 items-center">
        <div className="relative h-4 w-full overflow-hidden rounded-pill border border-outline bg-surface-variant">
          {TICKS.slice(1, -1).map((tick) => (
            <span
              key={tick.minute}
              className="absolute top-0 bottom-0 w-px bg-outline"
              style={{ left: percent(tick.minute) }}
            />
          ))}
          {open ? (
            <span
              data-testid="ruler-usual"
              className="absolute top-0 bottom-0"
              style={{
                left: percent(opensMinute),
                width: percent(closesMinute - opensMinute),
                background: "var(--season-track-busy)",
                boxShadow: "inset 0 0 0 1px var(--color-info)",
              }}
            />
          ) : null}
          {from != null && extensionUntil != null && extensionUntil > from ? (
            <span
              data-testid="ruler-extension"
              className="absolute top-0 bottom-0"
              style={{
                left: percent(from),
                width: percent(extensionUntil - from),
                background: EXTENSION_HATCH,
                boxShadow: "inset 0 0 0 1px var(--color-info)",
              }}
            />
          ) : null}
        </div>
        <span
          data-testid="ruler-now"
          className="absolute top-0 bottom-0 w-0.5 rounded-pill bg-foreground"
          style={{ left: percent(nowMinute), marginLeft: -1 }}
        />
      </div>
      <div className="flex justify-between" aria-hidden>
        {TICKS.map((tick, index) => (
          <span key={index} className="text-caption text-text-muted tabular-nums">
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}
