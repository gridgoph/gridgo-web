import { EmptyState } from "@/components/ui/EmptyState";

export default function OpsAuditPage() {
  return (
    <EmptyState
      title="Super Admin only"
      body="The audit log is read by Super Admin."
    />
  );
}
