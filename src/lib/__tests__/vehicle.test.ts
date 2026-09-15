import { describe, expect, it } from "vitest";

import {
  VEHICLE_TYPES,
  presentVehicle,
  vehicleGlyphSvg,
  vehicleSummary,
} from "@/lib/vehicle";

describe("presentVehicle", () => {
  it("names every vehicle the API allows in plain language", () => {
    expect(VEHICLE_TYPES.map((type) => presentVehicle(type).label)).toEqual([
      "Motorcycle",
      "Car",
      "Van",
      "Truck",
      "Bicycle",
    ]);
  });

  it("never leaks an unknown API string onto the screen", () => {
    expect(presentVehicle("hoverboard").label).toBe("Vehicle not on file");
    expect(presentVehicle(null).label).toBe("Vehicle not on file");
    expect(presentVehicle(undefined).nodes.length).toBeGreaterThan(0);
  });

  it("gives every vehicle a distinct glyph", () => {
    const shapes = new Set(
      VEHICLE_TYPES.map((type) => JSON.stringify(presentVehicle(type).nodes)),
    );
    expect(shapes.size).toBe(VEHICLE_TYPES.length);
  });
});

describe("vehicleSummary", () => {
  it("joins vehicle and plate, and drops a blank plate", () => {
    expect(vehicleSummary("motorcycle", "ABC 1234")).toBe("Motorcycle · ABC 1234");
    expect(vehicleSummary("car", "  ")).toBe("Car");
    expect(vehicleSummary(null, null)).toBe("Vehicle not on file");
  });
});

describe("vehicleGlyphSvg", () => {
  it("renders inline SVG that inherits the pin's colour", () => {
    const svg = vehicleGlyphSvg("truck", 22);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('width="22"');
    expect(svg).toContain("<circle");
    expect(svg).toContain('aria-hidden="true"');
  });
});
