"use client";

import { ReceiptScanSetting } from "@/components/settings/ReceiptScanSetting";
import { SupplierInvoicesDesk } from "@/components/supplier-invoices/SupplierInvoicesDesk";

export default function OpsSupplierInvoicesPage() {
  return (
    <div className="flex w-full flex-col gap-3">
      {/* The Finance switch Super Admin sets, read-only for Operations. */}
      <ReceiptScanSetting canEdit={false} />
      <SupplierInvoicesDesk tree="ops" />
    </div>
  );
}
