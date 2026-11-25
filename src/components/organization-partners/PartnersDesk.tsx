"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Eye, Plus } from "lucide-react";

import { BudgetMeter } from "@/components/organization-partners/BudgetMeter";
import { PartnerPicker } from "@/components/organization-partners/PartnerPicker";
import { PerkPreview } from "@/components/organization-partners/PerkPreview";
import {
  PartnerLoadError,
  StaleFigures,
} from "@/components/organization-partners/states";
import { usePartnerData } from "@/components/organization-partners/usePartnerData";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  getStandardPerk,
  listOrganizationPartners,
  type MemberPerk,
  type OrganizationPartner,
} from "@/lib/api/organization-partners";
import { formatPhp } from "@/lib/format";
import {
  PERK_CHIP,
  budgetNeedsAttention,
  partnerBudget,
  partnerChip,
  partnerErrorText,
  perkReaches,
  perkSetting,
  perkState,
  sortPartners,
} from "@/lib/organization-partners";

const medium = { fontFamily: "var(--font-medium)" } as const;

/**
 * Partner organizations and the standard member perk (issue report F67EAE25;
 * contract gridgo-api docs/ORGANIZATION_MEMBERS_API.md). Super Admin adds
 * partners and sets the perk; Operations reads the same page. Only totals:
 * member names stay with each organization's officer.
 */
