"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, FilePlus2 } from "lucide-react";

import { NewLegalDocumentDialog } from "@/components/legal/NewLegalDocumentDialog";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableRowAction, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import { listLegalDocuments } from "@/lib/api/client";
import type { LegalDocument } from "@/lib/api/types";
import {
  audienceLabel,
  currentVersion,
  draftIsUnpublished,
  formatManilaDate,
  legalErrorMessage,
  scheduledVersions,
  sortLegalDocuments,
  versionStatusChip,
} from "@/lib/legal";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

type Props = {
  /** Which tree the screen is mounted in; links stay inside it. */
  tree: "admin" | "ops";
  /** Super Admin only: create, edit, publish. */
  canEdit: boolean;
};

/**
 * The legal library (LEGAL_API.md "Super Admin editor and publication").
 * Each row answers two questions: what people read today, and whether the
 * draft holds something not yet published.
 */
export function LegalLibrary({ tree, canEdit }: Props) {
  const router = useRouter();
  const [documents, setDocuments] = useState<LegalDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listLegalDocuments();
        setDocuments(sortLegalDocuments(rows));
        setNow(Date.now());
      } catch (err) {
        setError(legalErrorMessage(err, "The legal library did not load. Try again."));
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useEffect(() => {
    void load();
  }, [load]);
  useLegalInboxReload("legal.", load);

  const base = `/${tree}/legal`;
  const rows = useMemo(() => documents ?? [], [documents]);
  const placeholders = rows.filter((doc) => currentVersion(doc, now)?.placeholder !== false).length;
  const unpublished = rows.filter(draftIsUnpublished).length;

  const columns = useMemo<DataTableColumn<LegalDocument>[]>(
    () => [
      {
        id: "document",
        header: "Document",
        primary: true,
        sortValue: (doc) => doc.draft.title,
        filterValue: (doc) => `${doc.draft.title} ${doc.id}`,
        cell: (doc) => {
          const shown = currentVersion(doc, now);
          return (
            <div className="min-w-0">
              <Link
                href={`${base}/${encodeURIComponent(doc.id)}`}
                className="text-body text-text-primary underline-offset-4 hover:underline"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {shown?.title ?? doc.draft.title}
              </Link>
              <p className="text-caption text-text-muted m-0 mt-0.5 break-all">{doc.id}</p>
            </div>
          );
        },
      },
      {
        id: "audience",
        header: "Applies to",
        sortValue: (doc) => audienceLabel(currentVersion(doc, now)?.audience ?? doc.draft.audience),
        cell: (doc) => (
          <span className="text-body text-text-secondary">
            {audienceLabel(currentVersion(doc, now)?.audience ?? doc.draft.audience)}
          </span>
        ),
      },
      {
        id: "now",
        header: "What people read now",
        sortValue: (doc) => currentVersion(doc, now)?.version ?? 0,
        cell: (doc) => {
          const shown = currentVersion(doc, now);
          if (!shown) {
            return <span className="text-body text-text-muted">Not published yet</span>;
          }
          const chip = versionStatusChip(shown);
          return (
            <div className="flex flex-col items-start gap-1">
              <StatusChip {...chip} label={`${chip.label}, version ${shown.version}`} />
              <span className="text-caption text-text-muted">
                Since {formatManilaDate(shown.effectiveAt)}
              </span>
            </div>
          );
        },
      },
      {
        id: "next",
        header: "Coming up",
        hideOnMobile: true,
        cell: (doc) => {
          const next = scheduledVersions(doc, now)[0];
          const changed = draftIsUnpublished(doc);
          if (!next && !changed) return <span className="text-body text-text-muted">Nothing</span>;
          return (
            <div className="flex flex-col items-start gap-1">
              {next ? (
                <StatusChip
                  tone="info"
                  icon="clock"
                  label={`Version ${next.version} from ${formatManilaDate(next.effectiveAt)}`}
                />
              ) : null}
              {changed ? (
                <StatusChip tone="warning" icon="square-pen" label="Draft not published" />
              ) : null}
            </div>
          );
        },
      },
    ],
    [base, now],
  );

  if (error && !documents) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-2">
          <p className="text-body text-text-secondary m-0">
            The documents people agree to in the apps and read on the website.
            Publishing a version changes what they see at once, with no app
            release. Published versions are kept as evidence and never change.
          </p>
          {!canEdit ? (
            <p className="text-caption text-text-muted m-0">
              Only Super Admin can edit and publish. You can read every version
              and the acceptance log.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            Refresh
          </Button>
          {canEdit ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <FilePlus2 aria-hidden data-icon="inline-start" />
              New document
            </Button>
          ) : null}
        </div>
      </div>

      {documents && placeholders > 0 ? (
        <div
          className="flex flex-col gap-1 rounded-card border border-outline bg-surface p-3 md:flex-row md:items-center md:gap-3"
          role="note"
        >
          <span className="shrink-0">
            <StatusChip tone="neutral" icon="circle-dashed" label="Placeholder text" />
          </span>
          <p className="text-body text-text-secondary m-0">
            {placeholders === rows.length
              ? "Every document still shows placeholder text."
              : `${placeholders} of ${rows.length} documents still show placeholder text.`}{" "}
            Agreeing to a placeholder does not count as agreeing to the real
            text; publishing the real text asks everyone to accept it.
          </p>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        loading={loading && !documents}
        getRowId={(doc) => doc.id}
        caption="Legal documents"
        itemLabel="documents"
        pageSize={25}
        filterPlaceholder="Find a document…"
        rowActions={(doc) => (
          <DataTableRowAction
            label={canEdit ? `Open ${doc.draft.title}` : `Read ${doc.draft.title}`}
            icon={ArrowUpRight}
            href={`${base}/${encodeURIComponent(doc.id)}`}
          />
        )}
        empty={
          <EmptyState
            title="No legal documents yet"
            body="The eight launch documents appear once the API's reference data is seeded."
          />
        }
      />

      {documents && unpublished > 0 && canEdit ? (
        <p className="text-caption text-text-muted m-0">
          {unpublished === 1
            ? "1 document has a saved draft that is not published."
            : `${unpublished} documents have saved drafts that are not published.`}{" "}
          People keep seeing the published version until you publish.
        </p>
      ) : null}

      {canEdit ? (
        <NewLegalDocumentDialog
          open={creating}
          takenIds={rows.map((doc) => doc.id)}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(`${base}/${encodeURIComponent(id)}`);
          }}
        />
      ) : null}
    </div>
  );
}
