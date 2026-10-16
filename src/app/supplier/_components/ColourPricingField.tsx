"use client";

import { Plus, Trash2 } from "lucide-react";

import { CoverageGlyph } from "@/components/colour/CoverageGlyph";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  COLOUR_SIZES_MAX,
  TIERS_OF,
  newSizeKey,
  paperDimensions,
  readPaperSize,
  suggestedPapers,
  tierBand,
  tierHint,
  tierLabel,
  tierSetOf,
  type ColourDraft,
  type ColourSizeDraft,
  type ColourTier,
} from "@/lib/colour-pricing";
import { cn } from "@/lib/utils";

const medium = { fontFamily: "var(--font-medium)" } as const;

/**
 * The shop's price per sheet for each colour tier on each paper size
 * (issue report 0BE07331; contract gridgo-api docs/COLOUR_PRICING_API.md).
 *
 * One row per paper. Large-format paper takes four tiers, A3 two; the paper
 * name decides which, the way the API does. A blank tier is not offered on
 * that paper. Each tier carries a sheet filled to its coverage so the four
 * steps read at a glance, with the words beside it.
 */
export function ColourPricingField({
  value,
  onChange,
  sizeLabels,
  problem,
  a3LimitBps,
  disabled,
}: {
  value: ColourDraft;
  onChange: (next: ColourDraft) => void;
  /** Labels of the listing's size options, offered as one-tap rows. */
  sizeLabels: readonly string[];
  /** The first thing the API would refuse, and on which row. */
  problem: { key: string | null; message: string } | null;
  a3LimitBps: number;
  disabled?: boolean;
}) {
  const suggestions = suggestedPapers(sizeLabels, value);
  const full = value.length >= COLOUR_SIZES_MAX;

  function update(key: string, patch: Partial<ColourSizeDraft>) {
    onChange(value.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function add(paperSize: string) {
    onChange([...value, { key: newSizeKey(), paperSize, prices: {} }]);
  }

  return (
    <div className="flex flex-col gap-4" data-testid="colour-pricing-field">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        GRIDGO measures how much of each page is strong colour, as it will print on the
        paper the client picks. Black, white, greys and light colours do not count. Each
        page is charged your price for its tier. Leave a tier blank if you do not offer it
        on that paper: a page that lands there goes to the GRIDGO Team for a price check,
        and GRIDGO never fills in a price for you.
      </p>

      {value.length ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Colour prices by paper size">
          {value.map((row, index) => (
            <SizeRow
              key={row.key}
              row={row}
              index={index}
              a3LimitBps={a3LimitBps}
              problem={problem?.key === row.key ? problem.message : null}
              disabled={disabled}
              onChange={(patch) => update(row.key, patch)}
              onRemove={() => onChange(value.filter((entry) => entry.key !== row.key))}
            />
          ))}
        </ul>
      ) : (
        <p className="text-body text-text-primary m-0" style={medium}>
          No paper sizes yet. Add the sizes you print this on.
        </p>
      )}

      {problem && problem.key == null ? (
        <p className="text-body text-error m-0" role="alert">
          {problem.message.charAt(0).toUpperCase() + problem.message.slice(1)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={disabled || full} onClick={() => add("")}>
          <Plus aria-hidden />
          Add a paper size
        </Button>
        {suggestions.map((label) => (
          <Button
            key={label}
            type="button"
            variant="ghost"
            disabled={disabled || full}
            onClick={() => add(label)}
          >
            <Plus aria-hidden />
            {label}
          </Button>
        ))}
      </div>
      {suggestions.length ? (
        <p className="text-caption text-text-muted m-0 max-w-prose">
          The sizes beside the button come from your size choices. A client&rsquo;s paper
          choice picks the row its pages are priced from.
        </p>
      ) : null}
    </div>
  );
}

function SizeRow({
  row,
  index,
  a3LimitBps,
  problem,
  disabled,
  onChange,
  onRemove,
}: {
  row: ColourSizeDraft;
  index: number;
  a3LimitBps: number;
  problem: string | null;
  disabled?: boolean;
  onChange: (patch: Partial<ColourSizeDraft>) => void;
  onRemove: () => void;
}) {
  const paper = readPaperSize(row.paperSize);
  const tierSet = paper ? tierSetOf(paper) : null;
  const inputId = `colour-size-${row.key}`;
  const name = row.paperSize.trim() || `Paper ${index + 1}`;
  return (
    <li
      className={cn(
        "rounded-card border p-3 flex flex-col gap-3",
        problem ? "border-error" : "border-outline",
      )}
      data-testid="colour-size-row"
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field className="max-w-56 flex-1" data-invalid={problem ? true : undefined}>
          <FieldLabel htmlFor={inputId}>Paper size</FieldLabel>
          <Input
            id={inputId}
            value={row.paperSize}
            placeholder="A3 or 20x30"
            disabled={disabled}
            aria-invalid={problem ? true : undefined}
            onChange={(event) => onChange({ paperSize: event.target.value })}
          />
        </Field>
        <p className="text-caption text-text-secondary m-0 min-h-11 flex-1 content-center">
          {paper
            ? `${paperDimensions(paper)}. ${tierSet === "a3" ? "Priced in the two A3 tiers." : "Priced in the four large-format tiers."}`
            : "Type a name like A3, or width x height. A bare 20x30 is inches."}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${name}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>

      {tierSet ? (
        <p className="text-caption text-text-muted m-0" aria-hidden>
          Your price per sheet, by how much of it is strong colour
        </p>
      ) : null}
      {tierSet ? (
        <div
          role="group"
          aria-label={`${name} prices per sheet`}
          className="border-outline-subtle flex flex-col rounded-field border"
        >
          {TIERS_OF[tierSet].map((tier) => (
            <TierPrice
              key={tier}
              rowKey={row.key}
              tier={tier}
              a3LimitBps={a3LimitBps}
              value={row.prices[tier] ?? ""}
              disabled={disabled}
              onChange={(pesos) => onChange({ prices: { ...row.prices, [tier]: pesos } })}
            />
          ))}
        </div>
      ) : null}

      {problem ? <FieldError>{problem.charAt(0).toUpperCase() + problem.slice(1)}</FieldError> : null}
    </li>
  );
}

function TierPrice({
  rowKey,
  tier,
  a3LimitBps,
  value,
  disabled,
  onChange,
}: {
  rowKey: string;
  tier: ColourTier;
  a3LimitBps: number;
  value: string;
  disabled?: boolean;
  onChange: (pesos: string) => void;
}) {
  const id = `colour-${rowKey}-${tier}`;
  const offered = value.trim() !== "";
  return (
    <Field
      orientation="horizontal"
      className="border-outline-subtle items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
    >
      <CoverageGlyph bps={tierBand(tier, a3LimitBps).to} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <FieldLabel htmlFor={id}>
          <span className="text-body text-text-primary" style={medium}>
            {tierLabel(tier, a3LimitBps)}
          </span>
        </FieldLabel>
        <span className="text-caption text-text-secondary">{tierHint(tier, a3LimitBps)}</span>
      </div>
      <div className="relative w-36 shrink-0">
        <span
          aria-hidden
          className="text-body text-text-secondary pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        >
          ₱
        </span>
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          className={cn("pl-7 tabular-nums", !offered && "border-dashed")}
          value={value}
          placeholder="Not offered"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </Field>
  );
}
