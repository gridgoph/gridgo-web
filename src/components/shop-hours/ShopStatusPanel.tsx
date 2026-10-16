import { ShopDayRuler } from "@/components/shop-hours/ShopDayRuler";
import { StatusChip } from "@/components/ui/StatusChip";
import type { ShopHours } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import {
  closureOnDay,
  extensionToday,
  manilaClock,
  shopStatus,
  type ShopHoursReader,
  type ShopStatusState,
} from "@/lib/shop-hours";

export const SHOP_STATUS_CHIP: Record<
  ShopStatusState,
  { tone: StatusTone; icon: StatusIconName; label: string }
> = {
  open: { tone: "success", icon: "circle-check", label: "Open" },
  closed: { tone: "neutral", icon: "clock", label: "Closed" },
  temporarily_closed: { tone: "warning", icon: "ban", label: "Closed for now" },
  unreadable: { tone: "warning", icon: "triangle-alert", label: "Hours need setting" },
};

/** Open now or not, what happens next, and today drawn as a bar. */
export function ShopStatusPanel({
  hours,
  now,
  reader,
  headingLevel = 2,
}: {
  hours: ShopHours;
  now: number;
  reader: ShopHoursReader;
  headingLevel?: 2 | 3;
}) {
  const status = shopStatus(hours, now, reader);
  const chip = SHOP_STATUS_CHIP[status.state];
  const clock = manilaClock(now);
  // Nothing is drawn open on a closure date or while closed for a while.
  const shut = hours.temporarilyClosed || closureOnDay(hours.closures, clock.dayKey) != null;
  const today = shut ? null : (hours.week.find((row) => row.weekday === clock.weekday) ?? null);
  const extension = shut ? null : extensionToday(hours, now);
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <section
      className="rounded-card border border-outline bg-surface flex flex-col gap-4 p-4"
      aria-live="polite"
      aria-label="Open now or closed"
    >
      <div className="flex flex-col gap-2">
        <div className="flex">
          <StatusChip tone={chip.tone} icon={chip.icon} label={chip.label} />
        </div>
        <Heading className="text-h2 text-text-primary m-0">{status.title}</Heading>
        <p className="text-body text-text-secondary m-0 max-w-prose">{status.detail}</p>
      </div>
      {status.state === "unreadable" ? null : (
        <ShopDayRuler
          opensMinute={today?.opensMinute ?? null}
          closesMinute={today?.closesMinute ?? null}
          extensionUntil={extension?.closesMinute ?? null}
          extensionFrom={extension?.opensMinute ?? null}
          nowMinute={clock.minute}
        />
      )}
      <p className="text-caption text-text-muted m-0">Times are Philippine time.</p>
    </section>
  );
}
