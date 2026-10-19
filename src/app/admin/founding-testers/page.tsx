"use client";

import { Suspense } from "react";

import { FoundingTestersList } from "@/components/founding-testers/FoundingTestersList";
import { SkeletonCards } from "@/components/ui/loading";

export default function AdminFoundingTestersPage() {
  return (
    <Suspense
      fallback={
        <SkeletonCards
          count={3}
          lines={2}
          label="Loading Founding Testers"
          className="gap-3"
        />
      }
    >
      <FoundingTestersList tree="admin" />
    </Suspense>
  );
}
