"use client";

import { Suspense } from "react";

import { IssueReportsDesk } from "@/components/issue-reports/IssueReportsDesk";
import { Skeleton } from "@/components/ui/skeleton";

/** Super Admin: the same issue reports Operations sees, plus their GitHub tracker links. */
export default function AdminIssueReportsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[calc(100dvh-5rem)] w-full" />}>
      <IssueReportsDesk trackerLinks />
    </Suspense>
  );
}
