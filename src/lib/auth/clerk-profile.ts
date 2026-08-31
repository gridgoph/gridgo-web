/**
 * Present the signed-in Clerk person on the portal chrome.
 * GRIDGO memberships still decide which rail they are in; they are not the name.
 */

export type ClerkProfileSource = {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
};

/** First letters of the display name — used when Clerk has no photo yet. */
export function displayInitials(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0];
    const last = parts[parts.length - 1]?.[0];
    if (first && last) return `${first}${last}`.toUpperCase();
  }
  if (parts[0] && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  if (parts[0]?.[0]) return parts[0][0].toUpperCase();
  return "?";
}

export function clerkProfileName(
  clerk: ClerkProfileSource | null | undefined,
  fallback: string,
): string {
  const joined = [clerk?.firstName, clerk?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  for (const candidate of [clerk?.fullName, joined, clerk?.username]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

export function clerkProfileEmail(
  clerk: ClerkProfileSource | null | undefined,
  fallback: string,
): string {
  return clerk?.primaryEmailAddress?.emailAddress?.trim() || fallback;
}

export function clerkProfileImageUrl(
  clerk: ClerkProfileSource | null | undefined,
): string | undefined {
  const url = clerk?.imageUrl?.trim();
  return url || undefined;
}
