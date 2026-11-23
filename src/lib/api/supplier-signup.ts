/**
 * Guided supplier sign-up (gridgo-api `docs/SUPPLIER_SIGNUP_API.md`): the
 * private draft before the shop exists, enrollment, and the shop's own setup
 * read afterwards. The same calls the shop app makes; nothing here is a
 * second implementation of hours, team or payout routes.
 */

import {
  apiRequest,
  attachCatalogItemPhoto,
  getSignupDocumentSample,
  isApiError,
  listCatalogItems,
  uploadCatalogItemPhoto,
} from "@/lib/api/client";
import { createShopInvite, getMyShopTeam, replaceShopInvite } from "@/lib/api/shop-team";
import {
  readPayoutStatus,
  readSignup,
  readTerms,
  stepRefusal,
  type GuidedSignup,
  type JobsHandledBy,
  type PayoutStatus,
  type SignupTerms,
} from "@/lib/guided-signup";
import { normalizeBoardPage } from "@/lib/listings";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 404/405: this GRIDGO has no guided sign-up. Not an error. */
export function routeAbsent(error: unknown): boolean {
  return isApiError(error) && (error.status === 404 || error.status === 405);
}

function offline(what: string): string {
  return `GRIDGO did not answer, so we could not ${what}. Check your connection and try again.`;
}

export type SignupRead =
  | { status: "ok"; signup: GuidedSignup; terms: SignupTerms }
  | { status: "not_open_yet" }
  | { status: "failed"; message: string };

function readResponse(raw: unknown): SignupRead {
  const body = record(raw);
  const signup = readSignup(body?.signup);
  const terms = readTerms(body);
  if (!signup || !terms) return { status: "not_open_yet" };
  return { status: "ok", signup, terms };
}

/** `GET /auth/clerk/supplier-signup`: the draft for this Clerk sign-in, mapped or not. */
export async function loadGuidedSignup(): Promise<SignupRead> {
  try {
    return readResponse(await apiRequest<unknown>("/auth/clerk/supplier-signup"));
  } catch (error) {
    if (routeAbsent(error)) return { status: "not_open_yet" };
    return { status: "failed", message: offline("load your sign-up") };
  }
}

export type SignupDraftStep = "eligibility" | "shop" | "location" | "prints";

export type StepSave =
  | { status: "ok"; signup: GuidedSignup; terms: SignupTerms }
  | { status: "stale" }
  /** The shop was opened since: this draft is done, carry on in the shop. */
  | { status: "enrolled" }
  | { status: "failed"; message: string; field?: string };

export async function saveSignupStep(
  version: number,
  step: SignupDraftStep,
  value: Record<string, unknown>,
): Promise<StepSave> {
  try {
    const read = readResponse(
      await apiRequest<unknown>("/auth/clerk/supplier-signup", {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion: version, step, value }),
      }),
    );
    if (read.status !== "ok") return { status: "failed", message: "GRIDGO did not save that step. Try again." };
    return read;
  } catch (error) {
    if (!isApiError(error)) return { status: "failed", message: offline("save this step") };
    if (error.code === "supplier_signup_stale") return { status: "stale" };
    if (error.code === "supplier_signup_enrolled") return { status: "enrolled" };
    const field = error.detail<string>("field") ?? null;
    const sentence = stepRefusal(error.code, typeof field === "string" ? field : null);
    if (sentence) return { status: "failed", message: sentence, ...(field ? { field } : {}) };
    if (error.kind === "server") return { status: "failed", message: offline("save this step") };
    return { status: "failed", message: "GRIDGO did not accept that. Check the fields and try again." };
  }
}

export type GuidedEnrollment = {
  signupVersion: number;
  jobsHandledBy: JobsHandledBy;
  legalConsentVersion?: 1;
  legalConsent?: {
    accepted: true;
    versionIds: string[];
    method: "checkbox";
    junior: false;
    marketing: boolean;
    app: string;
    device: string;
  };
};

