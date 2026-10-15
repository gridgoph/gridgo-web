import { SuperAdminOnly } from "@/components/shell/SuperAdminOnly";
import { ArtworkGuidanceView } from "@/components/settings/ArtworkGuidanceView";
import { ServiceFeeView } from "@/components/settings/ServiceFeeView";

export default function OpsSettingsPage() {
  return (
    <div className="flex w-full flex-col gap-3">
      <SuperAdminOnly
        body="Operational settings, including delivery zones and fees, are changed by Super Admin. The service fee brackets and artwork guidance in force are shown below."
        adminHref="/admin/settings"
        adminLabel="Open settings as Super Admin"
      />
      <ServiceFeeView />
      <ArtworkGuidanceView />
    </div>
  );
}
