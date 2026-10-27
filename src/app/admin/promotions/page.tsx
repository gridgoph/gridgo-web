"use client";

import { Suspense } from "react";

import { PromotionsDesk } from "@/components/promotions/PromotionsDesk";
import { SkeletonCards } from "@/components/ui/loading";

export default function AdminPromotionsPage() {
  return (
    <Suspense fallback={<SkeletonCards count={4} lines={3} label="Loading promotions" className="gap-3" />}>
      <PromotionsDesk tree="admin" />
    </Suspense>
  );
}
