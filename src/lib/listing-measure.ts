import {
  MEASURE_UNITS,
  measurementKind,
  type MeasureUnit,
  type PricingUnit,
} from "@/lib/listings";

/** Thousandths of the shop's measure unit, which is how the platform stores a size. */
export function toMilli(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1000);
}

export function fromMilli(value: number | null): number | null {
  return value == null ? null : value / 1000;
}

export function needsMeasure(unit: PricingUnit): boolean {
  const kind = measurementKind(unit);
  return kind === "area" || kind === "length";
}

/**
 * Area and length listings need a unit. The price step shows feet until the
 * shop picks another, so a save does not send `measureUnit: null`.
 */
export function measureUnitFor(
  unit: PricingUnit,
  current: MeasureUnit | null,
): MeasureUnit | null {
  return needsMeasure(unit) ? current ?? "ft" : null;
}

export function isMeasureUnit(value: string): value is MeasureUnit {
  return (MEASURE_UNITS as readonly string[]).includes(value);
}

export type BillableDraft = {
  pricingUnit: PricingUnit;
  measureUnit: MeasureUnit | null;
  minimumWidth: number | null;
  minimumHeight: number | null;
  minimumLength: number | null;
};

/** Fields that only exist for the current pricing unit. Others are cleared. */
export function billablePayload(draft: BillableDraft): Record<string, unknown> {
  const kind = measurementKind(draft.pricingUnit);
  return {
    measureUnit: measureUnitFor(draft.pricingUnit, draft.measureUnit),
    minimumWidthMilli: kind === "area" ? toMilli(draft.minimumWidth) : null,
    minimumHeightMilli: kind === "area" ? toMilli(draft.minimumHeight) : null,
    minimumLengthMilli: kind === "length" ? toMilli(draft.minimumLength) : null,
  };
}

/** Why a measured listing cannot be saved. Null when the API would accept it. */
export function billableProblem(draft: BillableDraft): string | null {
  const kind = measurementKind(draft.pricingUnit);
  if (kind !== "area" && kind !== "length") return null;
  if (!draft.measureUnit) return "choose what you measure in.";
  if (kind === "area") {
    const width = toMilli(draft.minimumWidth);
    const height = toMilli(draft.minimumHeight);
    if ((width == null) !== (height == null)) {
      return "a smallest billable size needs both a width and a height.";
    }
  }
  return null;
}
