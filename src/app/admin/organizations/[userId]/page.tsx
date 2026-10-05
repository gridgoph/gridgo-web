"use client";

import { useParams } from "next/navigation";

import { OrganizationDetail } from "@/components/organizations/OrganizationDetail";

export default function AdminOrganizationPage() {
  const params = useParams<{ userId: string }>();
  return <OrganizationDetail tree="admin" userId={params.userId} />;
}
