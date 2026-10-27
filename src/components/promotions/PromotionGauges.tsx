import type { AdminPromotions } from "@/lib/api/promotions";
import { formatPhp } from "@/lib/format";
import { SLOT_STRIP_MAX, budgetBar, foundingSeats, type Seat } from "@/lib/promotions";
import { cn } from "@/lib/utils";

/** Fill, not hue, tells the seats apart, so they read in greyscale too. */
const SEAT: Record<Seat, string> = {
  used: "bg-text-primary border border-text-primary",
  claimed: "bg-surface border-2 border-text-primary",
  open: "border border-dashed border-text-muted",
};

const SEAT_LABEL: Record<Seat, string> = {
  used: "Used on an order",
  claimed: "Claimed, not used yet",
  open: "Open",
};

function Swatch({ seat }: { seat: Seat }) {
  return <span aria-hidden className={cn("inline-block size-3.5 shrink-0 rounded-[4px]", SEAT[seat])} />;
}

/**
 * The Founding 30 as seats: one per slot, used first, then claimed, then
 * open. A claim that expired unused gave its seat back, so it is open again.
 * Past `SLOT_STRIP_MAX` slots the seats become one bar with the same fills.
 */
export function FoundingSeats({ founding }: { founding: AdminPromotions["founding"] }) {
  const seats = foundingSeats(founding);
  const count = (seat: Seat) => seats.filter((s) => s === seat).length;
  const used = count("used");
  const claimed = count("claimed");
  const open = count("open");
  const summary = `${founding.slots} slots: ${used} used, ${claimed} claimed and not used yet, ${open} open.`;

  return (
    <div className="flex flex-col gap-3">
      {seats.length <= SLOT_STRIP_MAX ? (
        <ol
          role="img"
          aria-label={summary}
          className="m-0 grid w-full max-w-sm list-none grid-cols-10 gap-1 p-0"
        >
          {seats.map((seat, index) => (
            <li
              key={index}
              data-seat={seat}
              aria-hidden
              className={cn("aspect-square rounded-[5px]", SEAT[seat])}
            />
          ))}
        </ol>
      ) : (
        <div
          role="img"
          aria-label={summary}
          className="bg-surface-variant flex h-3 w-full max-w-sm overflow-hidden rounded-full"
        >
          <span className="bg-text-primary" style={{ width: `${(used / seats.length) * 100}%` }} />
          <span
            className="gg-invoice-hatch text-text-primary"
            style={{ width: `${(claimed / seats.length) * 100}%` }}
          />
        </div>
      )}
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0" aria-hidden>
        {(["used", "claimed", "open"] as const).map((seat) => (
          <li key={seat} className="text-caption text-text-secondary inline-flex items-center gap-1.5">
            <Swatch seat={seat} />
            <span>
              {SEAT_LABEL[seat]} <span className="text-text-primary tabular-nums">{count(seat)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Committed against the cap: redeemed (solid) inside committed (hatched),
 * the rest of the track is what can still be given.
 */
export function BudgetMeter({ budget }: { budget: AdminPromotions["budget"] }) {
  const bar = budgetBar(budget);
  // Committed is face value and keeps a used voucher's unspent part; redeemed
  // is only what orders took. The difference is not all still to come.
  const waitingMinor = Math.max(0, budget.committedMinor - budget.redeemedMinor);
  const rows = [
    {
      key: "redeemed",
      label: "Taken off orders",
      value: budget.redeemedMinor,
      swatch: "bg-text-primary",
    },
    {
      key: "waiting",
      label: "Committed, unspent",
      value: waitingMinor,
      swatch: "gg-invoice-hatch text-text-primary border border-text-primary",
    },
    {
      key: "remaining",
      label: "Left under the cap",
      value: budget.remainingMinor,
      swatch: "bg-surface-variant border border-outline",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0">
        <span
          className="text-text-primary tabular-nums"
          style={{ fontFamily: "var(--font-bold)", fontSize: 28, lineHeight: "34px" }}
        >
          {formatPhp(budget.committedMinor)}
        </span>{" "}
        committed of {formatPhp(budget.capMinor)}
      </p>
      <div
        role="img"
        aria-label={`${formatPhp(budget.committedMinor)} committed of a ${formatPhp(budget.capMinor)} cap: ${formatPhp(budget.redeemedMinor)} taken off orders, ${formatPhp(budget.remainingMinor)} left.`}
        className="bg-surface-variant flex h-3 w-full overflow-hidden rounded-full"
      >
        <span className="bg-text-primary" style={{ width: `${bar.redeemedPercent}%` }} />
        <span
          className="gg-invoice-hatch text-text-primary"
          style={{ width: `${Math.max(0, bar.committedPercent - bar.redeemedPercent)}%` }}
        />
      </div>
      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-1.5 md:flex-col md:items-start md:gap-0">
            <dt className="text-caption text-text-secondary inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("inline-block size-3 shrink-0 rounded-[3px]", row.swatch)} />
              {row.label}
            </dt>
            <dd className="text-body text-text-primary m-0 ml-auto tabular-nums md:ml-0">
              {formatPhp(row.value)}
            </dd>
          </div>
        ))}
      </dl>
      {bar.over ? (
        <p className="text-caption text-text-secondary m-0">
          Vouchers already out are worth more than the cap. They keep their value; nothing new is
          given until the total is under the cap.
        </p>
      ) : null}
    </div>
  );
}
