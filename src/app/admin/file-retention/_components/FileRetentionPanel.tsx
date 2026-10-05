"use client";

/**
 * Super Admin's view of file retention (gridgo-api#131; contract
 * `gridgo-api/docs/STORAGE_API.md`, "Retention and daily cleanup").
 *
 * Three things, all read-only:
 * - whether automatic deletion is on. It is the API's
 *   `GRIDGO_FILE_RETENTION_DELETE_ENABLED` deployment flag, off by default,
 *   and the API offers no way to change it, so the switch here shows the
 *   state and never pretends to flip it;
 * - how long each file type is kept (the decided periods, from the doc);
 * - what the next daily pass would delete, per file type, from
 *   `GET /admin/files/retention`, which is always a dry run.
 *
 * Never call anything here that deletes. Early deletion of one file lives on
 * the order, under the file.
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { getFileRetention } from "@/lib/api/client";
import type { FileRetentionReport } from "@/lib/api/types";
import { retentionGroups, type RetentionGroup } from "@/lib/file-retention";
import { formatDateTime } from "@/lib/format";

export function FileRetentionPanel() {
  const [report, setReport] = useState<FileRetentionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getFileRetention());
    } catch (err) {
      setError(adminErrorMessage(err, "The retention counts could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = retentionGroups(report?.byPurpose);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        GRIDGO keeps each file only as long as its type needs, then a daily pass removes it.
        Files tied to an open issue, claim, refund, dispute or pickup escalation are never
        deleted, by the schedule or by anyone.
      </p>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <AutomaticDeletion report={report} loading={loading && !report} failed={Boolean(error)} />
          <EarlyDeletionNote />
        </div>

        <section className="gg-card flex flex-col gap-3" aria-labelledby="retention-counts">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 id="retention-counts" className="text-h3 text-text-primary m-0">
                What the next pass would delete
              </h2>
              <p className="text-caption text-text-muted m-0 mt-0.5">
                {report
                  ? `Counted ${formatDateTime(report.at)}. A count only: nothing was deleted.`
                  : "A count only: reading it never deletes anything."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Count again"
            >
              <RefreshCw size={16} strokeWidth={1.75} aria-hidden />
              {loading ? "Counting…" : "Count again"}
            </Button>
          </div>

          {error ? (
            <ErrorState
              title="Counts unavailable"
              body={error}
              action={
                <Button variant="outline" onClick={() => void load()}>
                  Try again
                </Button>
              }
            />
          ) : loading && !report ? (
            <CountsSkeleton />
          ) : (
            <RetentionTable groups={groups} total={report?.total ?? 0} />
          )}

          <p className="text-caption text-text-muted m-0">
            Counts include uploads of that type that nothing uses any more. Files on an order
            that has not closed, or held by an open case, are not counted.
          </p>
        </section>
      </div>
    </div>
  );
}

function AutomaticDeletion({
  report,
  loading,
  failed,
}: {
  report: FileRetentionReport | null;
  loading: boolean;
  failed: boolean;
}) {
  const on = report?.deletionEnabled === true;
  const known = Boolean(report);
  return (
    <section
      className={`gg-card flex flex-col gap-3 ${on ? "border-warning" : ""}`}
      aria-labelledby="automatic-deletion"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="automatic-deletion" className="text-h3 text-text-primary m-0">
            Automatic deletion
          </h2>
          <p className="text-body text-text-secondary m-0 mt-1">
            {!known
              ? loading
                ? "Reading the current setting…"
                : failed
                  ? "The current setting could not be read."
                  : ""
              : on
                ? "On. Every day the pass deletes the files counted here, for good."
                : "Off. The daily pass only counts; no file is deleted on a schedule."}
          </p>
        </div>
        <div className="flex min-h-11 shrink-0 items-center gap-2">
          {known ? (
            <span
              className="text-body text-text-primary"
              style={{ fontFamily: "var(--font-medium)" }}
              aria-hidden
            >
              {on ? "On" : "Off"}
            </span>
          ) : null}
          <Switch
            checked={on}
            disabled
            aria-label={`Automatic deletion is ${known ? (on ? "on" : "off") : "unknown"}`}
          />
        </div>
      </div>
      {known ? (
        <div>
          {on ? (
            <StatusChip tone="warning" icon="triangle-alert" label="On: deleting on schedule" />
          ) : (
            <StatusChip tone="neutral" icon="ban" label="Off: counting only" />
          )}
        </div>
      ) : null}
      <div className="border-outline-subtle flex flex-col gap-1.5 border-t pt-3">
        <h3
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          Turning it {on ? "off" : "on"}
        </h3>
        <p className="text-body text-text-secondary m-0">
          This is a setting in the API&rsquo;s deployment, not a control on this page, so no
          click here can start deleting files.{" "}
          {on
            ? "Ask whoever runs the API to turn it off; the next pass then only counts again."
            : "It is turned on once, by whoever runs the API, after the counts here have been reviewed and the first clean-up is approved. Deleted files cannot be recovered."}
        </p>
      </div>
    </section>
  );
}

function EarlyDeletionNote() {
  return (
    <section className="gg-card flex flex-col gap-1.5" aria-labelledby="early-deletion">
      <h2 id="early-deletion" className="text-h3 text-text-primary m-0">
        Deleting one file early
      </h2>
      <p className="text-body text-text-secondary m-0">
        Open the order and choose <span className="text-text-primary">Delete early</span> under
        the file. Only Super Admin can, with a written reason that the audit log keeps with
        your name. The order then shows who deleted it, when and why.
      </p>
    </section>
  );
}

function RetentionTable({ groups, total }: { groups: RetentionGroup[]; total: number }) {
  return (
    <div className="flex flex-col">
      <dl className="m-0 flex flex-col">
        {groups.map((group) => (
          <div
            key={group.id}
            className="border-outline-subtle flex flex-col gap-1 border-b py-3 first:pt-0"
          >
            <dt className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span
                  className="text-body text-text-primary block"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  {group.label}
                </span>
                <span className="text-caption text-text-muted block">Kept {group.keptFor}</span>
              </span>
              <span
                className={`text-body shrink-0 tabular-nums ${group.count ? "text-text-primary" : "text-text-muted"}`}
                style={{ fontFamily: "var(--font-medium)" }}
                aria-label={`${group.count} ${group.count === 1 ? "file" : "files"}`}
              >
                {group.count}
              </span>
            </dt>
            <dd className="m-0">
              <ul className="m-0 flex list-none flex-col p-0">
                {group.rows.map((row) => (
                  <li
                    key={row.purpose}
                    className="flex items-baseline justify-between gap-3 py-0.5 pl-3"
                  >
                    <span className="text-caption text-text-secondary min-w-0">{row.label}</span>
                    <span
                      className={`text-caption shrink-0 tabular-nums ${row.count ? "text-text-primary" : "text-text-muted"}`}
                    >
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
      <p className="m-0 flex items-baseline justify-between gap-3 pt-3">
        <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
          Total
        </span>
        <span className="text-h3 text-text-primary tabular-nums">
          {total} {total === 1 ? "file" : "files"}
        </span>
      </p>
    </div>
  );
}

function CountsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
