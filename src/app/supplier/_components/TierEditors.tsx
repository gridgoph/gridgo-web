"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { ProductionTimePicker } from "@/app/supplier/_components/ProductionTimeField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BULK_BREAK_CAP,
  DUPLICATE_BULK_BREAK,
  MAX_BULK_BREAKS,
  MAX_SPEEDS,
  SPEED_CAP,
  parseCatalogMoney,
} from "@/lib/catalog-money";
import { formatPhp } from "@/lib/format";
import type { PriceTier, SpeedTier } from "@/lib/listings";
import {
  DEFAULT_DAY_MINUTES,
  sameTime,
  timeKey,
  timeLabel,
  workingDays,
  type ProductionTime,
} from "@/lib/production-time";

/**
 * Bulk breaks and existing speed tiers, edited the way the shop app edits
 * them: add a row, remove a row, and say what the price is.
 *
 * A bulk break is a unit price from that quantity up. A speed the shop adds
 * is a price for the whole job at that time, never a fee on top and never an
 * Express surcharge. Express stays its own same-day commitment.
 */

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onRemove}>
      <Trash2 aria-hidden />
    </Button>
  );
}

export function PriceTierEditor({
  tiers,
  unitLabel,
  onChange,
}: {
  tiers: PriceTier[];
  /** "per piece", "per pack of 100" — the rate is a unit price. */
  unitLabel: string;
  onChange: (next: PriceTier[]) => void;
}) {
  const [draftQty, setDraftQty] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sorted = [...tiers].sort((left, right) => left.minQuantity - right.minQuantity);
  const full = sorted.length >= MAX_BULK_BREAKS;

  const add = () => {
    const quantity = Number(draftQty);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      setError("A bulk break starts at a whole quantity of at least 1.");
      return;
    }
    if (sorted.some((tier) => tier.minQuantity === quantity)) {
      setError(DUPLICATE_BULK_BREAK);
      return;
    }
    const money = parseCatalogMoney(draftPrice);
    if (!money.ok) {
      setError(money.error);
      return;
    }
    if (money.minor == null) {
      setError("Enter the unit price for this quantity.");
      return;
    }
    onChange([...sorted, { minQuantity: quantity, unitPriceMinor: money.minor }]);
    setDraftQty("");
    setDraftPrice("");
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-text-muted m-0 max-w-prose">
        Cheaper in bulk — optional. From this many, your rate becomes the one you set here.
        This is a unit price ({unitLabel}), not a price for the whole job.
      </p>
      {sorted.map((tier) => (
        <div
          key={tier.minQuantity}
          className="border-outline flex items-center gap-2 rounded-[var(--radius-field)] border p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-body text-text-primary m-0">{tier.minQuantity} and over</p>
            <p className="text-body text-text-primary m-0">
              {formatPhp(tier.unitPriceMinor)}{" "}
              <span className="text-caption text-text-muted">
                {unitLabel} · Unit price
              </span>
            </p>
          </div>
          <RemoveButton
            label={`Remove the break at ${tier.minQuantity}`}
            onRemove={() => onChange(sorted.filter((row) => row.minQuantity !== tier.minQuantity))}
          />
        </div>
      ))}
      {full ? (
        <p className="text-caption text-text-muted m-0">{BULK_BREAK_CAP}</p>
      ) : (
        <div className="border-outline flex flex-col gap-2 rounded-[var(--radius-field)] border p-3">
          <label className="text-caption text-text-secondary flex flex-col gap-1">
            Quantity this break starts at
            <Input
              inputMode="numeric"
              value={draftQty}
              onChange={(event) => {
                setDraftQty(event.target.value);
                setError(null);
              }}
            />
          </label>
          <label className="text-caption text-text-secondary flex flex-col gap-1">
            Rate at this quantity
            <Input
              inputMode="decimal"
              value={draftPrice}
              onChange={(event) => {
                setDraftPrice(event.target.value);
                setError(null);
              }}
            />
          </label>
          {error ? (
            <p className="text-caption text-destructive m-0" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="button" variant="secondary" onClick={add} disabled={!draftQty.trim() || !draftPrice.trim()}>
            Add this break
          </Button>
        </div>
      )}
    </div>
  );
}

export function SpeedTierEditor({
  tiers,
  onChange,
  dayMinutes = DEFAULT_DAY_MINUTES,
}: {
  tiers: readonly SpeedTier[];
  onChange: (next: SpeedTier[]) => void;
  dayMinutes?: number;
}) {
  const [label, setLabel] = useState("");
  const [time, setTime] = useState<ProductionTime>(workingDays(1));
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const taken = tiers.some((tier) => sameTime(tier.turnaround, time));
  const full = tiers.length >= MAX_SPEEDS;

  const add = () => {
    if (!label.trim()) return;
    if (taken) {
      setError(`You already sell a speed at ${timeLabel(time)}. Pick another time, or remove that one first.`);
      return;
    }
    const money = parseCatalogMoney(price);
    if (!money.ok) {
      setError(money.error);
      return;
    }
    if (money.minor == null) {
      setError("Enter the price for this speed.");
      return;
    }
    onChange([
      ...tiers,
      {
        id: `speed_${timeKey(time)}`,
        label: label.trim(),
        turnaround: time,
        priceMinor: money.minor,
        surchargeMinor: null,
      },
    ]);
    setLabel("");
    setPrice("");
    setError(null);
  };

  return (
    <div className="border-outline flex flex-col gap-2 rounded-[var(--radius-field)] border p-3">
      <h4 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
        Faster price options
      </h4>
      <p className="text-caption text-text-muted m-0 max-w-prose">
        Faster, for more — optional. A client&apos;s date picks one of these, so each is a
        price for the whole job at that speed, not a fee on top. Express is not one of
        these and has no surcharge.
      </p>
      {tiers.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {tiers.map((tier) => {
            const wholeJob = tier.priceMinor != null;
            return (
              <li key={tier.id || timeKey(tier.turnaround)} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-body text-text-primary m-0">{tier.label}</p>
                  <p className="text-body text-text-primary m-0">
                    {wholeJob
                      ? formatPhp(tier.priceMinor ?? 0)
                      : `${formatPhp(tier.surchargeMinor ?? 0)} more`}{" "}
                    <span className="text-caption text-text-muted">
                      {timeLabel(tier.turnaround)} · {wholeJob ? "Whole-job price" : "Fee on top"}
                    </span>
                  </p>
                </div>
                <RemoveButton
                  label={`Remove ${tier.label}`}
                  onRemove={() =>
                    onChange(tiers.filter((row) => !sameTime(row.turnaround, tier.turnaround)))
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-caption text-text-secondary m-0">None on this listing yet.</p>
      )}
      {full ? (
        <p className="text-caption text-text-muted m-0">{SPEED_CAP}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-caption text-text-secondary flex flex-col gap-1">
            What this speed is called
            <Input
              value={label}
              placeholder="What you call it — Rush, Priority"
              onChange={(event) => {
                setLabel(event.target.value);
                setError(null);
              }}
            />
          </label>
          <ProductionTimePicker
            time={time}
            onChange={(next) => {
              setTime(next);
              setError(null);
            }}
            dayMinutes={dayMinutes}
            label="How long this speed takes"
            unitLabel="Count this speed in"
          />
          {taken ? (
            <p className="text-caption text-text-muted m-0">
              You already sell a speed at {timeLabel(time)}. Pick another time, or remove that one first.
            </p>
          ) : null}
          <label className="text-caption text-text-secondary flex flex-col gap-1">
            Price at this speed
            <Input
              inputMode="decimal"
              value={price}
              onChange={(event) => {
                setPrice(event.target.value);
                setError(null);
              }}
            />
          </label>
          {error ? (
            <p className="text-caption text-destructive m-0" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={add}
            disabled={!label.trim() || !price.trim() || taken}
          >
            Add this speed
          </Button>
        </div>
      )}
    </div>
  );
}
