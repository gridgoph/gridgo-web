"use client";

import { SignIn, SignOutButton, useAuth } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

/**
 * Clerk session controls must stay on the client. Rendering SignedIn/SignedOut
 * from the login Server Component calls server auth() and 500s /login in the
 * unsigned smoke container.
 */
export function LoginAuthPanel() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;

  if (isSignedIn) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body m-0 text-text-secondary">
          The previous session is still active. End it before signing in again.
        </p>
        <SignOutButton redirectUrl="/login">
          <Button variant="primary">Log out</Button>
        </SignOutButton>
      </div>
    );
  }

  return (
    <SignIn
      routing="hash"
      fallbackRedirectUrl="/"
      transferable={false}
      withSignUp={false}
    />
  );
}
