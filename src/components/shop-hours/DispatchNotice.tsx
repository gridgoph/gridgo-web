import { TriangleAlert } from "lucide-react";

import { DISPATCH_WAITS_COPY } from "@/lib/shop-hours";

/** The after-hours warning. A warning, not a refusal: the shop may still work late. */
export function DispatchNotice() {
  return (
    <p
      className="rounded-field border border-warning text-body text-text-primary m-0 flex gap-2 p-3"
      data-testid="dispatch-notice"
    >
      <TriangleAlert
        size={18}
        aria-hidden
        className="mt-0.5 shrink-0"
        style={{ color: "var(--color-warning)" }}
      />
      <span>{DISPATCH_WAITS_COPY}</span>
    </p>
  );
}