export function PartnersDesk({
  tree,
  history,
}: {
  tree: "ops" | "admin";
  history?: ReactNode;
}) {
  const canEdit = tree === "admin";
  const [picking, setPicking] = useState(false);
  const read = useCallback(async () => {
    const [partners, standard] = await Promise.all([
      listOrganizationPartners(),
      getStandardPerk(),
    ]);
    return { partners, standard };
  }, []);
  const { data, loadError, refreshError, retry } = usePartnerData(read);

  const standard = data?.standard ?? null;
  const rows = useMemo(
    () => sortPartners(data?.partners ?? [], standard),
    [data?.partners, standard],
  );
  const partnerIds = useMemo(() => new Set(rows.map((row) => row.userId)), [rows]);

  const columns = useMemo<DataTableColumn<OrganizationPartner>[]>(
    () => [
      {
        id: "partner",
        header: "Organization",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => row.label,
        filterValue: (row) => `${row.label} ${row.organizationName ?? ""}`,
        cell: (row) => (
          <div className="min-w-0">
            <p className="text-body text-text-primary m-0 break-words" style={medium}>
              {row.label}
            </p>
            {row.organizationName && row.organizationName !== row.label ? (
              <p className="text-caption text-text-muted m-0 mt-0.5 break-words">
                {row.organizationName}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "standing",
        header: "Standing",
        sortValue: (row) => partnerChip(row).label,
        cell: (row) => <StatusChip {...partnerChip(row)} />,
      },
      {
        id: "perk",
        header: "Perk",
        sortValue: (row) => (perkReaches(row) ? (row.perk?.amountMinor ?? 0) : 0),
        cell: (row) => <PerkCell partner={row} standard={standard} />,
      },
      {
        id: "members",
        header: "Members",
        sortValue: (row) => row.results.memberCount,
        cell: (row) => (
          <span className="text-body text-text-primary tabular-nums">
            {row.results.memberCount.toLocaleString("en-PH")}
          </span>
        ),
      },
      {
        id: "orders",
        header: "Orders this term",
        sortValue: (row) => row.results.memberOrders,
        cell: (row) => (
          <span className="text-body text-text-primary tabular-nums">
            {row.results.memberOrders.toLocaleString("en-PH")}
          </span>
        ),
      },
      {
        id: "budget",
        header: "Budget used",
        sortValue: (row) => row.budgetUsedMinor,
        cell: (row) => (
          <BudgetMeter
            compact
            budget={partnerBudget(row, standard)}
            warn={budgetNeedsAttention(row, standard)}
          />
        ),
      },
    ],
    [standard],
  );

  if (!data) {
    return loadError ? (
      <PartnerLoadError error={loadError} onRetry={retry} />
    ) : (
      <SkeletonDetail label="Loading partner organizations" panels={2} />
    );
  }

  const attention = rows.filter((row) => budgetNeedsAttention(row, standard));
  const state = perkState(standard);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Student organizations and clubs GRIDGO partners with. Their members can get a
          perk at checkout, paid from GRIDGO&apos;s service fee. Member names stay with
          each organization&apos;s officer.
        </p>
        {canEdit && rows.length ? (
          <Button variant="primary" onClick={() => setPicking(true)}>
            <Plus className="size-4" aria-hidden />
            Add partner
          </Button>
        ) : null}
      </div>

      {refreshError ? (
        <StaleFigures message={partnerErrorText(refreshError, "load")} onRetry={retry} />
      ) : null}

      {attention.length ? (
        <p
          role="status"
          className="text-body text-text-primary rounded-card border-warning m-0 border p-3"
        >
          {attention.length === 1
            ? `${attention[0]!.label} ${
                partnerBudget(attention[0]!, standard).level === "spent"
                  ? "has used up its budget."
                  : "is near its budget cap."
              } Open it to see what is left.`
            : `${attention.length} partners are near their budget cap or have used it up. They are first in the list.`}
        </p>
      ) : null}

      <section
        aria-labelledby="standard-perk-heading"
        className="gg-card flex flex-col gap-3 p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="standard-perk-heading" className="text-h3 text-text-primary m-0">
            Standard member perk
          </h2>
          <StatusChip {...PERK_CHIP[state]} />
        </div>
        {standard ? (
          <>
            <PerkPreview perk={standard} label={null} />
            <p className="text-body text-text-secondary m-0">
              Budget cap {formatPhp(standard.budgetCapMinor)} for each organization.
            </p>
          </>
        ) : (
          <p className="text-body text-text-secondary m-0 max-w-prose">
            No perk has been set, so no member gets money off.{" "}
            {canEdit
              ? "You choose the amount, the limits and when it starts."
              : "A Super Admin sets it."}
          </p>
        )}
        {canEdit ? (
          <div>
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href="/admin/partner-organizations/standard-perk" />}
            >
              {standard ? "Change the standard perk" : "Set the standard perk"}
            </Button>
          </div>
        ) : null}
      </section>

      {rows.length ? (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.userId}
          caption="Partner organizations"
          filterPlaceholder="Find an organization…"
          itemLabel="partners"
          rowActionsDensity="labeled"
          rowActions={(row) => (
            <DataTableRowAction
              label={`Open ${row.label}`}
              icon={Eye}
              href={`/${tree}/partner-organizations/${encodeURIComponent(row.userId)}`}
            />
          )}
        />
      ) : (
        <EmptyState
          title="No partner organizations yet"
          body={
            canEdit
              ? "Add a verified organization and its officer can start inviting members. The perk stays off until you turn it on."
              : "A Super Admin adds verified organizations here. You will see their members, orders and budget."
          }
          action={
            canEdit ? (
              <Button variant="primary" onClick={() => setPicking(true)}>
                <Plus className="size-4" aria-hidden />
                Add partner
              </Button>
            ) : undefined
          }
        />
      )}

      {history}

      {canEdit ? (
        <PartnerPicker
          open={picking}
          partnerIds={partnerIds}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}

function PerkCell({
  partner,
  standard,
}: {
  partner: OrganizationPartner;
  standard: MemberPerk | null;
}) {
  if (!perkReaches(partner)) {
    return <span className="text-body text-text-muted">None for now</span>;
  }
  const { source, setting } = perkSetting(partner, standard);
  return (
    <div className="min-w-0">
      <span className="text-body text-text-primary">
        {partner.perk
          ? `Up to ${formatPhp(partner.perk.amountMinor)}`
          : PERK_CHIP[perkState(setting)].label}
      </span>
      {source === "none" ? null : (
        <span className="text-caption text-text-muted block">
          {source === "own" ? "Its own perk" : "Standard perk"}
        </span>
      )}
    </div>
  );
}
