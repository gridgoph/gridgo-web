"use client";

import { Suspense } from "react";

import { IssueReportsDesk } from "@/components/issue-reports/IssueReportsDesk";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Operations: issues filed from the website's Report an issue page. GitHub
 * tracker links are Super Admin's, so this desk never shows one.
 */
export default function OpsIssueReportsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[calc(100dvh-5rem)] w-full" />}>
      <IssueReportsDesk />
    </Suspense>
  );
}
