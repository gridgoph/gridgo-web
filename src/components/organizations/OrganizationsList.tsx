"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import { isApiError, listOrganizations } from "@/lib/api/client";
import type { OrganizationSummary } from "@/lib/api/types";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { presentOrganizationStanding } from "@/lib/statements";

/**
 * Every organization account, for Operations and Super Admin: who it is, who
 * its officer of record is, and whether it is approved. Each row opens the
 * organization, or its spend statement — the same figures the organization
 * exports from the client app.
 *
 * One implementation for both trees; links stay inside the caller's tree.
 */
export function OrganizationsList({ tree }: { tree: "ops" | "admin" }) {
  const [rows, setRows] = useState<OrganizationSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const page = await listOrganizations();
        setRows(page.organizations);
        setCursor(page.nextCursor);
      } catch (err) {
        setRows(null);
        setError(
          isApiError(err)
            ? `Could not load organizations (${err.code}).`
            : "Could not reach the API. Check it is running, then retry.",
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!cursor) return;
    setMore(true);
    try {
      const page = await listOrganizations(cursor);
      setRows((current) => [...(current ?? []), ...page.organizations]);
      setCursor(page.nextCursor);
    } catch {
      setError("Could not load more organizations. Try again.");
    } finally {
      setMore(false);
    }
  }

  const columns = useMemo<DataTableColumn<OrganizationSummary>[]>(
    () => [
      {
        id: "organization",
        header: "Organization",
        primary: true,
        sortValue: (row) => row.name ?? "",
        filterValue: (row) => `${row.name ?? ""} ${row.school ?? ""}`,
        cell: (row) => (
          <div className="min-w-0">
            <p
              className="text-body text-text-primary m-0 truncate"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {row.name || "Unnamed organization"}
            </p>
            {row.school ? (
              <p className="text-caption text-text-muted m-0 mt-0.5 truncate">
                {row.school}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "officer",
        header: "Officer of record",
        sortValue: (row) => row.currentOfficer?.fullName ?? "",
        filterValue: (row) => row.currentOfficer?.fullName ?? "",
        cell: (row) => (
          <span className="text-body text-text-secondary">
            {row.currentOfficer?.fullName ?? "Not verified yet"}
          </span>
        ),
      },
      {
        id: "standing",
        header: "Standing",
        sortValue: (row) => presentOrganizationStanding(row.approvalCase?.status).label,
        cell: (row) => {
          const standing = presentOrganizationStanding(row.approvalCase?.status);
          return (
            <StatusChip
              tone={standing.tone}
              label={standing.label}
              icon={standing.icon}
            />
          );
        },
      },
    ],
    [],
  );

  if (loading && !rows) {
    return (
      <DataTable
        columns={columns}
        data={[]}
        loading
        getRowId={(row) => row.userId}
        caption="Organizations"
      />
    );
  }
  if (error && !rows) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Schools, clubs and other groups ordering as an organization. An approved
        organization gets its discount on every order and a spend statement for its
        budget; open the statement to read the same figures it exports.
      </p>
      {!rows?.length ? (
        <EmptyState
          title="No organizations yet"
          body="An organization appears here when a client applies as one from the app."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.userId}
          caption="Organizations"
          filterPlaceholder="Filter organizations…"
          itemLabel="organizations"
          rowActionsDensity="labeled"
          rowActions={(row) => (
            <>
              <DataTableRowAction
                label="Statement"
                icon={FileText}
                href={`/${tree}/organizations/${encodeURIComponent(row.userId)}/statement`}
              />
              <DataTableRowAction
                label="Open"
                icon={Eye}
                href={`/${tree}/organizations/${encodeURIComponent(row.userId)}`}
              />
            </>
          )}
        />
      )}
      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
      {cursor ? (
        <div>
          <Button variant="secondary" disabled={more} onClick={() => void loadMore()}>
            {more ? "Loading…" : "Load more organizations"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
