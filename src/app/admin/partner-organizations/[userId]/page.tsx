"use client";

import { useParams } from "next/navigation";

import { PartnerChanges } from "@/app/admin/partner-organizations/_components/PartnerChanges";
import { PartnerDetail } from "@/components/organization-partners/PartnerDetail";

export default function AdminPartnerOrganizationPage() {
  const { userId } = useParams<{ userId: string }>();
  return (
    <PartnerDetail
      tree="admin"
      userId={userId}
      history={<PartnerChanges userId={userId} />}
    />
  );
}
