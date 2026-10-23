import { PhoneAppSetup } from "@/components/pwa/PhoneApp";

import { ShopHelp } from "./ShopHelp";

export default function SupplierPhoneAppPage() {
  return (
    <div className="flex flex-col gap-6">
      <PhoneAppSetup />
      <ShopHelp />
    </div>
  );
}
