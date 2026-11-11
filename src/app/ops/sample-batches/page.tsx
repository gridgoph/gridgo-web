"use client";

import { Suspense } from "react";

import { SampleBatchQueue } from "@/components/sample-batches/SampleBatchQueue";
import { SkeletonCards } from "@/components/ui/loading";

export default function OpsSampleBatchesPage() {
  return (
    <Suspense
      fallback={
        <SkeletonCards count={3} lines={2} label="Loading sample batches" className="gap-3" />
      }
    >
      <SampleBatchQueue tree="ops" />
    </Suspense>
  );
}
