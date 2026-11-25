"use client";

import { PartnerChanges } from "@/app/admin/partner-organizations/_components/PartnerChanges";
import { PartnersDesk } from "@/components/organization-partners/PartnersDesk";

export default function AdminPartnerOrganizationsPage() {
  return <PartnersDesk tree="admin" history={<PartnerChanges userId={null} />} />;
}
