"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getTemplateProduct,
  listMyProductTemplates,
} from "@/lib/api/product-templates";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { normalizeListing, type Listing } from "@/lib/listings";
import {
  normalizeCatalogue,
  stockPhotoSrc,
  templateFactsOf,
  type CheckYourProducts,
  type ProductTemplate,
  type TemplateFacts,
} from "@/lib/product-templates";

/**
 * GRIDGO's template list as the shop's own screens need it: whether templates
 * are offered at all, and which of the shop's products came from which
 * template (the board list carries no `template` field, so this is how a card
 * knows to open the price table and to show the stock photo).
 *
 * `null` while loading. Anything but a clear answer with templates in it is
 * "not offered": an API before the release keeps today's builder, quietly.
 */
export type TemplateSummary = {
  offered: boolean;
  templates: ProductTemplate[];
  /** Product id → the template it was made from. */
  byItem: Map<string, ProductTemplate>;
  check: CheckYourProducts | null;
};

const NOT_OFFERED: TemplateSummary = {
  offered: false,
  templates: [],
  byItem: new Map(),
  check: null,
};

export function summarize(body: unknown): TemplateSummary {
  const catalogue = normalizeCatalogue(body);
  if (!catalogue.templates.length) return NOT_OFFERED;
  const byItem = new Map<string, ProductTemplate>();
  for (const template of catalogue.templates) {
    for (const id of template.addedItemIds) byItem.set(id, template);
  }
  return { offered: true, templates: catalogue.templates, byItem, check: catalogue.check };
}

export function useTemplateSummary(): { summary: TemplateSummary | null; reload: () => Promise<void> } {
  const [summary, setSummary] = useState<TemplateSummary | null>(null);
  const reload = useCallback(async () => {
    try {
      setSummary(summarize(await listMyProductTemplates()));
    } catch {
      setSummary(NOT_OFFERED);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useLiveReload("catalog", reload);
  return { summary, reload };
}

/** One product waiting on the shop: a price to add, or GRIDGO's prices to confirm. */
export type ProductToCheck = {
  listing: Listing;
  facts: TemplateFacts;
  photoSrc: string | null;
};

export type CheckProducts = {
  items: ProductToCheck[];
  /** Tidy-ups the GRIDGO team has lined up (matches, duplicates). Theirs, not the shop's. */
  suggested: number;
};

/** At most this many products are read one by one. */
export const MAX_CHECK_READS = 30;

function owes(facts: TemplateFacts | null): facts is TemplateFacts {
  return facts != null && !facts.mergedInto && (facts.needsPrice || !facts.shopConfirmed);
}

/** Products needing a price first: clients cannot see those at all. */
export function orderToCheck(items: ProductToCheck[]): ProductToCheck[] {
  return [...items].sort((a, b) => Number(b.facts.needsPrice) - Number(a.facts.needsPrice));
}

/**
 * What "Check your products" is about (gridgo-supplier#268). Null until GRIDGO
 * answers, and empty for good on an API without templates, so the card is
 * drawn only when there is something real for the shop to do.
 */
export function useCheckProducts(summary: TemplateSummary | null): {
  check: CheckProducts | null;
  reload: () => Promise<void>;
} {
  const [check, setCheck] = useState<CheckProducts | null>(null);

  const reload = useCallback(async () => {
    if (!summary) return;
    if (!summary.offered) {
      setCheck({ items: [], suggested: 0 });
      return;
    }
    const ids = [
      ...new Set([...(summary.check?.unpricedItemIds ?? []), ...summary.byItem.keys()]),
    ].slice(0, MAX_CHECK_READS);
    const reads = await Promise.all(
      ids.map((id) => getTemplateProduct(id).catch(() => null)),
    );
    const items: ProductToCheck[] = [];
    for (const body of reads) {
      const facts = templateFactsOf(body);
      const listing = normalizeListing(body);
      if (!listing || !owes(facts)) continue;
      const raw = body && typeof body === "object" ? (body as { item?: unknown }).item : null;
      items.push({
        listing,
        facts,
        photoSrc: stockPhotoSrc(raw) ?? summary.byItem.get(listing.id)?.photoUrl ?? null,
      });
    }
    setCheck({ items: orderToCheck(items), suggested: summary.check?.suggestedCount ?? 0 });
  }, [summary]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { check, reload };
}
