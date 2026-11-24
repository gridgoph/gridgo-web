"use client";

import { useState } from "react";

import { HowYouEarn } from "@/components/supplier-money/HowYouEarn";
import { LaunchBonusCard } from "@/components/supplier-money/LaunchBonusCard";
import { MoneyActivity } from "@/components/supplier-money/MoneyActivity";
import { PayGridgoDialog } from "@/components/supplier-money/PayGridgoDialog";
import { ShopBalances } from "@/components/supplier-money/ShopBalances";
import {
  launchBonusSummary,
  type MoneyPeriod,
  type ShopMoneyRead,
  type ShopMoneySchedule,
} from "@/lib/supplier-money";

/**
 * The top of Money for a shop Owner, in the phone app's order: the two
 * balances with the net and next payout (and Pay GRIDGO when a request is
 * open), the launch bonus, the Week/Month activity, then How you earn.
 *
 * Desktop puts the bonus and How you earn beside the balances (grid areas, so
 * the reading order on a phone stays the app's), with the activity below.
 */
export function ShopMoneyOverview({
  read,
  schedule,
  period,
  onPeriod,
  now = new Date(),
}: {
  read: ShopMoneyRead;
  schedule: ShopMoneySchedule | null;
  period: MoneyPeriod;
  onPeriod: (period: MoneyPeriod) => void;
  now?: Date;
}) {
  const [paying, setPaying] = useState(false);
  const bonus = launchBonusSummary(read.jobs, now);

  return (
    <div
      className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:[grid-template-areas:'balances_bonus'_'balances_earn'_'activity_activity']"
      data-testid="shop-money-overview"
    >
      <div className="lg:[grid-area:balances]">
        <ShopBalances
          balances={read.balances}
          schedule={schedule}
          payGridgo={read.payGridgo}
          onPay={() => setPaying(true)}
          now={now}
        />
      </div>
      {bonus ? (
        <div className="lg:[grid-area:bonus]">
          <LaunchBonusCard summary={bonus} now={now} />
        </div>
      ) : null}
      <div className="pt-2 lg:pt-4 lg:[grid-area:activity]">
        <MoneyActivity read={read} period={period} onPeriod={onPeriod} now={now} />
      </div>
      {schedule ? (
        <div className={bonus ? "lg:[grid-area:earn]" : "lg:[grid-area:bonus]"}>
          <HowYouEarn schedule={schedule} />
        </div>
      ) : null}
      <PayGridgoDialog
        open={paying}
        onOpenChange={setPaying}
        pay={read.payGridgo}
        paused={read.balances.paused}
        now={now}
      />
    </div>
  );
}
