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
      <div className="flex flex-col gap-3">
        <p className="text-body m-0 text-text-secondary">
          You are already signed in. Continue to the portal, or log out to use a
          different Google account.
        </p>
        <Button
          variant="primary"
          fullWidth
          nativeButton={false}
          onClick={() => {
            window.location.assign("/");
          }}
        >
          Continue to portal
        </Button>
        <SignOutButton redirectUrl="/login">
          <Button variant="outline" fullWidth>
            Log out
          </Button>
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
