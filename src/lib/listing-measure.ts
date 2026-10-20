import {
  MEASURE_UNITS,
  measurementKind,
  type MeasureUnit,
  type PricingUnit,
} from "@/lib/listings";

/** A size as typed. Text keeps "2." while the shop is still typing "2.5". */
export type SizeInput = number | string | null;

function sizeNumber(value: SizeInput): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const text = value.trim();
  return text === "" ? null : Number(text);
}

/** Thousandths of the shop's measure unit, which is how the platform stores a size. */
export function toMilli(value: SizeInput): number | null {
  const size = sizeNumber(value);
  if (size == null || !Number.isFinite(size) || size <= 0) return null;
  return Math.round(size * 1000);
}

export function fromMilli(value: number | null): number | null {
  return value == null ? null : value / 1000;
}

/** The stored size as editable text; blank when there is none. */
export function sizeText(milli: number | null): string {
  const size = fromMilli(milli);
  return size == null ? "" : String(size);
}

/** Typed but not a size above zero, so a save would drop it. */
function unreadable(value: SizeInput): boolean {
  return sizeNumber(value) != null && toMilli(value) == null;
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
  minimumWidth: SizeInput;
  minimumHeight: SizeInput;
  minimumLength: SizeInput;
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
  const typed =
    kind === "area" ? [draft.minimumWidth, draft.minimumHeight] : [draft.minimumLength];
  if (typed.some(unreadable)) return "enter each size as a number above zero, like 2.5.";
  if (kind === "area") {
    const width = toMilli(draft.minimumWidth);
    const height = toMilli(draft.minimumHeight);
    if ((width == null) !== (height == null)) {
      return "a smallest billable size needs both a width and a height.";
    }
  }
  return null;
}
