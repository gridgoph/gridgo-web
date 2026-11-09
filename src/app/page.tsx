"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  PortalAccessDenied,
  PortalAccessUnavailable,
} from "@/components/auth/PortalAccessState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { useAuth } from "@/lib/auth/AuthProvider";
import { preferredPortalRole } from "@/lib/auth/portal-access";
import { homeForRole } from "@/lib/routes";
import { discoverShopInvites, listMyShopMemberships } from "@/lib/api/shop-team";
import { ShopRemovedNotice } from "@/components/shop-team/ShopAccessNotices";
import { JOIN_TOKEN_KEY } from "@/components/shop-team/JoinTeam";

export default function HomePage() {
  const auth = useAuth();
  const router = useRouter();
  const destinationRole = preferredPortalRole(auth.memberships);
  const removedFromShop =
    auth.status === "unavailable" && auth.accessError === "shop_access_removed";
  const noPortal =
    auth.status === "unmapped" ||
    removedFromShop ||
    (auth.status === "mapped" && !destinationRole);
  // A person with no portal yet may be a shop's Staff: an invite link in
  // flight, an email/phone invite waiting for this sign-in, or a shop they
  // already joined from an account that is otherwise a client's.
  const [inviteCheck, setInviteCheck] = useState<"idle" | "checking" | "none">("idle");
  useEffect(() => {
    if (!noPortal || inviteCheck !== "idle") return;
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(JOIN_TOKEN_KEY);
    } catch {
      stored = null;
    }
    if (stored) {
      router.replace("/join-team");
      return;
    }
    setInviteCheck("checking");
    void (async () => {
      const shops = removedFromShop ? [] : await listMyShopMemberships().catch(() => []);
      if (shops.some((shop) => shop.status === "active" || shop.status === "pending")) {
        router.replace("/supplier");
        return;
      }
      const invites = await discoverShopInvites().catch(() => []);
      if (invites.length) router.replace("/join-team");
      else setInviteCheck("none");
    })();
  }, [noPortal, removedFromShop, inviteCheck, router]);

  useEffect(() => {
    if (auth.status === "signed_out") router.replace("/login");
    if (auth.status === "mapped" && destinationRole) {
      router.replace(homeForRole(destinationRole));
    }
  }, [auth.status, destinationRole, router]);

  if (noPortal && inviteCheck === "none" && removedFromShop) {
    return <ShopRemovedNotice onSignOut={() => void auth.signOut()} />;
  }

  if (noPortal && inviteCheck === "none") {
    return (
      <PortalAccessDenied
        body="This signed-in identity is not connected to a supplier, Operations, or Super Admin membership in GRIDGO. Ask GRIDGO Operations to assign portal access, or use another account."
        onSignOut={() => void auth.signOut()}
      />
    );
  }

  if (auth.status === "unavailable") {
    return (
      <PortalAccessUnavailable
        onRetry={() => void auth.refresh()}
        onSignOut={() => void auth.signOut()}
      />
    );
  }

  return (
    <main id="main-content" className="min-h-dvh bg-canvas p-4">
      <LoadingBlock label="Opening your GRIDGO workspace…" />
    </main>
  );
}
