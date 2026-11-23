import { Suspense } from "react";

import { SetupWizard } from "@/components/supplier-signup/SetupWizard";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function SupplierSetupPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading your setup…" />}>
      <SetupWizard />
    </Suspense>
  );
}
