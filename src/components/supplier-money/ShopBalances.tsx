"use client";

import { CirclePause, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPhp } from "@/lib/format";
import {
  netLine,
  nextPayoutLine,
  payGridgoNotice,
  type PayGridgo,
  type ShopMoneyBalances,
  type ShopMoneySchedule,
} from "@/lib/supplier-money";

/**
 * The shop's two balances with GRIDGO, read like a cash book: what GRIDGO owes
 * the shop, what the shop owes GRIDGO, a double rule, and the net underneath,
 * then when the next payout runs. The same order and words as the phone app
 * (gridgo-supplier `components/money/ShopBalances.tsx`).
 *
 * Pay GRIDGO is the one yellow on Money, and only while a request is open; a
 * shop that owes nothing has no action here. A paused shop hears it first,
 * above the figures, in the error tone with an icon and a label, so it reads
 * in greyscale.
 */
export function ShopBalances({
  balances,
  schedule,
  payGridgo,
  onPay,
  now = new Date(),
}: {
  balances: ShopMoneyBalances;
  schedule: ShopMoneySchedule | null;
  payGridgo: PayGridgo | null;
  onPay: () => void;
  now?: Date;
}) {
  const net = netLine(balances);
  const notice = payGridgo ? payGridgoNotice(payGridgo, balances, now) : null;
  // An open request already says when it is due; the line would repeat it.
  const next = notice && balances.netMinor < 0 ? null : nextPayoutLine(balances, schedule, now);
  const netColor =
    net.tone === "owed" ? "text-success" : net.tone === "owing" ? "text-error" : "text-text-primary";

  return (
    <section className="gg-card flex flex-col gap-4" aria-label="Your balances with GRIDGO" data-testid="shop-balances">
      {notice ? (
        <div
          role="alert"
          data-testid={notice.tone === "error" ? "pay-gridgo-paused" : "pay-gridgo-due"}
          className={
            notice.tone === "error"
              ? "flex items-start gap-3 rounded-field border border-error p-3"
              : "flex items-start gap-3 rounded-field border border-warning p-3"
          }
        >
          {notice.tone === "error" ? (
            <CirclePause className="mt-0.5 size-5 shrink-0 text-error" aria-hidden />
          ) : (
            <Clock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
              {notice.title}
            </p>
            <p className="text-body text-text-secondary m-0">{notice.body}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <BalanceRow
          label="GRIDGO owes you"
          hint="Your shop pay, earned and not yet sent"
          amountMinor={balances.owedMinor}
          testId="balance-owed"
        />
        <BalanceRow
          label="You owe GRIDGO"
          hint={
            balances.owingMinor > 0
              ? "GRIDGO's share of money you collected"
              : "Only if you collect money yourself"
          }
          amountMinor={balances.owingMinor}
          testId="balance-owing"
        />
      </div>

      {/* A cash book's total rule: two lines under the entries, above the net. */}
      <div className="flex flex-col gap-0.5" aria-hidden>
        <div className="h-px bg-text-primary" />
        <div className="h-px bg-text-primary" />
      </div>

      <div
        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
        data-testid="balance-net"
      >
        <p className="text-body-lg text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          {net.label}
        </p>
        <p className={`text-h1 m-0 tabular-nums ${netColor}`}>
          <span className="sr-only">{net.label}: </span>
          {formatPhp(Math.abs(balances.netMinor))}
        </p>
      </div>

      {next ? (
        <p className="text-caption text-text-muted m-0 max-w-prose" data-testid="next-payout">
          {next}
        </p>
      ) : null}

      {notice ? (
        <div>
          <Button variant="primary" onClick={onPay} data-testid="pay-gridgo-open">
            {notice.action}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function BalanceRow({
  label,
  hint,
  amountMinor,
  testId,
}: {
  label: string;
  hint: string;
  amountMinor: number;
  testId: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3" data-testid={testId}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-body text-text-primary m-0">{label}</p>
        <p className="text-caption text-text-muted m-0">{hint}</p>
      </div>
      <p className="text-body-lg text-text-primary m-0 tabular-nums" style={{ fontFamily: "var(--font-medium)" }}>
        {formatPhp(amountMinor)}
      </p>
    </div>
  );
}
