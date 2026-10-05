import { SuperAdminOnly } from "@/components/shell/SuperAdminOnly";

export default function OpsAuditPage() {
  return (
    <SuperAdminOnly
      body="The audit log is read by Super Admin. Order and file records you need still show on the order itself."
      adminHref="/admin/audit"
      adminLabel="Open the audit log as Super Admin"
    />
  );
}
