/**
 * Clerk is intentionally opt-in while gridgo-api still defaults to legacy
 * sessions. A publishable key alone never changes the hosted portal's auth
 * behavior; the rollout flag must be compiled into the web build as well.
 */
export function isClerkAuthEnabled(): boolean {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return (
    process.env.NEXT_PUBLIC_GRIDGO_AUTH_MODE === "clerk" &&
    typeof publishableKey === "string" &&
    publishableKey.startsWith("pk_")
  );
}
