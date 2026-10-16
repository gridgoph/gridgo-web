"use client";

import { Suspense } from "react";

import { FinishedWorkDesk } from "@/components/handover/FinishedWorkDesk";
import { Skeleton } from "@/components/ui/skeleton";

export default function OpsFinishedWorkPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <FinishedWorkDesk tree="ops" />
    </Suspense>
  );
}
