"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, DataTableRowAction, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { getStaffCatalogItem, getTaxonomy, listStaffCatalogItems, listSupplierServices } from "@/lib/api/client";
import { isTemplatesAbsent, listStaffProductTemplates } from "@/lib/api/product-templates";
import type { Taxonomy } from "@/lib/api/types";
import type { Listing } from "@/lib/listings";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  fromPriceOfRows,
  normalizeCatalogue,
  priceRowsFromItem,
  templateFactsOf,
  templateStanding,
  type PriceRow,
  type ProductTemplate,
  type ReadyTimeChip,
  type TemplateFacts,
} from "@/lib/product-templates";
import { normalizeStaffCatalogDetail, normalizeStaffCatalogPage } from "@/lib/supplier-products";

import { MigrationSection } from "./MigrationSection";
import { PrepareSheet, type PrepareTarget, type ServiceRef } from "./PrepareSheet";
import { deskHref, readShops, type Tree } from "./team-data";

/** Products read one by one for their template facts; the staff list does not carry them. */
const DETAIL_LIMIT = 60;

type Product = {
  listing: Listing;
  facts: TemplateFacts | null;
  prices: PriceRow[];
};

type Loaded = {
  shopName: string;
  products: Product[];
  truncated: boolean;
  templates: ProductTemplate[];
  readyTimes: ReadyTimeChip[];
  services: ServiceRef[];
  taxonomy: Taxonomy | null;
};

/** Retired category codes point at their current one, unless the chart says the alias is ambiguous. */
export function categoryResolver(taxonomy: Pick<Taxonomy, "categoryAliases"> | null): (code: string) => string {
  const map = new Map<string, string>();
  for (const alias of taxonomy?.categoryAliases ?? []) if (!alias.ambiguous) map.set(alias.code, alias.categoryCode);
  return (code) => map.get(code) ?? code;
}

/**
 * One shop's products for the GRIDGO team: prepare template products from
 * its price list, revise prepared ones, and match existing products to
 * templates. Mounted at `…/product-setup/shops/:supplierId` in both trees.
 */
