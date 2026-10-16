import { SuperAdminOnly } from "@/components/shell/SuperAdminOnly";

export default function OpsAuditPage() {
  return (
    <SuperAdminOnly
      body="The audit log is read by Super Admin. The corrections and file deletions you need still show on each order, in its Audit row."
      adminHref="/admin/audit"
      adminLabel="Open the audit log as Super Admin"
    />
  );
}
