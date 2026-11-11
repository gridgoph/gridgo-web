"use client";

import { Store, UserRoundPlus } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { isApiError } from "@/lib/api/client";
import {
  claimShopInvite,
  discoverShopInvites,
  type ShopInviteClaim,
} from "@/lib/api/shop-team";
import type { ShopInvite } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { JOIN_TEAM_PATH, joinTokenFromHash, shopTeamErrorCopy } from "@/lib/shop-team";

/**
 * Kept for the trip through sign-in only: the fragment does not survive the
 * login redirect, so the token waits in this tab and is cleared once used.
 */
export const JOIN_TOKEN_KEY = "gridgo.joinTeam.token";

function readStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(JOIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(JOIN_TOKEN_KEY, token);
    else window.sessionStorage.removeItem(JOIN_TOKEN_KEY);
  } catch {
    /* Private mode: the link still works while this page stays open. */
  }
}

/** Codes after which this invite can never be used: forget it. */
const DEAD_INVITE = new Set([
  "shop_invite_used",
  "shop_invite_revoked",
  "shop_invite_expired",
  "shop_invite_not_found",
  "invalid_shop_invite_claim",
]);

type Phase =
  | { kind: "reading" }
  | { kind: "signed_out" }
  | { kind: "token"; token: string }
  | { kind: "discovering" }
  | { kind: "invites"; invites: ShopInvite[] }
  | { kind: "joining" };

/**
 * `/join-team#token=…`: the link and QR an Owner shares. A signed-in person
 * joins with one tap and waits for the Owner's approval; a signed-out person
 * signs in first and comes back here. Without a token, it lists the email and
 * phone invites waiting for this sign-in.
 */
export function JoinTeam() {
  const auth = useAuth();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const signedInAs =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.primaryPhoneNumber?.phoneNumber ??
    auth.user?.email ??
    null;
  const switchAccount = () =>
    void auth.signOut({
      redirectUrl: `/login?redirect_url=${encodeURIComponent(`${window.location.origin}${JOIN_TEAM_PATH}`)}`,
    });
  const [phase, setPhase] = useState<Phase>({ kind: "reading" });
  const [error, setError] = useState<string | null>(null);

  const signedOut = auth.status === "signed_out";
  const ready = auth.status !== "checking";

  useEffect(() => {
    if (!ready) return;
    const fromHash = joinTokenFromHash(window.location.hash);
    if (fromHash) {
      storeToken(fromHash);
      // The token leaves the address bar so it is not copied or bookmarked.
      window.history.replaceState(null, "", JOIN_TEAM_PATH);
    }
    const token = fromHash ?? readStoredToken();
    if (signedOut) {
      setPhase({ kind: "signed_out" });
      return;
    }
    if (token) {
      setPhase({ kind: "token", token });
      return;
    }
    setPhase({ kind: "discovering" });
    void discoverShopInvites()
      .then((invites) => setPhase({ kind: "invites", invites }))
      .catch((caught) => {
        setError(shopTeamErrorCopy(isApiError(caught) ? caught.code : null));
        setPhase({ kind: "invites", invites: [] });
      });
  }, [ready, signedOut]);

  const join = useCallback(
    async (claim: ShopInviteClaim) => {
      setError(null);
      setPhase({ kind: "joining" });
      try {
        await claimShopInvite(claim);
        storeToken(null);
        await auth.refresh();
        router.replace("/supplier");
      } catch (caught) {
        const code = isApiError(caught) ? caught.code : null;
        if (code === "shop_member_exists") {
          storeToken(null);
          router.replace("/supplier");
          return;
        }
        if (code && DEAD_INVITE.has(code)) storeToken(null);
        setError(shopTeamErrorCopy(code));
        setPhase(
          "token" in claim && !(code && DEAD_INVITE.has(code))
            ? { kind: "token", token: claim.token }
            : { kind: "invites", invites: [] },
        );
      }
    },
    [auth, router],
  );

  if (phase.kind === "reading" || phase.kind === "discovering" || phase.kind === "joining") {
    return (
      <Frame>
        <LoadingBlock label={phase.kind === "joining" ? "Joining…" : "Checking your invite…"} />
      </Frame>
    );
  }

  if (phase.kind === "signed_out") {
    return (
      <Frame>
        <Card
          icon={<UserRoundPlus className="size-6" />}
          title="Join your shop on GRIDGO"
          body="Sign in to accept the invite."
        >
          <Button
            variant="primary"
            fullWidth
            nativeButton={false}
            onClick={() => {
              const back = `${window.location.origin}${JOIN_TEAM_PATH}`;
              window.location.assign(`/login?redirect_url=${encodeURIComponent(back)}`);
            }}
          >
            Sign in
          </Button>
          <p className="text-caption text-text-muted m-0">
            No account yet? Create one in the GRIDGO Supplier app, then open this link again.
          </p>
        </Card>
      </Frame>
    );
  }

  if (phase.kind === "token") {
    return (
      <Frame>
        <Card
          icon={<UserRoundPlus className="size-6" />}
          title="You're invited to a shop"
          body="Join as Staff. The Owner approves you next."
          error={error}
        >
          <Button variant="primary" fullWidth onClick={() => void join({ token: phase.token })}>
            Join
          </Button>
          <SignedInAs email={signedInAs} onSwitch={switchAccount} />
        </Card>
      </Frame>
    );
  }

  // Invites found by this sign-in's verified email or phone.
  return (
    <Frame>
      <Card
        icon={<Store className="size-6" />}
        title={phase.invites.length ? "Shops inviting you" : "No invite found"}
        body={
          phase.invites.length
            ? "Join as Staff. The Owner approves you next."
            : "Ask the shop's Owner for an invite link or QR code."
        }
        error={error}
      >
        {phase.invites.length ? (
          <ul className="m-0 flex w-full list-none flex-col gap-2 p-0">
            {phase.invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-3 rounded-card border border-outline px-3 py-2"
              >
                <span className="text-body text-text-primary truncate" style={{ fontFamily: "var(--font-medium)" }}>
                  {invite.shop?.name ?? "A print shop"}
                </span>
                <Button
                  variant={phase.invites.length === 1 ? "primary" : "secondary"}
                  onClick={() => void join({ inviteId: invite.id })}
                >
                  Join
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <SignedInAs email={signedInAs} onSwitch={switchAccount} />
      </Card>
    </Frame>
  );
}

function SignedInAs({ email, onSwitch }: { email?: string | null; onSwitch: () => void }) {
  return (
    <p className="text-caption text-text-muted m-0">
      {email ? `Signed in as ${email}. ` : ""}
      <button type="button" className="min-h-11 underline" onClick={onSwitch}>
        Use another account
      </button>
    </p>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

function Card({
  icon,
  title,
  body,
  error,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="join-title"
      data-testid="join-team"
      className="flex flex-col items-center gap-3 rounded-card border border-outline bg-surface p-6 text-center md:p-8"
    >
      <span
        aria-hidden
        className="flex size-14 items-center justify-center rounded-pill border border-outline bg-surface-variant text-text-secondary"
      >
        {icon}
      </span>
      <h1 id="join-title" className="text-h2 text-text-primary m-0">
        {title}
      </h1>
      <p className="text-body text-text-secondary m-0">{body}</p>
      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex w-full flex-col items-center gap-3">{children}</div>
    </section>
  );
}