export function ShopTemplateProducts({ tree, supplierId }: { tree: Tree; supplierId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [absent, setAbsent] = useState(false);
  const [target, setTarget] = useState<PrepareTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setFailure(null);
      try {
        const [page, catalogue, services, taxonomy, shops] = await Promise.all([
          listStaffCatalogItems({ supplierId, limit: 100 }),
          listStaffProductTemplates(),
          listSupplierServices({ supplierId }),
          getTaxonomy().catch(() => null),
          readShops(),
        ]);
        const staff = normalizeStaffCatalogPage(page);
        const rows = staff.rows.filter((r) => r.shop.supplierId === supplierId);
        const details = await Promise.all(
          rows.slice(0, DETAIL_LIMIT).map(async (row): Promise<Product> => {
            try {
              const raw = await getStaffCatalogItem(row.listing.id);
              const detail = normalizeStaffCatalogDetail(raw);
              return { listing: detail?.listing ?? row.listing, facts: templateFactsOf(raw), prices: priceRowsFromItem(raw) };
            } catch {
              return { listing: row.listing, facts: null, prices: [] };
            }
          }),
        );
        const parsed = normalizeCatalogue(catalogue);
        setLoaded({
          shopName:
            staff.shops.find((s) => s.supplierId === supplierId)?.shopName ??
            shops.find((s) => s.supplierId === supplierId)?.name ??
            "This shop",
          products: [...details, ...rows.slice(DETAIL_LIMIT).map((r) => ({ listing: r.listing, facts: null, prices: [] }))],
          truncated: rows.length > DETAIL_LIMIT || staff.nextCursor != null,
          templates: parsed.templates,
          readyTimes: parsed.readyTimes,
          services: services.map((s) => ({ id: s.id, categoryCode: s.categoryCode, state: s.state })),
          taxonomy,
        });
      } catch (err) {
        if (isTemplatesAbsent(err)) setAbsent(true);
        else setFailure(opsErrorMessage(err, "Could not load this shop's products. Try again."));
      }
    }, [supplierId]),
  );

  useLiveReload("catalog", load);
  useEffect(() => {
    void load();
  }, [load]);

  const resolve = useMemo(() => categoryResolver(loaded?.taxonomy ?? null), [loaded?.taxonomy]);
  const added = useMemo(
    () => new Set((loaded?.products ?? []).flatMap((p) => (p.facts?.templateId && !p.facts.mergedInto ? [p.facts.templateId] : []))),
    [loaded],
  );

  if (absent)
    return (
      <EmptyState title="Product templates are not on this server yet" body="This GRIDGO API has no product templates." />
    );
  if (failure)
    return <ErrorState title="This shop could not load" body={failure} action={<Button onClick={() => void load()}>Try again</Button>} />;

  const templateName = (id: string | null) => loaded?.templates.find((t) => t.id === id)?.name ?? null;

  const columns: DataTableColumn<Product>[] = [
    {
      id: "product",
      header: "Product",
      primary: true,
      alwaysVisible: true,
      sortValue: (p) => p.listing.name,
      cell: (p) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-body text-text-primary truncate" style={{ fontFamily: "var(--font-medium)" }}>
            {p.listing.name || "Untitled product"}
          </span>
          <span className="text-caption text-text-muted truncate">
            {p.facts?.templateId ? `Template: ${templateName(p.facts.templateId) ?? p.facts.templateId}` : "Not on a template"}
          </span>
        </span>
      ),
    },
    {
      id: "prices",
      header: "Prices",
      hideOnMobile: true,
      sortValue: (p) => p.prices.length,
      cell: (p) => (
        <span className="text-body text-text-secondary tabular-nums">
          {p.facts?.managed && p.prices.length
            ? `${p.prices.length} option${p.prices.length === 1 ? "" : "s"}, ${fromPriceOfRows(p.prices, p.facts.unit) ?? ""}`
            : "—"}
        </span>
      ),
    },
    {
      id: "standing",
      header: "Standing",
      sortValue: (p) => standingOf(p).label,
      cell: (p) => {
        const s = standingOf(p);
        return <StatusChip tone={s.tone} icon={s.icon} label={s.label} />;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h3 text-text-primary m-0">{loaded?.shopName ?? "Shop products"}</h2>
          <p className="text-body text-text-secondary m-0 mt-1 max-w-2xl">
            Products you prepare stay hidden until the shop confirms the prices. Then the GRIDGO team checks them.
          </p>
        </div>
        <Link href={deskHref(tree, "shops")} className="text-body text-text-secondary underline underline-offset-4">
          All shops
        </Link>
      </div>
      {notice ? (
        <p role="status" className="text-body text-text-primary m-0">
          {notice}
        </p>
      ) : null}

      <DataTable
        caption="This shop's products"
        columns={columns}
        data={loaded?.products ?? []}
        loading={!loaded}
        getRowId={(p) => p.listing.id}
        itemLabel="products"
        filterPlaceholder="Search products"
        toolbar={
          <Button variant="primary" disabled={!loaded} onClick={() => setTarget({ kind: "new" })}>
            <Plus data-icon="inline-start" aria-hidden />
            Prepare a product
          </Button>
        }
        empty={
          <EmptyState title="No products yet" body="Prepare the first one from the shop's price list." />
        }
        rowActions={(p) =>
          p.facts?.managed && p.facts.templateId && !p.facts.mergedInto ? (
            <DataTableRowAction
              label="Revise prices"
              icon={Pencil}
              onClick={() => setTarget({ kind: "revise", listing: p.listing, facts: p.facts!, prices: p.prices })}
            />
          ) : null
        }
        pageSize={25}
      />
      {loaded?.truncated ? (
        <p className="text-caption text-text-muted m-0">
          Showing template details for the first {DETAIL_LIMIT} products only.
        </p>
      ) : null}

      {loaded ? (
        <MigrationSection
          supplierId={supplierId}
          shopName={loaded.shopName}
          products={loaded.products.map((p) => ({ id: p.listing.id, name: p.listing.name }))}
          templates={loaded.templates}
          onApplied={(message) => {
            setNotice(message);
            void load();
          }}
        />
      ) : null}

      {loaded && target ? (
        <PrepareSheet
          open
          onOpenChange={(open) => (open ? null : setTarget(null))}
          target={target}
          supplierId={supplierId}
          shopName={loaded.shopName}
          templates={loaded.templates}
          addedTemplateIds={added}
          services={loaded.services}
          resolveCategory={resolve}
          readyTimes={loaded.readyTimes}
          onDone={(message) => {
            setNotice(message);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function standingOf(p: Product) {
  return templateStanding({
    onTheBoard: p.listing.onTheBoard,
    suspendReason: p.listing.suspendReason ?? null,
    suspendedAt: p.listing.suspendedAt ?? null,
    reviewStatus: p.listing.reviewStatus ?? null,
    reviewReason: p.listing.reviewReason ?? null,
    template: p.facts,
  });
}
