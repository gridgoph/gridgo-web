import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CLIENT = join(process.cwd(), "src/lib/api/client.ts");
const TYPES = join(process.cwd(), "src/lib/api/types.ts");
const SETTINGS = join(
  process.cwd(),
  "src/components/settings/SupplierPayoutSettings.tsx",
);
const RELEASE = join(process.cwd(), "src/components/orders/ReleaseMilestoneDialog.tsx");
const DESK = join(process.cwd(), "src/app/ops/payouts/[id]/page.tsx");

/**
 * The supplier payout account rides the contract in gridgo-api's
 * OPERATIONAL_MODEL_V2_API.md ("Supplier payout account"). These pins keep the
 * portal on that contract rather than on a guessed shape.
 */
describe("supplier payout account client contract", () => {
  it("uploads purpose=supplier_payout_qr and saves it through the account, never attach", () => {
    const src = readFileSync(CLIENT, "utf8");
    expect(src).toMatch(/purpose["'], "supplier_payout_qr"/);
    expect(src).toMatch(/["'`]\/me\/payout-account["'`]/);
    expect(src).toMatch(/export async function getMyPayoutAccount/);
    expect(src).toMatch(/export async function updateMyPayoutAccount/);
    expect(src).toMatch(/export async function uploadPayoutQr/);
    expect(src).toMatch(/\/users\/\$\{encodeURIComponent\(userId\)\}\/payout-account/);
    expect(src).not.toMatch(/supplier_payout_qr[\s\S]{0,400}\/attach/);
  });

  it("types the account on the order projection Operations reads", () => {
    const src = readFileSync(TYPES, "utf8");
    expect(src).toMatch(/export type SupplierPayoutAccount/);
    expect(src).toMatch(/supplierPayoutAccount\?: SupplierPayoutAccount \| null/);
    expect(src).toMatch(/qrFileId\?: string \| null/);
  });

  it("draws the plate on the supplier settings screen with a real file input", () => {
    const src = readFileSync(SETTINGS, "utf8");
    expect(src).toMatch(/uploadPayoutQr/);
    expect(src).toMatch(/payout-qr-file/);
    expect(src).toMatch(/accept="image\/jpeg,image\/png,image\/webp"/);
  });

  it("puts the plate beside the release decision and on the payout desk", () => {
    expect(readFileSync(RELEASE, "utf8")).toMatch(/PayoutQrPlate/);
    expect(readFileSync(DESK, "utf8")).toMatch(/PayoutDestinationCard/);
    expect(readFileSync(DESK, "utf8")).toMatch(
      /destination=\{order\.supplierPayoutAccount/,
    );
  });
});
