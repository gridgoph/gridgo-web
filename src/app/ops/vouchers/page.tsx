"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { VoucherLookup } from "@/components/vouchers/VoucherLookup";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

/**
 * Operations reads a client's vouchers to answer them. Creating campaigns,
 * issuing, voiding and the activity log are Super Admin's.
 */
function OpsVouchersBody() {
  const router = useRouter();
  const search = useSearchParams();
  const clientId = search.get("client") ?? "";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Look up what a client holds, used or let expire. Vouchers are GRIDGO-funded: they come off
        GRIDGO&rsquo;s fee and delivery, never the shop&rsquo;s price. Super Admin creates, issues
        and voids them.
      </p>
      <VoucherLookup
        tree="ops"
        clientId={clientId}
        onClientChange={(client) =>
          router.replace(client ? `/ops/vouchers?client=${encodeURIComponent(client)}` : "/ops/vouchers", {
            scroll: false,
          })
        }
      />
    </div>
  );
}

export default function OpsVouchersPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading vouchers…" />}>
      <OpsVouchersBody />
    </Suspense>
  );
}
