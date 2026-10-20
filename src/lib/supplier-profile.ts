import type { SupplierProfile, SupplierProfilePatch, SupplierShopPin } from "@/lib/api/client";

export const SHOP_DETAILS_NOT_OPEN_YET =
  "GRIDGO has not opened your shop details here yet. Nothing here is lost — check again shortly, and ask Operations to correct anything that cannot wait.";

export const SHOP_DETAILS_STALE =
  "Your shop details changed somewhere else while this screen was open. Load the latest so nothing you cannot see is overwritten, then make your change again.";

export const CLOSING_DOES_NOT_CANCEL =
  "Closing the shop for a while does not cancel jobs you have already accepted.";

export type ShopDetailDraft = {
  shopName: string;
  contactName: string;
  phone: string;
  pinLabel: string;
  lat: string;
  lng: string;
};

const PHONE = /^(?:\+?63|0)9\d{9}$/;

export function draftFromProfile(profile: SupplierProfile): ShopDetailDraft {
  return {
    shopName: profile.shopName ?? "",
    contactName: profile.contactName ?? "",
    phone: profile.phone ?? "",
    pinLabel: profile.shop?.label ?? "",
    lat: profile.shop ? String(profile.shop.lat) : "",
    lng: profile.shop ? String(profile.shop.lng) : "",
  };
}

/** A typed coordinate. Blank is not 0 (`Number("")` is), so it reads as missing. */
function coordinate(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function pinFromDraft(draft: ShopDetailDraft): SupplierShopPin | null {
  const lat = coordinate(draft.lat);
  const lng = coordinate(draft.lng);
  const label = draft.pinLabel.trim();
  if (!label || lat == null || lng == null) return null;
  return { lat, lng, label };
}

export function shopDetailPatch(
  profile: SupplierProfile,
  draft: ShopDetailDraft,
): SupplierProfilePatch {
  const patch: SupplierProfilePatch = {};
  const shopName = draft.shopName.trim();
  const contactName = draft.contactName.trim();
  const phone = draft.phone.trim();
  if (shopName !== profile.shopName) patch.shopName = shopName;
  if (contactName !== profile.contactName) patch.contactName = contactName;
  if (phone !== (profile.phone ?? "")) patch.phone = phone;
  const next = pinFromDraft(draft);
  const saved = profile.shop;
  const pinMoved =
    !next ||
    !saved ||
    next.lat !== saved.lat ||
    next.lng !== saved.lng ||
    next.label !== saved.label;
  if (next && pinMoved) patch.shop = next;
  return patch;
}

export function shopDetailProblems(draft: ShopDetailDraft): Partial<Record<keyof ShopDetailDraft, string>> {
  const problems: Partial<Record<keyof ShopDetailDraft, string>> = {};
  if (!draft.shopName.trim()) {
    problems.shopName = "Enter the name clients and riders will see on your jobs.";
  }
  if (!draft.contactName.trim()) {
    problems.contactName = "Enter the name of the person GRIDGO should talk to.";
  }
  const phone = draft.phone.replace(/[\s()-]/g, "");
  if (!PHONE.test(phone)) {
    problems.phone = "Enter a Philippine mobile number, for example 0917 123 4567.";
  }
  const lat = coordinate(draft.lat);
  const lng = coordinate(draft.lng);
  if (!draft.pinLabel.trim()) problems.pinLabel = "Name the printing location riders will come to.";
  if (lat == null || lat < -90 || lat > 90) problems.lat = "Enter a latitude between -90 and 90.";
  if (lng == null || lng < -180 || lng > 180) problems.lng = "Enter a longitude between -180 and 180.";
  return problems;
}
