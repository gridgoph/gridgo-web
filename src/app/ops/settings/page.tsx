import { SuperAdminOnly } from "@/components/shell/SuperAdminOnly";

export default function OpsSettingsPage() {
  return (
    <SuperAdminOnly
      body="Operational settings, including delivery zones and fees, are changed by Super Admin."
      adminHref="/admin/settings"
      adminLabel="Open settings as Super Admin"
    />
  );
}
