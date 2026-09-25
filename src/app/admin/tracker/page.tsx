"use client";

import { TrackerDesk } from "@/app/admin/tracker/_components/TrackerDesk";

/** Super Admin only: the admin layout's RoleGate mounts this for super_admin alone. */
export default function AdminTrackerPage() {
  return <TrackerDesk />;
}
