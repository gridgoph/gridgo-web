"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { ServiceLines } from "@/components/approvals/ServiceLines";
import { SuperAdminOnly } from "@/components/shell/SuperAdminOnly";

function OpsApprovalsBody() {
  const search = useSearchParams();
  if (search.get("tab") === "services") return <ServiceLines />;
  return (
    <SuperAdminOnly
      body="Sign-up applications are reviewed by Super Admin."
      adminHref="/admin/verification"
      adminLabel="Open sign-up approvals as Super Admin"
    />
  );
}

export default function OpsApprovalsPage() {
  return (
    <Suspense>
      <OpsApprovalsBody />
    </Suspense>
  );
}
