import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CLIENT = join(process.cwd(), "src/lib/api/client.ts");
const TYPES = join(process.cwd(), "src/lib/api/types.ts");
const SETTINGS = join(process.cwd(), "src/components/settings/OperationalSettings.tsx");

describe("payment QR client contract", () => {
  it("uploads purpose=payment_qr then activates it on settings", () => {
    const src = readFileSync(CLIENT, "utf8");
    expect(src).toMatch(/purpose["'], "payment_qr"/);
    expect(src).toMatch(/["'`]\/settings\/payment-qr["'`]/);
    expect(src).toMatch(/export async function uploadPaymentQr/);
    expect(src).toMatch(/\/public\/payment-qr/);
  });

  it("types paymentQr.imageUrl on platform settings", () => {
    const src = readFileSync(TYPES, "utf8");
    expect(src).toMatch(/export type PaymentQr/);
    expect(src).toMatch(/paymentQr\?: PaymentQr/);
    expect(src).toMatch(/imageUrl\?: string/);
  });

  it("draws a Payment QR block on the shared operational settings screen", () => {
    const src = readFileSync(SETTINGS, "utf8");
    expect(src).toMatch(/Payment QR/);
    expect(src).toMatch(/uploadPaymentQr/);
    expect(src).toMatch(/payment-qr-file/);
  });
});
