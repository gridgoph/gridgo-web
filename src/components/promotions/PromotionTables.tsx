"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import type { FoundingClaim, FriendPassInvite } from "@/lib/api/promotions";
import { formatPhp } from "@/lib/format";
import {
  byNewest,
  claimsCsv,
  personText,
  presentClaimStatus,
  presentInviteStatus,
} from "@/lib/promotions";
import { formatManila } from "@/lib/vouchers";

/** In-table links keep the 44px touch floor. */
const LINK =
  "text-body text-text-primary inline-flex min-h-11 items-center underline-offset-2 hover:underline";

const MUTED_DASH = <span className="text-body text-text-muted">—</span>;

function Person({ name, email }: { name: string | null; email: string | null }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-body text-text-primary truncate">{personText(name, email)}</span>
      {name && email ? <span className="text-caption text-text-muted truncate">{email}</span> : null}
    </div>
  );
}

/** Who claimed a Founding voucher, when, its value, and whether it was used. */
export function ClaimsTable({ claims, tree }: { claims: FoundingClaim[]; tree: "ops" | "admin" }) {
  const rows = useMemo(() => byNewest(claims, (claim) => claim.claimedAt), [claims]);

  const columns = useMemo<DataTableColumn<FoundingClaim>[]>(
    () => [
      {
        id: "client",
        header: "Client",
        primary: true,
        alwaysVisible: true,
        cell: (row) => <Person name={row.name} email={row.email} />,
        sortValue: (row) => personText(row.name, row.email),
        filterValue: (row) => `${row.name ?? ""} ${row.email ?? ""}`,
      },
      {
        id: "claimed",
        header: "Claimed",
        cell: (row) => (
          <span className="text-body text-text-primary">{formatManila(row.claimedAt)}</span>
        ),
        sortValue: (row) => Date.parse(row.claimedAt ?? "") || 0,
      },
      {
        id: "value",
        header: "Value",
        cell: (row) => (
          <div className="flex flex-col">
            <span className="text-body text-text-primary tabular-nums">{formatPhp(row.valueMinor)}</span>
            {row.viaFriendPass ? (
              <span className="text-caption text-text-muted">Upgraded Friend Pass</span>
            ) : null}
          </div>
        ),
        sortValue: (row) => row.valueMinor,
      },
      {
        id: "status",
        header: "Used",
        cell: (row) => <StatusChip {...presentClaimStatus(row.status)} />,
        sortValue: (row) => presentClaimStatus(row.status).label,
      },
      {
        id: "orders",
        header: "Order",
        sortable: false,
        cell: (row) => {
          if (!row.orderIds.length) return MUTED_DASH;
          return (
            <div className="flex flex-col items-start">
              {row.orderIds.map((id, index) => (
                <Link key={id} href={`/${tree}/orders/${encodeURIComponent(id)}`} className={LINK}>
                  Open order{row.orderIds.length > 1 ? ` ${index + 1}` : ""}
                </Link>
              ))}
            </div>
          );
        },
      },
    ],
    [tree],
  );

  function exportCsv() {
    const blob = new Blob([claimsCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "founding-30-claims.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!claims.length) {
    return (
      <EmptyState
        title="No Founding vouchers claimed yet"
        body="Signed-in clients see the claim prompt while slots are open. Each claim shows here as it comes in."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.voucherId || row.clientId}
        caption="Founding 30 claims"
        itemLabel="claims"
        filterPlaceholder="Search by name or email"
        toolbar={
          <Button variant="outline" onClick={exportCsv}>
            <Download size={16} aria-hidden />
            Export CSV
          </Button>
        }
        pageSize={30}
      />
      <p className="text-caption text-text-muted m-0">
        Times are Philippine time. The CSV holds every claim, whatever the search.
      </p>
    </div>
  );
}

/** Founder to friend: who invited whom, and where each pass stands. */
export function InvitesTable({ invites }: { invites: FriendPassInvite[] }) {
  const rows = useMemo(() => byNewest(invites, (invite) => invite.invitedAt), [invites]);

  const columns = useMemo<DataTableColumn<FriendPassInvite>[]>(
    () => [
      {
        id: "founder",
        header: "Founder",
        primary: true,
        alwaysVisible: true,
        cell: (row) => <Person name={row.founder.name} email={row.founder.email} />,
        sortValue: (row) => personText(row.founder.name, row.founder.email),
        filterValue: (row) => `${row.founder.name ?? ""} ${row.founder.email ?? ""}`,
      },
      {
        id: "friend",
        header: "Invited friend",
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <span className="text-body text-text-primary truncate">{row.friendEmail}</span>
            <span className="text-caption text-text-muted">
              {row.friendClientId ? "Has a GRIDGO account" : "No account yet"}
            </span>
          </div>
        ),
        sortValue: (row) => row.friendEmail,
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => <StatusChip {...presentInviteStatus(row.status)} />,
        sortValue: (row) => presentInviteStatus(row.status).label,
      },
      {
        id: "value",
        header: "Value",
        cell: (row) =>
          row.valueMinor === null ? (
            MUTED_DASH
          ) : (
            <span className="text-body text-text-primary tabular-nums">{formatPhp(row.valueMinor)}</span>
          ),
        sortValue: (row) => row.valueMinor ?? -1,
      },
      {
        id: "invited",
        header: "Invited",
        cell: (row) => <span className="text-body text-text-primary">{formatManila(row.invitedAt)}</span>,
        sortValue: (row) => Date.parse(row.invitedAt ?? "") || 0,
      },
      {
        id: "upgraded",
        header: "Upgraded",
        cell: (row) =>
          row.upgradedAt ? (
            <span className="text-body text-text-primary">{formatManila(row.upgradedAt)}</span>
          ) : (
            MUTED_DASH
          ),
        sortValue: (row) => Date.parse(row.upgradedAt ?? "") || 0,
      },
    ],
    [],
  );

  if (!invites.length) {
    return (
      <EmptyState
        title="No Friend Pass invites yet"
        body="After claiming, a Founder can invite one friend by email from the app. Each invite shows here with who sent it."
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      caption="Friend Pass invites"
      itemLabel="invites"
      filterPlaceholder="Search by name or email"
      pageSize={20}
    />
  );
}
