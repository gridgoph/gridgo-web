"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Store } from "lucide-react";

import { DataTable, DataTableRowAction, type DataTableColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/StatusChip";
import type { SetupRequest } from "@/lib/product-templates";

import { shopHref, type ShopRef, type Tree } from "./team-data";

type Row = ShopRef & { waiting: number };

/**
 * Pick a shop to prepare template products for, or to match its existing
 * products to templates. Shops with a setup request waiting come first.
 */
export function ShopsTab({
  tree,
  shops,
  requests,
}: {
  tree: Tree;
  shops: ShopRef[] | null;
  requests: SetupRequest[] | null;
}) {
  const rows = useMemo<Row[]>(() => {
    const waiting = new Map<string, number>();
    for (const r of requests ?? [])
      if (r.status === "pending" && r.kind === "setup" && r.supplierId)
        waiting.set(r.supplierId, (waiting.get(r.supplierId) ?? 0) + 1);
    return (shops ?? [])
      .map((s) => ({ ...s, waiting: waiting.get(s.supplierId) ?? 0 }))
      .sort((a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name));
  }, [shops, requests]);

  const columns: DataTableColumn<Row>[] = [
    {
      id: "shop",
      header: "Shop",
      primary: true,
      alwaysVisible: true,
      sortValue: (r) => r.name,
      cell: (r) => (
        <Link
          href={shopHref(tree, r.supplierId)}
          className="text-body text-text-primary underline-offset-4 hover:underline"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {r.name}
        </Link>
      ),
    },
    {
      id: "waiting",
      header: "Setup requests",
      sortValue: (r) => r.waiting,
      cell: (r) =>
        r.waiting ? (
          <StatusChip tone="info" icon="clock" label={`${r.waiting} waiting`} />
        ) : (
          <span className="text-body text-text-muted">None</span>
        ),
    },
  ];

  return (
    <DataTable
      caption="Shops"
      columns={columns}
      data={rows}
      loading={!shops}
      getRowId={(r) => r.supplierId}
      itemLabel="shops"
      filterPlaceholder="Find a shop"
      rowActions={(r) => <DataTableRowAction label="Open shop products" icon={Store} href={shopHref(tree, r.supplierId)} />}
      pageSize={25}
    />
  );
}
