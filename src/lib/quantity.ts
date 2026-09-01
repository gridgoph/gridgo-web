/**
 * Quantity bounds and wording, keyed by the catalog unit.
 *
 * Kept in step with gridgo-client `lib/quantity.ts` so a pack of 100 is never
 * shown as "100 items" on the portal.
 */

export type QuantityBounds = {
  min: number;
  max: number;
  step: number;
  one: string;
  many: string;
};

const BOUNDS: Record<string, QuantityBounds> = {
  sqm: { min: 1, max: 500, step: 1, one: "sqm", many: "sqm" },
  sheet: { min: 1, max: 2000, step: 1, one: "sheet", many: "sheets" },
  pack100: { min: 1, max: 200, step: 1, one: "pack of 100", many: "packs of 100" },
  box100: { min: 1, max: 200, step: 1, one: "box of 100", many: "boxes of 100" },
  piece: { min: 1, max: 1000, step: 1, one: "piece", many: "pieces" },
};

const FALLBACK: QuantityBounds = {
  min: 1,
  max: 1000,
  step: 1,
  one: "item",
  many: "items",
};

export function quantityBounds(unit: string | null | undefined): QuantityBounds {
  if (!unit) return FALLBACK;
  return BOUNDS[unit] ?? FALLBACK;
}

export function clampQuantity(value: number, unit: string | null | undefined): number {
  const bounds = quantityBounds(unit);
  if (!Number.isFinite(value)) return bounds.min;
  const stepped = Math.round(value / bounds.step) * bounds.step;
  return Math.min(bounds.max, Math.max(bounds.min, stepped));
}

/** "4 packs of 100" — what was actually ordered. */
export function describeQuantity(
  value: number | null | undefined,
  unit: string | null | undefined,
): string {
  if (value == null) return "—";
  const count = Number(value);
  if (!Number.isFinite(count)) return "—";
  const bounds = quantityBounds(unit);
  const noun = count === 1 ? bounds.one : bounds.many;
  return `${count} ${noun}`;
}
