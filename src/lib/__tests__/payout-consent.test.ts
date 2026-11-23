import { describe, expect, it } from "vitest";

import type { SupplierPayoutAccount } from "@/lib/api/types";
import { pausesPayouts, payoutPausedUntil, withConsent } from "@/lib/payout-consent";

const WORDING = "I let GRIDGO pay my shop to this QR.";

function account(extra: Partial<SupplierPayoutAccount> = {}): SupplierPayoutAccount {
  return { qr: { fileId: "f1" }, holder: "mine", version: 1, updatedAt: "" , ...extra } as unknown as SupplierPayoutAccount;
}

describe("payout holder and consent", () => {
  it("sends whose QR and GRIDGO's exact wording with a change", () => {
    expect(withConsent({ qrFileId: "f2" }, null, { holder: "family", consented: true }, WORDING)).toEqual({
      qrFileId: "f2",
      holder: "family",
      consent: { accepted: true, wording: WORDING },
    });
  });

  it("sends nothing new on a GRIDGO that does not ask", () => {
    expect(withConsent({ qrFileId: "f2" }, null, { holder: "family", consented: true }, null)).toEqual({ qrFileId: "f2" });
  });

  it("never sends a consent that was not ticked", () => {
    expect(withConsent({}, account(), { holder: "friend", consented: false }, WORDING)).toEqual({ holder: "friend" });
  });

  it("does not invent a save when nothing moved", () => {
    expect(withConsent({}, account(), { holder: "mine", consented: true }, WORDING)).toEqual({});
  });

  it("warns of the 24-hour pause only when an existing destination changes", () => {
    expect(pausesPayouts(null, { qrFileId: "f2" })).toBe(false);
    expect(pausesPayouts(account(), { qrFileId: "f2" })).toBe(true);
    expect(pausesPayouts(account(), { holder: "staff" })).toBe(true);
    expect(pausesPayouts(account(), { holder: "mine" })).toBe(false);
  });

  it("reads the pause from payoutStatus", () => {
    expect(payoutPausedUntil(account({ payoutStatus: { held: true, pausedUntil: "2026-11-25T10:00:00Z" } }))).toBe(
      "2026-11-25T10:00:00Z",
    );
    expect(payoutPausedUntil(account({ payoutStatus: { held: false, pausedUntil: null } }))).toBeNull();
  });
});
