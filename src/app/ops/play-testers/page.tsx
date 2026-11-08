"use client";

import { Suspense } from "react";

import { PlayTestersDesk } from "@/components/play-testers/PlayTestersDesk";
import { SkeletonCards } from "@/components/ui/loading";

export default function OpsPlayTestersPage() {
  return (
    <Suspense
      fallback={
        <SkeletonCards count={2} lines={3} label="Loading Play testers" className="gap-3" />
      }
    >
      <PlayTestersDesk tree="ops" />
    </Suspense>
  );
}
