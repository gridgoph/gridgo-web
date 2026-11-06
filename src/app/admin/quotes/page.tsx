"use client";

import { Suspense } from "react";

import { QuoteQueue } from "@/components/quotes/QuoteQueue";
import { SkeletonCards } from "@/components/ui/loading";

export default function AdminQuotesPage() {
  return (
    <Suspense
      fallback={
        <SkeletonCards count={3} lines={2} label="Loading quote requests" className="gap-3" />
      }
    >
      <QuoteQueue tree="admin" />
    </Suspense>
  );
}
