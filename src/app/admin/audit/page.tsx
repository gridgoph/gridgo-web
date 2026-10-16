"use client";

import { Suspense } from "react";

import { AuditLog } from "@/components/audit/AuditLog";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <AuditLog />
    </Suspense>
  );
}
