"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { ProductThumb } from "@/components/product-templates/supplier/FlowParts";
import {
  useCheckProducts,
  useTemplateSummary,
} from "@/components/product-templates/supplier/useCheckProducts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonLines } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { templateStanding } from "@/lib/product-templates";

/**
 * Check your products (gridgo-supplier#268): every product waiting on the
 * shop, each one click from its price table. Products that need a price come
 * first: clients cannot see those at all.
 */
export default function CheckProductsPage() {
  const { summary } = useTemplateSummary();
  const { check, reload } = useCheckProducts(summary);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-h2 text-text-primary m-0">Check your products</h1>
        <p className="text-body text-text-secondary m-0">
          These are hidden from clients until you add or confirm their prices. A new price
          is for new orders only.
        </p>
      </div>

      {!check ? <SkeletonLines lines={3} /> : null}
      {check && !check.items.length ? (
        <EmptyState
          title="Nothing to check"
          body="Every product has its prices. Add another from Products whenever you like."
          action={<Button onClick={() => void reload()}>Check again</Button>}
        />
      ) : null}

      {check?.items.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {check.items.map(({ listing, facts, photoSrc }) => {
            const standing = templateStanding({ ...listing, template: facts });
            return (
              <li key={listing.id}>
                <Link
                  href={`/supplier/catalogue/product/${encodeURIComponent(listing.id)}`}
                  className="rounded-card border border-outline bg-surface hover:bg-overlay-hover flex min-h-16 items-center gap-3 p-3 no-underline"
                >
                  <ProductThumb src={photoSrc} alt={listing.name} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      className="text-body text-text-primary"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {listing.name || "Product"}
                    </span>
                    <span className="flex">
                      <StatusChip
                        tone={standing.tone}
                        icon={standing.icon}
                        label={standing.label}
                      />
                    </span>
                    {standing.detail ? (
                      <span className="text-caption text-text-secondary">
                        {standing.detail}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight className="text-text-muted size-5 shrink-0" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {check && check.suggested > 0 ? (
        <p className="text-caption text-text-muted m-0">
          The GRIDGO team may also move your older products onto GRIDGO&apos;s price
          tables and join duplicates. They tell you first, and nothing with an open order
          is touched.
        </p>
      ) : null}
    </div>
  );
}
