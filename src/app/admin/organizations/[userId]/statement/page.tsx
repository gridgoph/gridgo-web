"use client";

import { useParams } from "next/navigation";

import { OrganizationStatement } from "@/components/organizations/OrganizationStatement";

export default function AdminOrganizationStatementPage() {
  const { userId } = useParams<{ userId: string }>();
  return <OrganizationStatement clientId={decodeURIComponent(userId)} tree="admin" />;
}
