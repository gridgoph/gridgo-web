"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";

import { PersonFinder } from "@/components/legal/PersonFinder";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  downloadLegalAcceptancesCsv,
  listLegalAcceptances,
  listLegalDocuments,
  listUsers,
} from "@/lib/api/client";
import type { LegalAcceptance, LegalDocument, User } from "@/lib/api/types";
import {
  acceptanceHow,
  acceptanceStanding,
  formatManila,
  legalErrorMessage,
  signupChoices,
  sortLegalDocuments,
} from "@/lib/legal";
import { roleLabel } from "@/lib/routes";

type Props = { tree: "admin" | "ops" };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * One person's legal acceptances (LEGAL_API.md "Acceptance history and CSV").
 * The log is append-only and kept per person, so the screen starts from a
 * person; `?user=` keeps the choice in the address for sharing.
 */
export function AcceptanceLog({ tree }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const userId = params.get("user");

  const [users, setUsers] = useState<User[] | null>(null);
  const [usersError, setUsersError] = useState(false);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [rows, setRows] = useState<LegalAcceptance[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    listUsers()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        if (!cancelled) setUsersError(true);
      });
    listLegalDocuments()
      .then((docs) => {
        if (!cancelled) setDocuments(sortLegalDocuments(docs));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setRows(null);
    try {
      const page = await listLegalAcceptances(id, 0);
      setRows(page.acceptances);
      setNextOffset(page.nextOffset);
      setNow(Date.now());
    } catch (err) {
      setError(legalErrorMessage(err, "The acceptance log did not load. Try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) void load(userId);
    else setRows(null);
  }, [userId, load]);

  async function loadMore() {
    if (!userId || nextOffset === null) return;
    setLoading(true);
    try {
      const page = await listLegalAcceptances(userId, nextOffset);
      setRows((current) => [...(current ?? []), ...page.acceptances]);
      setNextOffset(page.nextOffset);
    } catch (err) {
      setError(legalErrorMessage(err, "More rows did not load. Try again."));
    } finally {
      setLoading(false);
    }
  }

  async function exportCsv() {
    if (!userId) return;
    setExporting(true);
    setExportError(null);
    try {
      const blob = await downloadLegalAcceptancesCsv(userId);
      downloadBlob(blob, `legal-acceptances-${userId}.csv`);
    } catch (err) {
      setExportError(legalErrorMessage(err, "The CSV did not download. Try again."));
    } finally {
      setExporting(false);
    }
  }

  function pick(user: User | null) {
    const next = new URLSearchParams(params.toString());
    if (user) next.set("user", user.id);
    else next.delete("user");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const person = useMemo(() => users?.find((user) => user.id === userId) ?? null, [users, userId]);
  const documentById = useMemo(() => new Map(documents.map((doc) => [doc.id, doc])), [documents]);

  const standing = useMemo(() => {
    if (!rows || !documents.length) return [];
    const role = person?.role;
    return documents
      .filter((doc) => {
        const audience = doc.versions[0]?.audience ?? doc.draft.audience;
        return (
          audience === "all" ||
          audience === role ||
          rows.some((row) => row.document_id === doc.id)
        );
      })
      .map((doc) => ({ doc, standing: acceptanceStanding(doc, rows, now) }))
      .filter((row): row is { doc: LegalDocument; standing: NonNullable<typeof row.standing> } =>
        Boolean(row.standing),
      );
  }, [rows, documents, person, now]);

  const columns = useMemo<DataTableColumn<LegalAcceptance>[]>(
    () => [
      {
        id: "when",
        header: "When",
        primary: true,
        sortValue: (row) => row.accepted_at,
        cell: (row) => (
          <span className="text-body text-text-primary whitespace-nowrap">{formatManila(row.accepted_at)}</span>
        ),
      },
      {
        id: "document",
        header: "Document",
        sortValue: (row) => `${row.document_id} ${String(row.version).padStart(4, "0")}`,
        filterValue: (row) => `${documentById.get(row.document_id)?.draft.title ?? ""} ${row.document_id}`,
        cell: (row) => {
          const doc = documentById.get(row.document_id);
          const version = doc?.versions.find((v) => v.id === row.version_id);
          return (
            <div className="flex flex-col items-start gap-1">
              <span className="text-body text-text-primary">
                {version?.title ?? doc?.draft.title ?? row.document_id}, version {row.version}
              </span>
              {version?.placeholder ? (
                <StatusChip tone="neutral" icon="circle-dashed" label="Placeholder text" />
              ) : null}
            </div>
          );
        },
      },
      {
        id: "how",
        header: "How",
        sortValue: (row) => acceptanceHow(row),
        cell: (row) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-body text-text-primary">{acceptanceHow(row)}</span>
            {row.order_id ? (
              <Link
                href={`/${tree}/orders/${encodeURIComponent(row.order_id)}`}
                className="text-caption text-text-secondary underline underline-offset-4"
              >
                Order {row.order_id}
              </Link>
            ) : null}
            {signupChoices(row) ? (
              <span className="text-caption text-text-muted">{signupChoices(row)}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: "app",
        header: "App and device",
        hideOnMobile: true,
        sortValue: (row) => row.app,
        filterValue: (row) => `${row.app} ${row.device}`,
        cell: (row) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-body text-text-secondary break-all">{row.app}</span>
            <span className="text-caption text-text-muted break-all">{row.device}</span>
          </div>
        ),
      },
    ],
    [documentById, tree],
  );

  const finder = (
    <section className="gg-card flex flex-col gap-3" aria-labelledby="acceptance-who">
      <h2 id="acceptance-who" className="text-h3 text-text-primary m-0">
        {userId ? "Look up someone else" : "Whose acceptances?"}
      </h2>
      {usersError ? (
        <p className="text-body text-error m-0" role="alert">
          The account list did not load. Refresh the page to try again.
        </p>
      ) : null}
      <PersonFinder users={users} onPick={pick} />
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Every time someone agrees to a legal document, the apps record which
        version, when, and from which app. Rows are never edited or deleted. A
        later version is a new row.
      </p>

      {!userId ? (
        <>
          {finder}
          <EmptyState
            title="Choose a person to see their record"
            body="The log is kept per person, and the CSV export covers one person at a time."
          />
        </>
      ) : (
        <>
          <section className="gg-card flex flex-col gap-4" aria-labelledby="acceptance-person">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 id="acceptance-person" className="text-h2 text-text-primary m-0 break-words">
                  {person ? person.name || person.email || person.id : users ? "Unknown account" : "Loading…"}
                </h2>
                <p className="text-body text-text-secondary m-0 break-all">
                  {person ? `${roleLabel(person.role)}${person.email ? `, ${person.email}` : ""}` : null}
                </p>
                <p className="text-caption text-text-muted m-0 break-all">Account ID {userId}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => pick(null)}>
                  Change person
                </Button>
                <Button variant="primary" disabled={exporting || !rows?.length} onClick={() => void exportCsv()}>
                  <Download aria-hidden data-icon="inline-start" />
                  {exporting ? "Preparing CSV…" : "Export CSV"}
                </Button>
              </div>
            </div>
            {exportError ? (
              <p className="text-body text-error m-0" role="alert">
                {exportError}
              </p>
            ) : null}

            {standing.length ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
                  Where they stand today
                </h3>
                <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
                  {standing.map(({ doc, standing: chip }) => (
                    <li
                      key={doc.id}
                      className="flex flex-col items-start gap-1.5 rounded-field border border-outline-subtle p-3"
                    >
                      <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                        {doc.versions[0]?.title ?? doc.draft.title}
                      </span>
                      <StatusChip tone={chip.tone} icon={chip.icon} label={chip.label} />
                      <span className="text-caption text-text-muted">{chip.detail}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-text-muted m-0">
                  Documents for everyone and for their main role. The apps also
                  check any other role the account holds.
                </p>
              </div>
            ) : null}
          </section>

          {error ? (
            <ErrorState
              body={error}
              action={
                <Button variant="secondary" onClick={() => void load(userId)}>
                  Try again
                </Button>
              }
            />
          ) : (
            <section className="flex flex-col gap-3" aria-labelledby="acceptance-rows">
              <h2 id="acceptance-rows" className="text-h3 text-text-primary m-0">
                Every acceptance
              </h2>
              <DataTable
                columns={columns}
                data={rows ?? []}
                loading={loading && !rows}
                getRowId={(row) => row.id}
                caption="Acceptance log"
                itemLabel="acceptances"
                pageSize={25}
                defaultSortId="when"
                defaultSortDirection="desc"
                empty={
                  <EmptyState
                    title="No acceptances on record"
                    body="This person has not agreed to any legal document in an app that records it. Apps released before the legal screens record nothing."
                  />
                }
              />
              {nextOffset !== null ? (
                <Button variant="secondary" className="self-start" disabled={loading} onClick={() => void loadMore()}>
                  {loading ? "Loading…" : "Load more rows"}
                </Button>
              ) : null}
              <p className="text-caption text-text-muted m-0 max-w-prose">
                App and device are what the app reported. They are not verified
                identities.
              </p>
            </section>
          )}

          {finder}
        </>
      )}
    </div>
  );
}
