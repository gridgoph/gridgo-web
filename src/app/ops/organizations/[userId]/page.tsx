"use client";

import { useParams } from "next/navigation";

import { OrganizationDetail } from "@/components/organizations/OrganizationDetail";

export default function OpsOrganizationPage() {
  const params = useParams<{ userId: string }>();
  return <OrganizationDetail tree="ops" userId={params.userId} />;
}
