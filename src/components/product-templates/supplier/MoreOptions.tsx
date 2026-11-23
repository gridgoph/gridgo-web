"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { moreOptionsCount, type MoreOptionsDraft } from "@/lib/product-templates";
import { cn } from "@/lib/utils";

import { MoneyInput } from "./PriceTable";

/** A whole-number count. */
function CountInput({
  value,
  onChange,
  label,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  id?: string;
}) {
  return (
    <Input
      id={id}
      value={value}
      inputMode="numeric"
      aria-label={label}
      className="w-24"
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
    />
  );
}

/**
 * Everything a product can have but most do not, folded until asked for:
 * bulk discount, minimum order, rush and tips. The folded row says how many
 * are set. Extras and the shop's own photos are not fields here: they live on
 * the full product page once the product exists (`afterSave`), because both
 * go through the GRIDGO team's full review.
 */
export function MoreOptions({
  value,
  onChange,
  afterSave,
  defaultTips,
}: {
  value: MoreOptionsDraft;
  onChange: (next: MoreOptionsDraft) => void;
  afterSave?: ReactNode;
  defaultTips?: string[];
}) {
  const count = moreOptionsCount(value);
  const [open, setOpen] = useState(count > 0);
  const panel = useId();
  const minimumId = useId();
  const tipsId = useId();
  const set = (patch: Partial<MoreOptionsDraft>) => onChange({ ...value, ...patch });

  return (
    <section className="rounded-card border border-outline bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(!open)}
        className="hover:bg-overlay-hover flex min-h-14 w-full items-center gap-3 rounded-card px-4 py-3 text-left"
        data-testid="more-options-toggle"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
            More options
          </span>
          <span className="text-caption text-text-muted">
            {count ? `${count} set` : "Bulk discount, minimum order, rush, extras, photos, tips"}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn("text-text-muted size-5 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div id={panel} className="border-outline border-t px-4 pt-4 pb-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Bulk discount</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body text-text-secondary">From</span>
                <CountInput
                  value={value.bulkFrom}
                  onChange={(bulkFrom) => set({ bulkFrom })}
                  label="Bulk discount starts at, how many"
                />
                <span className="text-body text-text-secondary">or more,</span>
                <MoneyInput
                  value={value.bulkPrice}
                  onChange={(bulkPrice) => set({ bulkPrice })}
                  label="Bulk price each"
                  placeholder="each"
                  className="w-36"
                />
                <span className="text-body text-text-secondary">each</span>
              </div>
              <FieldDescription>A lower price each when a client orders many. Leave empty for none.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={minimumId}>Minimum order</FieldLabel>
              <CountInput
                id={minimumId}
                value={value.minimumOrder}
                onChange={(minimumOrder) => set({ minimumOrder })}
                label="Minimum order"
              />
              <FieldDescription>The fewest you will take. Leave empty for any amount.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Rush</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body text-text-secondary">Ready in</span>
                <CountInput
                  value={value.rushHours}
                  onChange={(rushHours) => set({ rushHours })}
                  label="Rush, hours"
                />
                <span className="text-body text-text-secondary">hours for</span>
                <MoneyInput
                  value={value.rushFee}
                  onChange={(rushFee) => set({ rushFee })}
                  label="Rush fee"
                  placeholder="fee"
                  className="w-36"
                />
                <span className="text-body text-text-secondary">more</span>
              </div>
              <FieldDescription>Faster than your ready time, for an extra fee. Leave empty for no rush.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={tipsId}>Tips for the client</FieldLabel>
              <Textarea
                id={tipsId}
                value={value.tips}
                maxLength={2000}
                placeholder="Example: send a PDF with 3 mm bleed"
                onChange={(event) => set({ tips: event.target.value })}
              />
              <FieldDescription>
                {defaultTips?.length
                  ? `Leave empty to use GRIDGO's: "${defaultTips[0]}"`
                  : "What a client should know before sending work."}
              </FieldDescription>
            </Field>

            {afterSave ?? (
              <p className="text-caption text-text-muted m-0">
                Extras and your own photos come next, once the product is saved.
              </p>
            )}
          </FieldGroup>
        </div>
      ) : null}
    </section>
  );
}
