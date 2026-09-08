"use client";
import { Suspense } from "react";
import { VerificationQueues } from "@/components/approvals/VerificationQueues";
export default function OpsApprovalsPage() {
  return (
    <Suspense>
      <VerificationQueues />
    </Suspense>
  );
}
