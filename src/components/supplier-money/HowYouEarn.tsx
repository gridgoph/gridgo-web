import { howYouEarnLines, type ShopMoneySchedule } from "@/lib/supplier-money";

/**
 * Three lines on how a shop earns and when GRIDGO pays it. The words come from
 * GRIDGO's schedule; without one nothing is drawn, so no shop is told about
 * daily payouts GRIDGO is not running.
 */
export function HowYouEarn({ schedule }: { schedule: ShopMoneySchedule | null }) {
  const lines = howYouEarnLines(schedule);
  if (!lines) return null;
  return (
    <section className="gg-panel flex flex-col gap-2" aria-labelledby="how-you-earn" data-testid="how-you-earn">
      <h2 id="how-you-earn" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
        How you earn
      </h2>
      <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
        {lines.map((line) => (
          <li key={line} className="text-body text-text-secondary max-w-prose">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
