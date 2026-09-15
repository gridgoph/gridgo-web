/**
 * The vehicle a rider drives, drawn the same way everywhere it appears.
 *
 * One glyph set feeds three surfaces: the map pin (Leaflet wants an HTML
 * string), the dispatch board and the rider roster (React). Keeping the path
 * data here means the eye can link a pin on the map to a row in the list.
 *
 * Bicycle, car and truck are lucide's own icons so they sit with the rest of
 * the portal's iconography. Motorcycle and van do not exist in lucide, so they
 * are drawn on the same 24-unit grid with the same 2-unit round stroke.
 */

import type { VehicleType } from "@/lib/api/types";

export const VEHICLE_TYPES: readonly VehicleType[] = [
  "motorcycle",
  "car",
  "van",
  "truck",
  "bicycle",
];

export type GlyphNode =
  | readonly ["path", { readonly d: string }]
  | readonly ["circle", { readonly cx: number; readonly cy: number; readonly r: number }];

export type VehicleGlyph = {
  /** Plain-language name. Never the API string. */
  label: string;
  nodes: readonly GlyphNode[];
};

const GLYPHS: Record<VehicleType, VehicleGlyph> = {
  motorcycle: {
    label: "Motorcycle",
    nodes: [
      ["circle", { cx: 5.5, cy: 17.5, r: 3.5 }],
      ["circle", { cx: 18.5, cy: 17.5, r: 3.5 }],
      ["path", { d: "M5.5 17.5 7.5 12h4.5l2.5 3H18" }],
      ["path", { d: "M12 12l2-4.5h2.5" }],
      ["path", { d: "M14 7.5l4.5 10" }],
    ],
  },
  bicycle: {
    label: "Bicycle",
    nodes: [
      ["circle", { cx: 18.5, cy: 17.5, r: 3.5 }],
      ["circle", { cx: 5.5, cy: 17.5, r: 3.5 }],
      ["circle", { cx: 15, cy: 5, r: 1 }],
      ["path", { d: "M12 17.5V14l-3-3 4-3 2 3h2" }],
    ],
  },
  car: {
    label: "Car",
    nodes: [
      [
        "path",
        {
          d: "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2",
        },
      ],
      ["circle", { cx: 7, cy: 17, r: 2 }],
      ["path", { d: "M9 17h6" }],
      ["circle", { cx: 17, cy: 17, r: 2 }],
    ],
  },
  van: {
    label: "Van",
    nodes: [
      [
        "path",
        { d: "M2 17V8a1 1 0 0 1 1-1h10.6a1 1 0 0 1 .8.4L18 12h3a1 1 0 0 1 1 1v4" },
      ],
      ["path", { d: "M13 7v5h5" }],
      ["path", { d: "M2 17h3M9 17h6M19 17h3" }],
      ["circle", { cx: 7, cy: 17, r: 2 }],
      ["circle", { cx: 17, cy: 17, r: 2 }],
    ],
  },
  truck: {
    label: "Truck",
    nodes: [
      ["path", { d: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" }],
      ["path", { d: "M15 18H9" }],
      [
        "path",
        {
          d: "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14",
        },
      ],
      ["circle", { cx: 17, cy: 18, r: 2 }],
      ["circle", { cx: 7, cy: 18, r: 2 }],
    ],
  },
};

/** A rider whose profile has no vehicle on file yet. */
const UNKNOWN: VehicleGlyph = {
  label: "Vehicle not on file",
  nodes: [
    ["circle", { cx: 12, cy: 12, r: 3 }],
    ["path", { d: "M12 2v3M12 19v3M2 12h3M19 12h3" }],
  ],
};

export function isVehicleType(value: unknown): value is VehicleType {
  return (
    typeof value === "string" && (VEHICLE_TYPES as readonly string[]).includes(value)
  );
}

/** Label and glyph for a vehicle type, or the honest "not on file" fallback. */
export function presentVehicle(vehicleType: string | null | undefined): VehicleGlyph {
  return isVehicleType(vehicleType) ? GLYPHS[vehicleType] : UNKNOWN;
}

/** "Motorcycle · ABC 1234", or just the vehicle when no plate is known. */
export function vehicleSummary(
  vehicleType: string | null | undefined,
  plateNumber: string | null | undefined,
): string {
  const { label } = presentVehicle(vehicleType);
  const plate = plateNumber?.trim();
  return plate ? `${label} · ${plate}` : label;
}

/**
 * The glyph as inline SVG markup, for surfaces outside React such as a Leaflet
 * pin. `currentColor` lets the pin's CSS decide the stroke.
 */
export function vehicleGlyphSvg(
  vehicleType: string | null | undefined,
  size = 20,
): string {
  const { nodes } = presentVehicle(vehicleType);
  const body = nodes
    .map(([tag, attrs]) =>
      tag === "path"
        ? `<path d="${attrs.d}"/>`
        : `<circle cx="${attrs.cx}" cy="${attrs.cy}" r="${attrs.r}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
