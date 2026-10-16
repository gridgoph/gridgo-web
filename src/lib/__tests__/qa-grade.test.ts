import { describe, expect, it } from "vitest";

import type { Order, StoredFile } from "@/lib/api/types";
import {
  acceptedUploadWarning,
  addressFacts,
  effectiveDpi,
  fileDetailFacts,
  hasProblem,
  quantityFacts,
  specComparison,
} from "@/lib/qa-grade";

function file(detected: StoredFile["detected"]): StoredFile {
  return {
    fileId: "file_1",
    purpose: "artwork",
    originalFilename: "flyer.pdf",
    declaredContentType: "application/pdf",
    detectedContentType: "application/pdf",
    size: 1000,
    ownerId: "client",
    state: "ready",
    createdAt: "2026-10-15T02:00:00.000Z",
    readyAt: "2026-10-15T02:00:00.000Z",
    deleteRequestedAt: null,
    deletedAt: null,
    references: [],
    detected,
  };
}

const order = {
  size: "A5",
  material: "C2S 300",
  finish: "Matte laminate",
  quantity: 100,
  unit: "piece",
  subtotalMinor: 150000,
  totalMinor: 180000,
  address: "12 Quimpo Blvd, Davao City (blue gate)",
  zone: "davao_central",
  deliveryDistanceMeters: 2400,
  productionItems: [{ id: "line", itemName: "Flyers", quantity: 100, measurement: { pages: 2 } }],
} as Order;

describe("file details", () => {
  it("grades a PDF from the facts the upload stored, and skips what it did not", () => {
    const facts = fileDetailFacts([
      file({
        kind: "pdf",
        pageCount: 2,
        pixelWidth: null,
        pixelHeight: null,
        dpi: null,
        measureUnit: "mm",
        widthMilli: 148000,
        heightMilli: 210000,
        pageSize: "A5",
        orientation: "portrait",
        colorMode: "cmyk",
        fonts: [{ name: "Arial", embedded: true }],
        bleedMilli: 3000,
        hasAlpha: null,
      }),
    ], order);
    expect(facts.find((fact) => fact.id === "page-size")).toMatchObject({ grade: "good" });
    expect(facts.find((fact) => fact.id === "color")?.value).toBe("CMYK");
    expect(facts.find((fact) => fact.id === "fonts")?.grade).toBe("good");
    expect(facts.find((fact) => fact.id === "bleed")).toMatchObject({ value: "3 mm", grade: "good" });
    expect(facts.find((fact) => fact.id === "pages")?.grade).toBe("good");
  });

  it("marks a missing embed and a short bleed as problems", () => {
    const facts = fileDetailFacts([
      file({
        kind: "pdf",
        pageCount: 1,
        pixelWidth: null,
        pixelHeight: null,
        dpi: null,
        measureUnit: "mm",
        widthMilli: 210000,
        heightMilli: 297000,
        pageSize: "A4",
        orientation: "portrait",
        colorMode: null,
        fonts: [{ name: "Arial", embedded: false }],
        bleedMilli: 0,
      }),
    ], order);
    expect(facts.find((fact) => fact.id === "color")).toBeUndefined();
    expect(facts.find((fact) => fact.id === "fonts")?.grade).toBe("problem");
    expect(facts.find((fact) => fact.id === "bleed")?.grade).toBe("problem");
    expect(facts.find((fact) => fact.id === "page-size")?.grade).toBe("problem");
  });

  it("grades an image at the ordered size, not the file's header DPI", () => {
    const low = effectiveDpi({ width: 540, height: 720 }, { width: 148000, height: 210000 });
    expect(low).toBeLessThan(150);
    const facts = fileDetailFacts([
      file({
        kind: "raster",
        pageCount: 1,
        pixelWidth: 540,
        pixelHeight: 720,
        dpi: 300,
        measureUnit: null,
        widthMilli: null,
        heightMilli: null,
        pageSize: null,
        orientation: null,
        colorMode: "rgb",
        hasAlpha: false,
      }),
    ], order);
    expect(facts.find((fact) => fact.id === "pixels")?.value).toBe("540 × 720");
    expect(facts.find((fact) => fact.id === "dpi")?.grade).toBe("problem");
    expect(facts.find((fact) => fact.id === "dpi")?.value).not.toMatch(/^300/);
  });

  it("shows an accepted upload warning only when that record exists", () => {
    expect(acceptedUploadWarning([file({ kind: "pdf", pageCount: 1, pixelWidth: null, pixelHeight: null, dpi: null, measureUnit: null, widthMilli: null, heightMilli: null, pageSize: null, orientation: null })])).toBeNull();
    expect(acceptedUploadWarning([
      file({
        kind: "raster",
        pageCount: 1,
        pixelWidth: 10,
        pixelHeight: 10,
        dpi: null,
        measureUnit: null,
        widthMilli: null,
        heightMilli: null,
        pageSize: null,
        orientation: null,
        acceptedWarning: { at: "2026-10-15T01:00:00.000Z", message: "Soft at this size" },
      }),
    ])).toEqual({ at: "2026-10-15T01:00:00.000Z", text: "Soft at this size" });
  });
});

