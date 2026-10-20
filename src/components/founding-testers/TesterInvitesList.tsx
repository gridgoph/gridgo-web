"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { personLabel, usePeople } from "@/components/vouchers/data";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  isApiError,
  listTesterInvites,
  matchTesterInvites,
  recordTesterInvite,
} from "@/lib/api/client";
import type { TesterInvite, TesterInviteStatus } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  INVITE_FILTERS,
  TESTER_LIST_PAGE_SIZE,
  presentInviteStatus,
  testerErrorText,
} from "@/lib/tester-program";
import { formatManila } from "@/lib/vouchers";

/**
 * Tester sign-up form responses (`GET /ops/tester-invites`). The API fetches
 * no form: Operations records each response's invite code and email here
 * (`POST /ops/tester-invites`), and GRIDGO matches it to a client account by
 * email. Unmatched entries say why; "Match again" retries them all. Neither
 * issues a reward: rewards come only when the friend finishes all five steps.
 * Operations and Super Admin alike.
 */
export function TesterInvitesList() {
  const { people } = usePeople("clients");
  const name = useCallback((id: string) => personLabel(people, id), [people]);
  const [filter, setFilter] = useState<TesterInviteStatus | "all">("all");
  const [offset, setOffset] = useState(0);
  const [invites, setInvites] = useState<TesterInvite[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const page = await listTesterInvites(
          { status: filter === "all" ? undefined : filter },
          { offset, limit: TESTER_LIST_PAGE_SIZE },
        );
        setInvites(page.invites);
        setTotal(page.total);
      } catch (err) {
        setInvites(null);
        setError(
          isApiError(err)
            ? err.status === 404
              ? "Tester invites are not available yet. They appear here once the service is updated."
              : `Could not load tester invites (${err.code}).`
            : "Could not reach the API. Check it is running, then retry.",
        );
      } finally {
        setLoading(false);
      }
    }, [filter, offset]),
  );

  useLiveReload(["identity", "notifications"], load);

  useEffect(() => {
    void load();
  }, [load]);

  async function record() {
    if (busy || !code.trim() || !email.trim()) return;
    setBusy(true);
    setFormError(null);
    setOk(null);
    try {
      const invite = await recordTesterInvite({ code: code.trim(), email: email.trim() });
      setCode("");
      setEmail("");
      setOk(
        invite.clientId
          ? `Recorded and matched to ${name(invite.clientId)}.`
          : `Recorded. ${presentInviteStatus(invite).detail}`,
      );
      void load();
    } catch (err) {
      setFormError(
        testerErrorText(err) ??
          (isApiError(err)
            ? `Could not record it (${err.code}).`
            : "Could not reach the API. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function matchAgain() {
    setBusy(true);
    setFormError(null);
    setOk(null);
    try {
      const result = await matchTesterInvites();
      setOk(
        `Matched again: ${result.matched.toLocaleString("en-PH")} joined, ${result.unmatched.toLocaleString("en-PH")} still unmatched.`,
      );
      void load();
    } catch (err) {
      setFormError(
        isApiError(err)
          ? `Could not match again (${err.code}).`
          : "Could not reach the API. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<DataTableColumn<TesterInvite>[]>(
    () => [
      {
        id: "email",
        header: "Friend's email",
        primary: true,
        sortValue: (row) => row.email,
        filterValue: (row) => `${row.email} ${name(row.inviterId)}`,
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <span className="text-body text-text-primary break-all">{row.email}</span>
            {row.clientId ? (
              <span className="text-caption text-text-muted">{name(row.clientId)}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: "inviter",
        header: "Invited by",
        sortValue: (row) => name(row.inviterId),
        cell: (row) => (
          <span className="text-body text-text-primary">{name(row.inviterId)}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => presentInviteStatus(row).label,
        cell: (row) => {
          const status = presentInviteStatus(row);
          return (
            <div className="flex min-w-0 flex-col items-start gap-1">
              <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
              <span className="text-caption text-text-muted max-w-72 whitespace-normal">
                {status.detail}
              </span>
            </div>
          );
        },
      },
      {
        id: "recorded",
        header: "Recorded",
        hideOnMobile: true,
        sortValue: (row) => row.createdAt,
        cell: (row) => (
          <span className="text-body text-text-secondary">
            {formatManila(row.createdAt)}
          </span>
        ),
      },
    ],
    [name],
  );

  const pending = loading && !invites;
  const previous = offset > 0 ? Math.max(0, offset - TESTER_LIST_PAGE_SIZE) : null;
  const next =
    offset + TESTER_LIST_PAGE_SIZE < total ? offset + TESTER_LIST_PAGE_SIZE : null;

  return (
    <div className="flex flex-col gap-3">
      <section className="gg-card p-3" aria-labelledby="record-invite-heading">
        <h2 id="record-invite-heading" className="text-h3 text-text-primary m-0">
          Record a sign-up form response
        </h2>
        <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
          Copy the invite code and email from each tester sign-up form response. GRIDGO
          matches the email to a client account. Recording issues nothing: both get a
          voucher only when the friend finishes all five steps.
        </p>
        <FieldGroup className="mt-3 md:flex-row md:items-start">
          <Field data-invalid={formError ? true : undefined}>
            <FieldLabel htmlFor="tester-invite-code">Invite code</FieldLabel>
            <Input
              id="tester-invite-code"
              value={code}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Field data-invalid={formError ? true : undefined}>
            <FieldLabel htmlFor="tester-invite-email">Friend&rsquo;s email</FieldLabel>
            <Input
              id="tester-invite-email"
              type="email"
              value={email}
              disabled={busy}
              maxLength={254}
              autoComplete="off"
              onChange={(event) => setEmail(event.target.value)}
            />
            <FieldDescription>As typed on the form.</FieldDescription>
          </Field>
        </FieldGroup>
        {formError ? <FieldError className="mt-2">{formError}</FieldError> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy || !code.trim() || !email.trim()}
            onClick={() => void record()}
          >
            {busy ? "Saving…" : "Record response"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void matchAgain()}>
            <RefreshCw aria-hidden />
            Match unmatched again
          </Button>
        </div>
        {ok ? (
          <p className="text-body text-success m-0 mt-3" role="status">
            {ok}
          </p>
        ) : null}
      </section>

      <ToggleGroup
        value={[filter]}
        onValueChange={(values) => {
          const value = values[0] as TesterInviteStatus | "all" | undefined;
          if (value) {
            setFilter(value);
            setOffset(0);
          }
        }}
        variant="outline"
        spacing={0}
        aria-label="Show invites"
        className="flex-wrap"
      >
        {INVITE_FILTERS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="min-h-11 px-3"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {!pending && error && !invites ? (
        <ErrorState
          body={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : !pending && invites && !invites.length ? (
        <EmptyState
          title={
            filter === "all" ? "No form responses recorded yet" : "None in this state"
          }
          body={
            filter === "all"
              ? "Record each tester sign-up form response above. Copying or sharing a link alone does not count as an invite."
              : "Pick another state to see the rest."
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={invites ?? []}
          loading={pending}
          getRowId={(row) => row.id}
          caption="Tester sign-up form responses"
          filterPlaceholder="Filter by email or name…"
          itemLabel="responses"
          pageSize={TESTER_LIST_PAGE_SIZE}
        />
      )}

      {previous != null || next != null ? (
        <nav
          aria-label="Invite pages"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <span className="text-caption text-text-muted tabular-nums" role="status">
            Responses {offset + 1}–{offset + (invites?.length ?? 0)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={loading || previous == null}
              onClick={() => previous != null && setOffset(previous)}
            >
              <ChevronLeft aria-hidden />
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={loading || next == null}
              onClick={() => next != null && setOffset(next)}
            >
              Next
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
