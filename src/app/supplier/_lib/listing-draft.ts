/** The listing a shop started and has not chosen to leave. Session only. */
const DRAFT_KEY = "gridgo.supplierListingDraft";

export function rememberListingDraft(id: string): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, id);
  } catch {
    // A private window that refuses storage still opens the listing.
  }
}

export function readListingDraft(): string | null {
  try {
    return sessionStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

export function forgetListingDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}
