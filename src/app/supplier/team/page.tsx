"use client";

import { TeamManager } from "@/components/shop-team/TeamManager";

/**
 * Owners and Managers manage the team here; Staff see the positive team view
 * (gridgoph/gridgo-web#328). The API decides what each one receives.
 */
export default function SupplierTeamPage() {
  return <TeamManager />;
}
