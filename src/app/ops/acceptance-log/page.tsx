"use client";

import { Suspense } from "react";

import { AcceptanceLog } from "@/components/legal/AcceptanceLog";
import { Skeleton } from "@/components/ui/skeleton";

export default function OpsAcceptanceLogPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <AcceptanceLog tree="ops" />
    </Suspense>
  );
}
