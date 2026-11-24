/**
 * Whose QR a shop is paid to, and GRIDGO's payout consent (guided sign-up,
 * gridgo-api `docs/SUPPLIER_SIGNUP_API.md` "Existing payout account, added
 * consent and destination pause"). Mirrors the shop app's `lib/payoutAccount.ts`.
 *
 * There is no name-match rule: a shop may be paid to family, a friend or
 * staff, and says so. The consent is GRIDGO's sentence, sent back word for
 * word, never ours. Changing a saved destination pauses payouts for 24 hours.
 */

import type { PayoutHolder, SupplierPayoutAccount, SupplierPayoutAccountPatch } from "@/lib/api/types";

export const HOLDER_OPTIONS: readonly { value: PayoutHolder; label: string; detail: string }[] = [
  { value: "mine", label: "Mine", detail: "Akoa" },
  { value: "family", label: "Family", detail: "Pamilya" },
  { value: "friend", label: "Friend", detail: "Higala" },
  { value: "staff", label: "Staff", detail: "Trabahante" },
];

export const OWNER_ONLY_CHANGE_NOTE = "Only the owner can change this. A change pauses payouts for 24 hours.";

/**
 * Holder and consent ride every save once GRIDGO asks for them: GRIDGO takes
 * them together and wants them again with any change to where money goes.
 */
export function withConsent(
  patch: SupplierPayoutAccountPatch,
  account: SupplierPayoutAccount | null,
  draft: { holder: PayoutHolder | null; consented: boolean },
  wording: string | null,
): SupplierPayoutAccountPatch {
  if (!wording || !draft.holder) return patch;
  const holderChanged = draft.holder !== (account?.holder ?? null);
  if (!holderChanged && !Object.keys(patch).length) return patch;
  return {
    ...patch,
    holder: draft.holder,
    ...(draft.consented ? { consent: { accepted: true as const, wording } } : {}),
  };
}

/**
 * Whether saving this patch changes where an existing payout goes, which
 * GRIDGO answers by pausing payouts for 24 hours. A first QR is not a change.
 */
export function pausesPayouts(account: SupplierPayoutAccount | null, patch: SupplierPayoutAccountPatch): boolean {
  if (!account?.qr) return false;
  return (
    "provider" in patch ||
    "accountName" in patch ||
    "accountNumber" in patch ||
    "institution" in patch ||
    "qrFileId" in patch ||
    (patch.holder !== undefined && account.holder != null && patch.holder !== account.holder)
  );
}

/** Until when a destination change has paused payouts; null when paid as normal. */
export function payoutPausedUntil(account: SupplierPayoutAccount | null): string | null {
  const status = account?.payoutStatus;
  return status?.held === true && typeof status.pausedUntil === "string" ? status.pausedUntil : null;
}

/** "Tue, 25 Nov, 6:30 PM" in Davao time. */
export function pausedLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "tomorrow";
  return at.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function nameOnQrHint(holder: PayoutHolder | null): string {
  return holder && holder !== "mine"
    ? "The QR owner's name, as the wallet shows it after a scan."
    : "The name the wallet shows Operations after the scan, so they know it is you.";
}
