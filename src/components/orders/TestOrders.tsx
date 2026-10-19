"use client";

import { useCallback, useId, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { StatusChip } from "@/components/ui/StatusChip";
import { useTestOperations } from "@/lib/auth/test-operations";
import { isTestOrder, readShowTestOrders, writeShowTestOrders } from "@/lib/review-data";

/**
 * "Test" on a test account's order wherever orders or jobs are listed. Neutral:
 * it says what kind of order this is, not that anything is wrong.
 */
export function TestOrderChip({ order }: { order: { reviewData?: boolean | null } }) {
  if (!isTestOrder(order)) return null;
  return <StatusChip tone="neutral" icon="flask-conical" label="Test" />;
}

/**
 * Whether this list asks for test orders too. A test operations login always
 * does (it sees nothing else); ordinary staff choose per browser, off by
 * default.
 */
export function useShowTestOrders(): {
  include: boolean;
  /** False for a test operations login: there is nothing to switch. */
  switchable: boolean;
  setShow: (on: boolean) => void;
  show: boolean;
} {
  const testOperations = useTestOperations();
  const [show, setShowState] = useState(readShowTestOrders);
  const setShow = useCallback((on: boolean) => {
    setShowState(on);
    writeShowTestOrders(on);
  }, []);
  return { include: testOperations || show, switchable: !testOperations, setShow, show };
}

export function ShowTestOrdersSwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center gap-2 text-body text-text-secondary"
    >
      <Switch id={id} checked={checked} onCheckedChange={(on) => onCheckedChange(on)} />
      Show test orders
    </label>
  );
}
