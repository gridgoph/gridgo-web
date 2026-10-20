"use client";

import { useParams } from "next/navigation";

import { ClientAccount } from "@/components/founding-testers/ClientAccount";

export default function OpsClientAccountPage() {
  const params = useParams<{ clientId: string }>();
  return <ClientAccount userId={params.clientId} tree="ops" />;
}
