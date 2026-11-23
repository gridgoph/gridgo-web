"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { checkProductsLine } from "@/lib/product-templates";

import type { CheckProducts } from "./useCheckProducts";

/**
 * "Check your products" (gridgo-supplier#268), on My shop and Products.
 *
 * Drawn only when a product is waiting on the shop: a price to add before it
 * can be shown, or prices the GRIDGO team filled in that need the shop's OK.
 * A warning edge and a plain count keep it calm: nothing is broken, something
 * is waiting for a minute of the shop's time.
 */
export function CheckProductsCard({ check }: { check: CheckProducts | null }) {
  if (!check || !check.items.length) return null;
  const line = checkProductsLine({
    needPrice: check.items.filter((i) => i.facts.needsPrice).length,
    toConfirm: check.items.filter((i) => !i.facts.needsPrice && !i.facts.shopConfirmed)
      .length,
  });
  return (
    <Link
      href="/supplier/catalogue/check"
      data-testid="check-products-card"
      className="rounded-card border-warning bg-surface hover:bg-overlay-hover flex min-h-16 items-center gap-3 border-2 px-4 py-3 no-underline"
    >
      <span
        aria-hidden
        className="border-warning text-text-primary flex size-10 shrink-0 items-center justify-center rounded-pill border-2"
        style={{ fontFamily: "var(--font-bold)" }}
      >
        {check.items.length}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className="text-body text-text-primary"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          Check your products
        </span>
        <span className="text-caption text-text-secondary">{line}</span>
      </span>
      <ChevronRight className="text-text-muted size-5 shrink-0" aria-hidden />
    </Link>
  );
}
