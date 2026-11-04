"use client";

import { Suspense } from "react";

import { IssueReportsDesk } from "@/components/issue-reports/IssueReportsDesk";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Operations: issues filed from the website's Report an issue page or the
 * app's Report a problem screen. GitHub tracker links are Super Admin's, so
 * this desk never shows one.
 */
export default function OpsIssueReportsPage() {
  const { user } = useAuth();
  return (
    <Suspense fallback={<Skeleton className="h-[calc(100dvh-5rem)] w-full" />}>
      <IssueReportsDesk viewerId={user?.id ?? null} />
    </Suspense>
  );
}