/** `POST /auth/clerk/enroll/supplier`: opens the shop from the saved draft. Replays by key. */
export async function enrollGuidedSupplier(body: GuidedEnrollment, idempotencyKey: string): Promise<void> {
  await apiRequest<unknown>("/auth/clerk/enroll/supplier", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

export type ShopSignupRead =
  | { status: "ok"; signup: GuidedSignup | null; payoutStatus: PayoutStatus | null }
  | { status: "not_open_yet" }
  | { status: "failed"; message: string };

/** `GET /me/supplier-signup`. A shop that did not use guided sign-up reads `signup: null`. */
export async function loadShopSignup(): Promise<ShopSignupRead> {
  try {
    const body = record(await apiRequest<unknown>("/me/supplier-signup"));
    const signup = readSignup(body?.signup);
    return {
      status: "ok",
      signup: signup && signup.supplierId ? signup : null,
      payoutStatus: readPayoutStatus(body?.payoutStatus),
    };
  } catch (error) {
    if (routeAbsent(error)) return { status: "not_open_yet" };
    return { status: "failed", message: offline("load your setup") };
  }
}

/**
 * GRIDGO's unbranded sample picture for the generated document listings.
 * Fetched with the session; `null` when it cannot be read (the browser may
 * refuse it across origins), and the listing then waits for the shop's own.
 */
export async function fetchDocumentSample(): Promise<File | null> {
  try {
    const blob = await getSignupDocumentSample();
    return new File([blob], "document-sample.png", { type: "image/png" });
  } catch {
    return null;
  }
}

export type OwnerLink = { status: "ok"; token: string } | { status: "failed"; message: string };

/**
 * A manager's 24-hour claim link, tied to the owner's saved mobile. One open
 * link at a time: when one is already out it is replaced, so the newest
 * share is the one that works.
 */
export async function ownerClaimLink(): Promise<OwnerLink> {
  const failed = (): OwnerLink => ({ status: "failed", message: offline("make the owner's link") });
  try {
    const created = await createShopInvite("owner");
    return { status: "ok", token: created.token };
  } catch (error) {
    if (!isApiError(error) || error.code !== "shop_owner_invite_exists") return failed();
    try {
      const team = await getMyShopTeam();
      const open = team.invites.find((invite) => invite.kind === "owner" && invite.status === "open");
      if (!open) return failed();
      const replaced = await replaceShopInvite(open.id);
      return { status: "ok", token: replaced.token };
    } catch {
      return failed();
    }
  }
}

/** The logo picked at sign-up, attached once the shop can own it. Quiet when it fails. */
export async function attachSignupLogo(logo: File | null): Promise<boolean> {
  if (!logo) return false;
  try {
    const body = new FormData();
    body.append("purpose", "supplier_shop_image");
    body.append("file", logo);
    const uploaded = await apiRequest<{ file: { fileId: string } }>("/files", { method: "POST", body });
    await apiRequest<unknown>(`/files/${encodeURIComponent(uploaded.file.fileId)}/attach`, {
      method: "POST",
      body: JSON.stringify({ slot: "logo" }),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * GRIDGO's last setup step is a sample photo on every generated document
 * listing, uploaded **once per listing** (each listing owns its own file).
 * It is the portal's to do, not the shop's, so it runs quietly on each setup
 * read until done; listing review still checks every photo.
 */
export async function addSamplePhotos(): Promise<number> {
  let bare: string[];
  try {
    const page = normalizeBoardPage(await listCatalogItems({ limit: 50 }));
    bare = page.listings.filter((listing) => !listing.photos.length).map((listing) => listing.id);
  } catch {
    return 0;
  }
  if (!bare.length) return 0;
  const sample = await fetchDocumentSample();
  if (!sample) return 0;
  let added = 0;
  for (const id of bare) {
    try {
      const stored = await uploadCatalogItemPhoto(sample);
      await attachCatalogItemPhoto(stored.fileId, id, 0);
      added += 1;
    } catch {
      // Tried again on the next setup read.
    }
  }
  return added;
}