describe("specification table", () => {
  it("compares size, orientation and pages, and leaves paper to the eye", () => {
    const { rows, instructions } = specComparison(order, [
      file({
        kind: "pdf",
        pageCount: 2,
        pixelWidth: null,
        pixelHeight: null,
        dpi: null,
        measureUnit: "mm",
        widthMilli: 148000,
        heightMilli: 210000,
        pageSize: "A5",
        orientation: "portrait",
      }),
    ]);
    expect(rows.map((row) => row.item)).toEqual(["Size", "Orientation", "Pages", "Paper", "Finish", "Binding"]);
    expect(rows.find((row) => row.item === "Size")?.match).toBe("Match");
    expect(rows.find((row) => row.item === "Pages")?.match).toBe("Match");
    expect(rows.find((row) => row.item === "Paper")).toMatchObject({
      ordered: "C2S 300",
      match: "Check by eye",
    });
    expect(instructions).toBeNull();
  });

  it("keeps colour, sides, bleed and layout out until the order carries them", () => {
    const withSides = {
      ...order,
      productionItems: [{
        ...order.productionItems![0],
        structuredSpec: { sides: "Both sides" },
        specialInstructions: undefined,
      }],
      specialInstructions: "Keep the logo off the fold.",
    } as unknown as Order;
    const { rows, instructions } = specComparison(withSides, []);
    expect(rows.map((row) => row.item)).toContain("Sides");
    expect(rows.map((row) => row.item)).not.toContain("Colour mode");
    expect(rows.map((row) => row.item)).not.toContain("Bleed");
    expect(instructions).toBe("Keep the logo off the fold.");
  });
});

describe("quantity and the pin", () => {
  it("reads quantity, unit price and total from the order", () => {
    expect(quantityFacts(order)).toMatchObject({
      quantity: "100 pieces",
      unitPrice: "₱15.00",
      total: "₱1,800.00",
    });
  });

  it("shows the pin warning and confirmation only when those fields exist", () => {
    expect(addressFacts(order).warning).toBeNull();
    expect(addressFacts(order).pinStatus).toBeNull();
    expect(addressFacts(order).landmark).toBe("blue gate");
    expect(addressFacts(order).distance).toBe("2.4 km from the shop");
    const warned = addressFacts({
      ...order,
      dropoff: { lat: 7.07, lng: 125.61, label: "Gate" },
      dropoffConfirmation: { status: "confirmed", point: { lat: 7.08, lng: 125.62, label: "Gate" } },
      pinFarFromAddress: true,
    });
    expect(warned.pinStatus).toBe("Pin confirmed");
    expect(warned.warning).toMatch(/far from the address/);
    expect(warned.pin).toMatchObject({ lat: 7.08, lng: 125.62 });
  });

  it("treats a different size as a problem the desk can act on", () => {
    const facts = fileDetailFacts([], order);
    const { rows } = specComparison(order, [
      file({
        kind: "pdf",
        pageCount: 2,
        pixelWidth: null,
        pixelHeight: null,
        dpi: null,
        measureUnit: "mm",
        widthMilli: 210000,
        heightMilli: 297000,
        pageSize: "A4",
        orientation: "portrait",
      }),
    ]);
    expect(hasProblem(facts, rows)).toBe(true);
  });
});
