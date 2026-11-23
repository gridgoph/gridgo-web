"use client";

import Link from "next/link";
import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, DataTableRowAction, type DataTableColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatPhp } from "@/lib/format";
import { groupLabel, groupsOf, unitLabel, type ProductTemplate } from "@/lib/product-templates";

import { templateHref, type Tree } from "./team-data";

/**
 * GRIDGO's product templates, retired ones included. Editing one changes
 * what shops see when they add it; products already added keep their facts.
 */
export function TemplatesTab({
  tree,
  templates,
  waitingByCategory,
}: {
  tree: Tree;
  templates: ProductTemplate[] | null;
  /** Pending product-type requests per category, so the team sees which templates answer them. */
  waitingByCategory: Map<string, number>;
}) {
  const columns: DataTableColumn<ProductTemplate>[] = [
    {
      id: "name",
      header: "Template",
      primary: true,
      alwaysVisible: true,
      sortValue: (t) => t.name,
      filterValue: (t) => `${t.name} ${t.options.map((o) => o.label).join(" ")}`,
      cell: (t) => (
        <div className="flex min-w-0 items-center gap-3">
          {t.photoUrl ? (
            // Public stock photo path; next/image would proxy it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.photoUrl} alt="" className="size-12 shrink-0 rounded-md border border-outline object-cover" />
          ) : (
            <span aria-hidden className="bg-muted size-12 shrink-0 rounded-md border border-outline" />
          )}
          <Link
            href={templateHref(tree, t.id)}
            className="text-body text-text-primary min-w-0 truncate underline-offset-4 hover:underline"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {t.name}
          </Link>
        </div>
      ),
    },
    {
      id: "group",
      header: "Group",
      sortValue: (t) => t.group,
      cell: (t) => <span className="text-body text-text-secondary">{groupLabel(t.group)}</span>,
    },
    {
      id: "options",
      header: "Options",
      sortValue: (t) => t.options.length,
      hideOnMobile: true,
      cell: (t) => (
        <span className="text-body text-text-secondary tabular-nums">
          {t.options.length} {unitLabel(t.unit)}
        </span>
      ),
    },
    {
      id: "range",
      header: "Usual price",
      hideOnMobile: true,
      sortValue: (t) => t.priceRange?.minMinor ?? 0,
      cell: (t) => (
        <span className="text-body text-text-secondary tabular-nums">
          {t.priceRange ? `${formatPhp(t.priceRange.minMinor)} to ${formatPhp(t.priceRange.maxMinor)}` : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (t) => (t.active ? "active" : "retired"),
      cell: (t) => (
        <span className="flex flex-wrap gap-1.5">
          {t.active ? (
            <StatusChip tone="success" icon="circle-check" label="Offered" />
          ) : (
            <StatusChip tone="neutral" icon="circle-dashed" label="Retired" />
          )}
          {waitingByCategory.get(t.categoryCode) ? (
            <StatusChip tone="info" icon="clock" label={`${waitingByCategory.get(t.categoryCode)} requests in its category`} />
          ) : null}
        </span>
      ),
    },
  ];

  const groups = groupsOf(templates ?? []);

  return (
    <DataTable
      caption="Product templates"
      columns={columns}
      data={templates ?? []}
      loading={!templates}
      getRowId={(t) => t.id}
      itemLabel="templates"
      filterPlaceholder="Search templates or options"
      toolbar={
        <Button variant="primary" nativeButton={false} render={<Link href={templateHref(tree, "new")} />}>
          <Plus data-icon="inline-start" aria-hidden />
          New template
        </Button>
      }
      facets={[
        { columnId: "group", title: "Group", options: groups.map((g) => ({ value: g, label: groupLabel(g) })) },
        {
          columnId: "status",
          title: "Status",
          options: [
            { value: "active", label: "Offered" },
            { value: "retired", label: "Retired" },
          ],
        },
      ]}
      rowActions={(t) => <DataTableRowAction label="Edit template" icon={Pencil} href={templateHref(tree, t.id)} />}
      pageSize={25}
    />
  );
}
