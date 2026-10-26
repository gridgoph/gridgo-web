"use client";

import Link from "next/link";

import type { Order } from "@/lib/api/types";

/**
 * The shop's trading name, for the Operations and Super Admin workspace.
 *
 * The staff projection already carries `supplierContact.shopName`. When that
 * is blank, the workspace's existing user lookup is the name. A missing name
 * stays missing: the anonymous "Shop A" label is never used as a stand-in.
 */
export function shopTradingName(
  order: Pick<Order, "supplierId" | "supplierContact">,
  names: Record<string, string>,
): string | null {
  const projected = order.supplierContact?.shopName?.trim() ?? "";
  if (projected) return projected;
  const lookedUp = order.supplierId ? (names[order.supplierId] ?? "").trim() : "";
  return lookedUp || null;
}

/**
 * The real shop name, and a new-tab link to that shop's performance page in
 * the current tree. A group with no shop yet has no link. `anonymousLabel`
 * stays beside the name so two dates at one shop remain distinct.
 */
export function ShopHeading({
  order,
  names,
  tree,
  anonymousLabel,
}: {
  order: Pick<Order, "supplierId" | "supplierContact">;
  names: Record<string, string>;
  tree: "ops" | "admin";
  anonymousLabel?: string | null;
}) {
  const supplierId = order.supplierId;
  const name = shopTradingName(order, names);
  const text = supplierId ? (name ?? "Shop name unavailable") : "Shop not assigned yet";
  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {supplierId ? (
        <Link
          href={`/${tree}/shop-performance/${encodeURIComponent(supplierId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-primary underline decoration-outline underline-offset-2 hover:decoration-text-primary"
        >
          {text}
        </Link>
      ) : (
        <span>{text}</span>
      )}
      {anonymousLabel ? (
        <span className="text-caption text-text-secondary">{anonymousLabel}</span>
      ) : null}
    </span>
  );
}
