"use client";

import { SignIn, SignOutButton, useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * `withSignUp={false}` does not stop Clerk drawing its "Don't have an account?
 * Sign up" footer while the instance allows public sign-up, so the staff login
 * hides that one footer action (`footerAction__signIn`). Other footer actions,
 * such as "Use another method", stay.
 */
export const SIGN_IN_APPEARANCE = {
  elements: {
    footerAction__signIn: { display: "none" },
  },
} as const;

/**
 * Clerk session controls must stay on the client. Rendering SignedIn/SignedOut
 * from the login Server Component calls server auth() and 500s /login in the
 * unsigned smoke container.
 */
export function LoginAuthPanel() {
  const { isLoaded, isSignedIn } = useAuth();
  // `?left=shop`: a shop's Owner or Operations removed this login, and the
  // portal ended its session (RoleGate). One line says why they are here.
  const [leftShop, setLeftShop] = useState(false);
  useEffect(() => {
    setLeftShop(new URLSearchParams(window.location.search).get("left") === "shop");
  }, []);

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
    <>
      {leftShop ? (
        <p className="text-body m-0 text-text-secondary" role="status" data-testid="left-shop">
          Your access to the shop was removed.
        </p>
      ) : null}
      <SignIn
      routing="hash"
      fallbackRedirectUrl="/"
      transferable={false}
      withSignUp={false}
      appearance={SIGN_IN_APPEARANCE}
      />
    </>
  );
}
