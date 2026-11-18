"use client";

import { Suspense } from "react";

import { CashDesk } from "@/components/cash/CashDesk";
import { SkeletonCards } from "@/components/ui/loading";

export default function AdminCashPage() {
  return (
    <Suspense
      fallback={
        <SkeletonCards count={3} lines={3} label="Loading cash on delivery" className="gap-3" />
      }
    >
      <CashDesk />
    </Suspense>
  );
}
