"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SHOP_STAFF_HOME } from "@/lib/nav";

/**
 * A Staff login on an Owner-only page (prices, products, hours, payouts,
 * team…). The page itself never mounts, so it never reads; the API refuses
 * these routes on its own. One line, one way back.
 */
export function ShopOwnerOnly() {
  return (
    <section
      aria-label="Owner only"
      data-testid="shop-owner-only"
      className="flex flex-col items-start gap-3 rounded-card border border-outline bg-surface p-4 md:p-6"
    >
      <LockKeyhole aria-hidden className="size-6 text-text-muted" />
      {/* The page header already reads "Owner only"; this says what to do. */}
      <p className="text-body text-text-primary m-0">This page is for your shop&rsquo;s Owner.</p>
      <Button variant="secondary" nativeButton={false} render={<Link href={SHOP_STAFF_HOME} />}>
        Open Jobs
      </Button>
    </section>
  );
}
