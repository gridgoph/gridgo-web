"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Search } from "lucide-react";

import { usePeople } from "@/components/vouchers/data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  lookupClientVouchers,
  reissueVoucher,
  voidVoucher,
} from "@/lib/api/client";
import type { User, Voucher } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  VOUCHER_LIMITS,
  canReissue,
  canVoid,
  countdown,
  formatManila,
  inWalletTab,
  presentVoucherStatus,
  voucherErrorIsStale,
  voucherErrorMessage,
  type WalletTab,
} from "@/lib/vouchers";

const TABS: { value: WalletTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "available", label: "Available" },
  { value: "used", label: "Used" },
  { value: "expired", label: "Expired" },
];

const MAX_MATCHES = 8;

/**
 * One client's vouchers, as the client's own wallet sorts them. Operations
 * reads it to answer a client; Super Admin can also void an available voucher
 * or reissue a voided one, each with a reason.
 *
 * The client is chosen from the same client list the Roles page reads, so the
 * lookup shows nothing about a person that the portal does not already show.
 */
export function VoucherLookup({
  tree,
  clientId,
  onClientChange,
}: {
  tree: "ops" | "admin";
  clientId: string;
  onClientChange: (clientId: string) => void;
}) {
  const { people, error: peopleError, reload: reloadPeople } = usePeople("clients");
  const client = people?.find((person) => person.id === clientId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {clientId ? (
        <Wallet
          key={clientId}
          tree={tree}
          clientId={clientId}
          client={client}
          peopleLoaded={people !== null}
          onChangeClient={() => onClientChange("")}
        />
      ) : peopleError ? (
        <ErrorState
          body="Could not load the client list. Try again."
          action={
            <Button variant="secondary" onClick={() => void reloadPeople()}>
              Retry
            </Button>
          }
        />
      ) : (
        <ClientPicker people={people} onPick={onClientChange} />
      )}
    </div>
  );
}

