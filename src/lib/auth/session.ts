/**
 * Session persistence for the portal.
 *
 * Token + role live in cookies so middleware can gate routes without a round
 * trip. The full user object is mirrored in sessionStorage for the client shell.
 *
 * Cookie attributes deliberately avoid long-lived sessions on shared machines:
 * SameSite=Lax, path=/, no multi-day max-age by default (session cookies).
 */

import type { Role, User } from "@/lib/api/types";

export const TOKEN_COOKIE = "gridgo_token";
export const ROLE_COOKIE = "gridgo_role";
export const USER_STORAGE_KEY = "gridgo_user";

function isBrowser(): boolean {
  return typeof document !== "undefined";
}

export function readCookie(name: string): string | null {
  if (!isBrowser()) return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.split("=").slice(1).join("="));
}

export function writeCookie(name: string, value: string): void {
  if (!isBrowser()) return;
  // Session cookie — cleared on browser close. Secure omitted for local http.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

export function clearCookie(name: string): void {
  if (!isBrowser()) return;
  document.cookie = `${name}=; path=/; Max-Age=0; SameSite=Lax`;
}

export function getStoredToken(): string | null {
  return readCookie(TOKEN_COOKIE);
}

export function getStoredRole(): Role | null {
  const role = readCookie(ROLE_COOKIE);
  if (
    role === "supplier" ||
    role === "ops_admin" ||
    role === "super_admin" ||
    role === "client" ||
    role === "rider"
  ) {
    return role;
  }
  return null;
}

export function getStoredUser(): User | null {
  if (!isBrowser()) return null;
  try {
    const raw = sessionStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function persistSession(token: string, user: User): void {
  writeCookie(TOKEN_COOKIE, token);
  writeCookie(ROLE_COOKIE, user.role);
  if (isBrowser()) {
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }
}

/**
 * Clear session thoroughly so the back button cannot re-enter a protected
 * area with a stale token (the mobile apps had this bug).
 */
export function clearSession(): void {
  clearCookie(TOKEN_COOKIE);
  clearCookie(ROLE_COOKIE);
  if (isBrowser()) {
    sessionStorage.removeItem(USER_STORAGE_KEY);
  }
}
