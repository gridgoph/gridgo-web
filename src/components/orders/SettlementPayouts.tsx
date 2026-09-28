"use client";

/**
 * What a shop is still owed after a client refund settlement, as its own item.
 *
 * When a refund is settled, the order's unpaid shares close as "Replaced by
 * settlement" and the remainder the shop agreed to keep becomes one separately
 * labelled payout (`supplierSettlementPayouts`, contract "Supplier settlement
 * payout" in `gridgo-api/docs/REFUNDS_API.md`). It sits under the shares so the
 * two are read together, and it is never called a share: its amount is agreed,
 * not a percentage.
 *
 * Shop-facing figures only (the shop's own money), so it renders on the
 * supplier's surfaces too. Never mount it on anything a client sees.
 */

import { CircleCheck, Handshake } from "lucide-react";

import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Claim, Order, SupplierSettlementPayout } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import type { StatePresentation } from "@/lib/order-state";
import { settlementPayoutHeld } from "@/lib/payouts";
import { SETTLEMENT_PAYOUT_LABEL, TRANSFER_EVIDENCE_LABEL } from "@/lib/refunds";
import { cn } from "@/lib/utils";

type Props = {
  order: Pick<Order, "payoutHold" | "supplierSettlementPayouts">;
  holds?: readonly Claim[];
  /** Operations only, and only where the refund request is loaded. */
  onRelease?: (payout: SupplierSettlementPayout) => void;
  releasing?: string | null;
};

export function presentSettlementPayout(
  payout: Pick<SupplierSettlementPayout, "status">,
  held: boolean,
): StatePresentation {
  if (payout.status === "released") {
    return { label: "Released", tone: "success", icon: "circle-check" };
  }
  if (payout.status === "superseded") {
    return { label: "Replaced by a later settlement", tone: "neutral", icon: "ban" };
  }
  if (held) return { label: "Held", tone: "error", icon: "triangle-alert" };
  return { label: "Ready to record", tone: "info", icon: "circle-check" };
}

export function SettlementPayouts({ order, holds = [], onRelease, releasing = null }: Props) {
  const payouts = order.supplierSettlementPayouts ?? [];
  if (!payouts.length) return null;
  const held = settlementPayoutHeld(order, holds);

  return (
    <section
      className="rounded-card border border-outline-subtle"
      aria-labelledby="settlement-payouts-heading"
    >
      <div className="flex items-start gap-3 border-b border-outline-subtle px-3 py-2.5">
        <Handshake
          size={18}
          strokeWidth={1.75}
          className="text-text-secondary mt-0.5 shrink-0"
          aria-hidden
        />
        <div className="min-w-0">
          <h3
            id="settlement-payouts-heading"
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            After the client refund
          </h3>
          <p className="text-caption text-text-muted m-0 mt-0.5">
            The shop agreed what it keeps. What it is still owed is paid as this
            separate item, not as the shares above.
          </p>
        </div>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {payouts.map((payout) => {
          const status = presentSettlementPayout(payout, held);
          const pending = payout.status === "pending";
          const released = payout.status === "released";
          return (
            <li
              key={payout.id}
              className="flex flex-col gap-3 border-b border-outline-subtle px-3 py-3 last:border-b-0"
            >
              <div className="flex flex-wrap items-start gap-3">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-pill border",
                    released
                      ? "border-success text-success"
                      : "border-outline text-text-secondary",
                  )}
                  aria-hidden
                >
                  {released ? (
                    <CircleCheck size={14} strokeWidth={2} />
                  ) : (
                    <Handshake size={12} strokeWidth={2} />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className="text-body text-text-primary"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {payout.label || SETTLEMENT_PAYOUT_LABEL}
                  </span>
                  <span className="text-caption text-text-muted">
                    The exact amount agreed at settlement
                    {payout.createdAt ? `, ${formatDateTime(payout.createdAt)}` : ""}.
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`text-body tabular-nums ${
                      payout.status === "superseded" ? "text-text-muted" : "text-text-primary"
                    }`}
                    style={{
                      fontFamily:
                        payout.status === "superseded"
                          ? "var(--font-sans)"
                          : "var(--font-bold)",
                    }}
                  >
                    {formatPhp(payout.amountMinor)}
                  </span>
                  <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:pl-9">
                {released ? (
                  <>
                    <p className="text-caption text-text-secondary m-0">
                      Released
                      {payout.releasedAt ? ` ${formatDateTime(payout.releasedAt)}` : ""}
                      {payout.reference ? `, reference ${payout.reference}` : ""}.
                    </p>
                    {payout.receiptFileId ? (
                      <div className="max-w-sm">
                        <EvidencePlate
                          fileId={payout.receiptFileId}
                          label={TRANSFER_EVIDENCE_LABEL}
                          caption={payout.reference}
                        />
                      </div>
                    ) : null}
                  </>
                ) : payout.status === "superseded" ? (
                  <p className="text-caption text-text-secondary m-0">
                    Not paid. A later refund settlement replaced this amount.
                  </p>
                ) : held ? (
                  <p className="text-caption text-text-secondary m-0">
                    A claim holds this payout. Nothing releases until it is resolved on
                    Claims and holds.
                  </p>
                ) : (
                  <p className="text-caption text-text-secondary m-0">
                    Pay it to the shop&rsquo;s current receiving QR, then record the
                    reference and the wallet screenshot. Both are required.
                  </p>
                )}
                {onRelease && pending ? (
                  <div>
                    <Button
                      variant="secondary"
                      disabled={held || releasing !== null}
                      onClick={() => onRelease(payout)}
                    >
                      {releasing === payout.id
                        ? "Recording…"
                        : `Record ${formatPhp(payout.amountMinor)} to the shop`}
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