function matches(person: User, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return [person.name, person.email, person.orgName]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

function ClientPicker({
  people,
  onPick,
}: {
  people: User[] | null;
  onPick: (clientId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const found = useMemo(
    () => (people ?? []).filter((person) => matches(person, query)),
    [people, query],
  );
  return (
    <section aria-labelledby="lookup-heading" className="gg-card flex max-w-2xl flex-col gap-3">
      <h2 id="lookup-heading" className="text-h3 text-text-primary m-0">
        Find a client
      </h2>
      <Field>
        <FieldLabel htmlFor="lookup-query">Name or email</FieldLabel>
        <div className="relative">
          <Search
            className="text-text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="lookup-query"
            type="search"
            value={query}
            autoComplete="off"
            className="pl-9"
            placeholder="Start typing a client's name or email"
            disabled={people === null}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <FieldDescription>
          {people === null
            ? "Loading clients…"
            : "Opens the client's vouchers: what they hold, what they used and what expired."}
        </FieldDescription>
      </Field>
      {query.trim() && people ? (
        found.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Matching clients">
            {found.slice(0, MAX_MATCHES).map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className="hover:bg-surface-variant flex min-h-11 w-full flex-col items-start rounded-field px-3 py-2 text-left"
                  onClick={() => onPick(person.id)}
                >
                  <span className="text-body text-text-primary">{person.name || "Unnamed client"}</span>
                  <span className="text-caption text-text-muted">{person.email}</span>
                </button>
              </li>
            ))}
            {found.length > MAX_MATCHES ? (
              <li className="text-caption text-text-muted px-3 py-1">
                {found.length - MAX_MATCHES} more. Keep typing to narrow it down.
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="text-body text-text-secondary m-0">
            No client matches &ldquo;{query.trim()}&rdquo;. Vouchers only go to client accounts.
          </p>
        )
      ) : null}
    </section>
  );
}

function Wallet({
  tree,
  clientId,
  client,
  peopleLoaded,
  onChangeClient,
}: {
  tree: "ops" | "admin";
  clientId: string;
  client: User | null;
  peopleLoaded: boolean;
  onChangeClient: () => void;
}) {
  const [vouchers, setVouchers] = useState<Voucher[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WalletTab>("all");
  const [acting, setActing] = useState<{ voucher: Voucher; action: "void" | "reissue" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await lookupClientVouchers(clientId, "all");
      setOffset(Date.parse(result.serverTime) - Date.now() || 0);
      setVouchers(result.vouchers);
    } catch (err) {
      setError(voucherErrorMessage(err, "Could not load this client's vouchers. Try again."));
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The countdown runs on the server's clock, refreshed every half minute.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const serverNow = now + offset;

  const sorted = useMemo(
    () =>
      [...(vouchers ?? [])].sort(
        (a, b) =>
          Number(b.status === "available") - Number(a.status === "available") ||
          Date.parse(a.expiresAt) - Date.parse(b.expiresAt),
      ),
    [vouchers],
  );
  const shown = sorted.filter((voucher) => inWalletTab(voucher, tab));
  const count = (value: WalletTab) => sorted.filter((voucher) => inWalletTab(voucher, value)).length;

  return (
    <section aria-labelledby="wallet-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="wallet-heading" className="text-h3 text-text-primary m-0 break-words">
            {client?.name || (peopleLoaded ? "Client account" : "Loading client…")}
          </h2>
          {client?.email ? (
            <p className="text-body text-text-secondary m-0 break-all">{client.email}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {tree === "admin" ? (
            <Link
              href={`/admin/vouchers?tab=activity&client=${encodeURIComponent(clientId)}`}
              className="border-outline text-body text-text-primary hover:bg-surface-variant inline-flex min-h-11 items-center rounded-field border px-3"
            >
              See activity
            </Link>
          ) : null}
          <Button variant="outline" onClick={onChangeClient}>
            Look up another client
          </Button>
        </div>
      </div>

      {notice ? (
        <p className="text-body text-text-primary m-0" role="status">
          {notice}
        </p>
      ) : null}

      {error && !vouchers ? (
        <ErrorState
          body={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : !vouchers ? (
        <LoadingBlock label="Loading vouchers…" />
      ) : !vouchers.length ? (
        <EmptyState
          title="No vouchers"
          body={
            tree === "admin"
              ? "This client has never been issued a voucher or added a code. Issue one from a campaign."
              : "This client has never been issued a voucher or added a code."
          }
        />
      ) : (
        <>
          <Tabs value={tab} onValueChange={(value) => setTab(value as WalletTab)}>
            <TabsList aria-label="Which vouchers">
              {TABS.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                  <span className="text-text-muted tabular-nums"> {count(option.value)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {shown.length ? (
            <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
              {shown.map((voucher) => (
                <li key={voucher.id}>
                  <WalletItem
                    voucher={voucher}
                    now={serverNow}
                    canManage={tree === "admin"}
                    onAct={(action) => {
                      setNotice(null);
                      setActing({ voucher, action });
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-text-secondary m-0">None here.</p>
          )}
          {tab === "expired" ? (
            <p className="text-caption text-text-muted m-0">
              As in the client&rsquo;s wallet, Expired also lists voided vouchers.
            </p>
          ) : null}
        </>
      )}

      {tree === "admin" ? (
        <VoucherActionDialog
          acting={acting}
          onClose={() => setActing(null)}
          onDone={(message) => {
            setActing(null);
            setNotice(message);
            void load();
          }}
          onStale={() => void load()}
        />
      ) : null}
    </section>
  );
}

function WalletItem({
  voucher,
  now,
  canManage,
  onAct,
}: {
  voucher: Voucher;
  now: number;
  canManage: boolean;
  onAct: (action: "void" | "reissue") => void;
}) {
  const status = presentVoucherStatus(voucher);
  const clock = countdown(voucher.expiresAt, now);
  const live = voucher.status === "available";
  const urgencyClass =
    clock.urgency === "urgent" ? "text-error" : clock.urgency === "soon" ? "text-warning" : "text-text-secondary";
  return (
    <article className="gg-card flex h-full flex-col gap-3" aria-label={`${voucher.name ?? "Voucher"}, ${status.label}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-h3 text-text-primary m-0 tabular-nums">{formatPhp(voucher.valueMinor)}</p>
          <p className="text-body text-text-secondary m-0 break-words">{voucher.name ?? "Voucher"}</p>
        </div>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </div>
      {status.hint ? <p className="text-caption text-text-muted m-0">{status.hint}</p> : null}
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        <dt className="text-caption text-text-muted">Issued</dt>
        <dd className="text-body text-text-secondary m-0">{formatManila(voucher.issuedAt)}</dd>
        <dt className="text-caption text-text-muted">{live && clock.urgency !== "over" ? "Expires" : "Expiry"}</dt>
        <dd className="text-body text-text-secondary m-0">
          {formatManila(voucher.expiresAt)}
          {live && clock.urgency !== "over" ? (
            <span className={`flex items-center gap-1 ${urgencyClass}`}>
              <Clock className="size-3.5 shrink-0" aria-hidden />
              {clock.text}
            </span>
          ) : null}
        </dd>
      </dl>
      {canManage && (canVoid(voucher) || canReissue(voucher, now)) ? (
        <div className="mt-auto flex flex-wrap gap-2">
          {canVoid(voucher) ? (
            <Button variant="outline" onClick={() => onAct("void")}>
              Void
            </Button>
          ) : null}
          {canReissue(voucher, now) ? (
            <Button variant="outline" onClick={() => onAct("reissue")}>
              Reissue
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

const ACTION_COPY = {
  void: {
    title: "Void this voucher",
    body: "The client can no longer use it; it moves to their Expired tab as Voided. You can reissue it until it expires. It still counts toward the campaign's limit.",
    reasonHint: "Why it is being voided. Kept in the activity log; the client does not see it.",
    button: "Void voucher",
    done: "Voucher voided.",
  },
  reissue: {
    title: "Reissue this voucher",
    body: "The same voucher becomes usable again, with its original expiry. It does not add time or give a second voucher.",
    reasonHint: "Why it is coming back. Kept in the activity log; the client does not see it.",
    button: "Reissue voucher",
    done: "Voucher reissued. The client can use it again.",
  },
} as const;

function VoucherActionDialog({
  acting,
  onClose,
  onDone,
  onStale,
}: {
  acting: { voucher: Voucher; action: "void" | "reissue" } | null;
  onClose: () => void;
  onDone: (message: string) => void;
  onStale: () => void;
}) {
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setAttempted(false);
    setError(null);
  }, [acting]);

  const copy = acting ? ACTION_COPY[acting.action] : null;
  const missing = !reason.trim();

  async function submit() {
    if (!acting) return;
    setAttempted(true);
    if (missing) return;
    setBusy(true);
    setError(null);
    try {
      if (acting.action === "void") await voidVoucher(acting.voucher.id, reason.trim());
      else await reissueVoucher(acting.voucher.id, reason.trim());
      onDone(ACTION_COPY[acting.action].done);
    } catch (err) {
      setError(voucherErrorMessage(err, "That did not go through. Try again."));
      if (voucherErrorIsStale(err)) onStale();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={acting !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      {acting && copy ? (
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>
              {formatPhp(acting.voucher.valueMinor)}, {acting.voucher.name ?? "voucher"}, expires{" "}
              {formatManila(acting.voucher.expiresAt)}. {copy.body}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={attempted && missing ? true : undefined}>
              <FieldLabel htmlFor="voucher-action-reason">Reason</FieldLabel>
              <Textarea
                id="voucher-action-reason"
                rows={3}
                maxLength={VOUCHER_LIMITS.reasonMax}
                value={reason}
                disabled={busy}
                aria-invalid={attempted && missing ? true : undefined}
                onChange={(event) => setReason(event.target.value)}
              />
              <FieldDescription>{copy.reasonHint}</FieldDescription>
              {attempted && missing ? <FieldError>Write a reason.</FieldError> : null}
            </Field>
          </FieldGroup>
          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant={acting.action === "void" ? "destructive" : "default"}
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Working…" : copy.button}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
