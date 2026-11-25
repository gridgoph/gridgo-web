"use client";

import { useParams } from "next/navigation";

import { PartnerDetail } from "@/components/organization-partners/PartnerDetail";

export default function OpsPartnerOrganizationPage() {
  const { userId } = useParams<{ userId: string }>();
  return <PartnerDetail tree="ops" userId={userId} />;
}
