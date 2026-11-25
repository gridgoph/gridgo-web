"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SkeletonLines } from "@/components/ui/loading";
import { listOrganizations } from "@/lib/api/client";
import type { OrganizationSummary } from "@/lib/api/types";
import { canBePartner, partnerErrorText } from "@/lib/organization-partners";

/** Every organization, page by page; a repeated cursor ends the walk. */
async function allOrganizations(): Promise<OrganizationSummary[]> {
  const rows: OrganizationSummary[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await listOrganizations(cursor);
    rows.push(...page.organizations);
    cursor = page.nextCursor ?? undefined;
    if (cursor && seen.has(cursor)) break;
    if (cursor) seen.add(cursor);
  } while (cursor);
  return rows;
}

/** Choose a verified organization that is not a partner yet. Choosing saves nothing. */
export function PartnerPicker({
  open,
  partnerIds,
  onClose,
}: {
  open: boolean;
  partnerIds: ReadonlySet<string>;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a partner organization</DialogTitle>
          <DialogDescription>
            Pick a verified organization. You set its details next; nothing is saved yet.
          </DialogDescription>
        </DialogHeader>
        {open ? <Choices partnerIds={partnerIds} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Choices({ partnerIds }: { partnerIds: ReadonlySet<string> }) {
  const router = useRouter();
  const [rows, setRows] = useState<OrganizationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    allOrganizations().then(
      (all) => active && setRows(all),
      (err) => active && setError(partnerErrorText(err, "load")),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const eligible = useMemo(
    () =>
      (rows ?? [])
        .filter((row) => canBePartner(row) && !partnerIds.has(row.userId))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [rows, partnerIds],
  );
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? eligible.filter((row) =>
        `${row.name ?? ""} ${row.school ?? ""}`.toLowerCase().includes(needle),
      )
    : eligible;

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (!rows) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading organizations</span>
        <SkeletonLines />
      </div>
    );
  }
  if (!eligible.length) {
    return (
      <p className="text-body text-text-secondary m-0">
        No verified organization is left to add. An organization appears here once its
        application is approved and it has an officer of record.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Input
        aria-label="Search organizations"
        placeholder="Search by name or school"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {shown.length ? (
        <ul
          className="m-0 flex list-none flex-col p-0"
          aria-label="Verified organizations"
        >
          {shown.map((row) => (
            <li
              key={row.userId}
              className="border-outline-subtle border-b last:border-b-0"
            >
              <button
                type="button"
                className="hover:bg-surface-variant flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-2 py-2 text-left"
                onClick={() =>
                  router.push(
                    `/admin/partner-organizations/${encodeURIComponent(row.userId)}`,
                  )
                }
              >
                <span className="min-w-0">
                  <span className="text-body text-text-primary block break-words">
                    {row.name || "Unnamed organization"}
                  </span>
                  {row.school ? (
                    <span className="text-caption text-text-muted block break-words">
                      {row.school}
                    </span>
                  ) : null}
                </span>
                <ChevronRight className="text-text-muted size-4 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-text-secondary m-0" role="status">
          No verified organization matches “{search.trim()}”.
        </p>
      )}
    </div>
  );
}
