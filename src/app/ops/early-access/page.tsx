"use client";

import { Suspense } from "react";

import { EarlyAccessDesk } from "@/components/early-access/EarlyAccessDesk";
import { SkeletonCards } from "@/components/ui/loading";

export default function OpsEarlyAccessPage() {
  return (
    <Suspense
      fallback={
        <SkeletonCards
          count={2}
          lines={3}
          label="Loading early access sign-ups"
          className="gap-3"
        />
      }
    >
      <EarlyAccessDesk />
    </Suspense>
  );
}
