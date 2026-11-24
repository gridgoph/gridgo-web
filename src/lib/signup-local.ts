/**
 * The little a sign-up keeps in this browser tab before GRIDGO has it:
 * step 0's answers (asked before the account exists, so they wait out the
 * trip through account creation), who takes jobs, and the enrollment key that
 * makes "Open my shop" safe to press twice.
 *
 * Session storage, not local: a shared counter PC forgets it with the tab,
 * and nothing here is a name or a number. GRIDGO holds everything else.
 */

import type { Eligibility, JobsHandledBy } from "@/lib/guided-signup";

const KEY = "gridgo.supplierSignup.v1";

export type SignupLocal = {
  eligibility?: Eligibility;
  jobsHandledBy?: JobsHandledBy;
  enrollKey?: string;
};

export function readSignupLocal(): SignupLocal {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as SignupLocal) : {};
  } catch {
    return {};
  }
}

export function patchSignupLocal(patch: Partial<SignupLocal>): SignupLocal {
  const next = { ...readSignupLocal(), ...patch };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private mode: the answers stay on screen; GRIDGO saves them next. */
  }
  return next;
}

export function clearSignupLocal(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}

/** One key per enrollment attempt, kept until it succeeds or terms change. */
export function enrollmentKey(existing: string | undefined): string {
  if (existing && /^[A-Za-z0-9._:-]{1,200}$/.test(existing)) return existing;
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `web-signup:${random}`;
}
