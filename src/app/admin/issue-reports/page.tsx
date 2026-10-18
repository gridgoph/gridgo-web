"use client";

import { IssueReportsDesk } from "@/components/issue-reports/IssueReportsDesk";

/** Super Admin: the same issue reports Operations sees, plus their GitHub tracker links. */
export default function AdminIssueReportsPage() {
  return <IssueReportsDesk trackerLinks />;
}
