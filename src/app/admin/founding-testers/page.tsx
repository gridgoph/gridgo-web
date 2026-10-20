"use client";

import { Suspense } from "react";

import { FoundingTestersDesk } from "@/components/founding-testers/FoundingTestersDesk";
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
      <FoundingTestersDesk tree="admin" />
    </Suspense>
  );
}
