"use client";

import { Suspense } from "react";

import { PrivacyRequestsDesk } from "@/components/privacy-requests/PrivacyRequestsDesk";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPrivacyRequestsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <PrivacyRequestsDesk tree="admin" />
    </Suspense>
  );
}
