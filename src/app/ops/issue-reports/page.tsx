"use client";

import { IssueReportsDesk } from "@/components/issue-reports/IssueReportsDesk";

/**
 * Operations: issues filed from the website's Report an issue page. GitHub
 * tracker links are Super Admin's, so this desk never shows one.
 */
export default function OpsIssueReportsPage() {
  return <IssueReportsDesk />;
}
