"use client";

import { useParams } from "next/navigation";

import { PartnerPerkPage } from "@/components/organization-partners/PerkPages";

export default function AdminPartnerPerkPage() {
  const { userId } = useParams<{ userId: string }>();
  return <PartnerPerkPage userId={userId} />;
}
