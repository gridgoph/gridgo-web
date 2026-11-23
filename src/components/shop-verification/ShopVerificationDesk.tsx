"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, IdCard, ScanFace } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SkeletonCards } from "@/components/ui/loading";
import { Progress } from "@/components/ui/progress";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import {
  decideApprovalCase,
  getApprovalCase,
  getFileDownloadUrl,
  getSupplierVerificationDetail,
  isApiError,
  listSupplierVerificationQueue,
} from "@/lib/api/client";
import type { ApprovalCaseDetail } from "@/lib/api/types";
import { formatDate, formatDateTime, formatPhp } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import type { StatusIconName } from "@/lib/order-state";
import {
  STAFF_PAPER_LABEL,
  VERIFICATION_PAPERS,
  isImageFile,
  papersOnFile,
  queueOrder,
  readQueueEntry,
  readQueuePage,
  staffDaysLine,
  staffLedger,
  staffStatus,
  verificationUnavailable,
  type StaffTone,
  type VerificationFile,
  type VerificationPaper,
  type VerificationQueueEntry,
} from "@/lib/shop-verification";

/** The approval statuses the desk lists, in tab order. */
const VIEWS = [
  { status: "pending", label: "Waiting" },
  { status: "approved", label: "Verified" },
  { status: "rejected", label: "Rejected" },
] as const;
type ViewStatus = (typeof VIEWS)[number]["status"];

const MAX_PAGES = 20;

const PAPER_ICON: Record<VerificationPaper, LucideIcon> = {
  valid_id: IdCard,
  id_selfie: ScanFace,
  business_permit: FileText,
};

const TONE_ICON: Record<StaffTone, StatusIconName> = {
  neutral: "circle-dashed",
  warning: "triangle-alert",
  success: "circle-check",
  info: "clock",
};

type QueueState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; entries: VerificationQueueEntry[] };

type DetailState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; entry: VerificationQueueEntry; approval: ApprovalCaseDetail | null };

/**
 * Shop verification (gridgo-api#411): shops taking jobs before GRIDGO checks
 * their papers. Each shop's papers (read through the API's signed links only,
 * never kept), the days left in its window, what was paid before
 * verification against the cap, what waits, and money to recover after a
 * dropped job. Operations reads; only Super Admin approves or rejects, through
 * the existing versioned approval-case decision, whose record names who
 * decided. Mounted at `/ops/shop-verification` and `/admin/shop-verification`.
 */
export function ShopVerificationDesk({
  canDecide,
  base,
}: {
  /** Super Admin only: the API refuses decisions from anyone else. */
  canDecide: boolean;
  /** The caller's own tree, so order links stay in it. */
  base: "/ops" | "/admin";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const view: ViewStatus =
    (VIEWS.find((v) => v.status === search.get("status"))?.status as ViewStatus | undefined) ?? "pending";
  const selectedId = search.get("shop");

  const [queue, setQueue] = useState<QueueState>({ kind: "loading" });
  const [detail, setDetail] = useState<DetailState>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);

  const setParams = useCallback(
    (next: { status?: ViewStatus; shop?: string | null }) => {
      const params = new URLSearchParams(search.toString());
      if (next.status !== undefined) {
        if (next.status === "pending") params.delete("status");
        else params.set("status", next.status);
      }
      if (next.shop !== undefined) {
        if (next.shop) params.set("shop", next.shop);
        else params.delete("shop");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, search],
  );

  const loadQueue = useSerializedLoad(
    useCallback(async () => {
      try {
        const entries: VerificationQueueEntry[] = [];
        let cursor: string | null = null;
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const read = readQueuePage(await listSupplierVerificationQueue({ status: view, cursor }));
          if (!read) {
            setQueue({ kind: "unavailable" });
            return;
          }
          entries.push(...read.entries);
          cursor = read.nextCursor;
          if (!cursor) break;
        }
        setQueue({ kind: "ready", entries: entries.sort(queueOrder) });
      } catch (err) {
        if (isApiError(err) && verificationUnavailable(err.status)) {
          setQueue({ kind: "unavailable" });
          return;
        }
        setQueue({ kind: "failed", message: opsErrorMessage(err, "Could not load the shops waiting for verification.") });
      }
    }, [view]),
  );

  const loadDetail = useSerializedLoad(
    useCallback(async () => {
      if (!selectedId) {
        setDetail({ kind: "idle" });
        return;
      }
      setDetail((current) =>
        current.kind === "ready" && current.entry.supplierId === selectedId ? current : { kind: "loading" },
      );
      try {
        const body = (await getSupplierVerificationDetail(selectedId)) as { supplier?: unknown } | null;
        const entry = readQueueEntry(body?.supplier);
        if (!entry) {
          setDetail({ kind: "failed", message: "GRIDGO sent no verification record for this shop." });
          return;
        }
        // The decision record (who decided, the version a decision needs) is Super Admin's.
        const approval = canDecide ? await getApprovalCase(entry.approvalCaseId).catch(() => null) : null;
        setDetail({ kind: "ready", entry, approval });
      } catch (err) {
        setDetail({ kind: "failed", message: opsErrorMessage(err, "Could not open this shop.") });
      }
    }, [selectedId, canDecide]),
  );

  useEffect(() => {
    setQueue({ kind: "loading" });
    void loadQueue();
  }, [loadQueue]);
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  const reloadAll = useCallback(async () => {
    await Promise.all([loadQueue(), loadDetail()]);
  }, [loadQueue, loadDetail]);
  useLiveReload(["approvals", "payouts"], reloadAll);

  if (queue.kind === "unavailable") {
    return (
      <EmptyState
        title="Shop verification is not on this server yet"
        body="Once GRIDGO's server offers it, shops taking jobs before verification are listed here with their papers and payouts."
      />
    );
  }

  const entries = queue.kind === "ready" ? queue.entries : [];
  const showPanel = Boolean(selectedId);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Shops that finished sign-up take online jobs before GRIDGO checks their papers. Until
        they are verified, payouts stop at the cap and the rest waits; new orders pause when
        their window ends, and open jobs still finish.
        {canDecide ? "" : " Super Admin approves or rejects; you can see the papers and money here."}
      </p>

      <Tabs value={view} onValueChange={(value) => setParams({ status: value as ViewStatus, shop: null })}>
        <TabsList>
          {VIEWS.map((v) => (
            <TabsTrigger key={v.status} value={v.status}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {notice ? (
        <p className="text-body text-text-primary m-0" role="status">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-4">
        <section
          aria-label="Shops"
          className={`flex min-w-0 flex-col gap-2 ${showPanel ? "max-lg:hidden" : ""}`}
        >
          {queue.kind === "loading" ? (
            <SkeletonCards count={3} label="Loading shops" />
          ) : queue.kind === "failed" ? (
            <ErrorState
              body={queue.message}
              action={
                <Button variant="secondary" onClick={() => void loadQueue()}>
                  Try again
                </Button>
              }
            />
          ) : entries.length === 0 ? (
            <EmptyState
              title={view === "pending" ? "No shop is waiting" : "Nothing here yet"}
              body={
                view === "pending"
                  ? "Every shop that signed up has been checked. A new shop shows here as soon as it finishes sign-up."
                  : "Shops show here once Super Admin decides."
              }
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {entries.map((entry) => (
                <li key={entry.supplierId}>
                  <QueueRow
                    entry={entry}
                    selected={entry.supplierId === selectedId}
                    onOpen={() => {
                      setNotice(null);
                      setParams({ shop: entry.supplierId });
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Shop" className={`min-w-0 ${showPanel ? "" : "max-lg:hidden"}`}>
          {showPanel ? (
            <Button
              variant="ghost"
              className="mb-2 lg:hidden"
              onClick={() => setParams({ shop: null })}
            >
              <ArrowLeft className="size-4" aria-hidden />
              All shops
            </Button>
          ) : null}
          {detail.kind === "idle" ? (
            <div className="gg-card text-body text-text-secondary p-6">
              Choose a shop to see its papers, its days left and what it has been paid.
            </div>
          ) : detail.kind === "loading" ? (
            <SkeletonCards count={2} label="Opening the shop" />
          ) : detail.kind === "failed" ? (
            <ErrorState
              body={detail.message}
              action={
                <Button variant="secondary" onClick={() => void loadDetail()}>
                  Try again
                </Button>
              }
            />
          ) : (
            <ShopPanel
              key={detail.entry.supplierId}
              entry={detail.entry}
              approval={detail.approval}
              canDecide={canDecide}
              base={base}
              onDecided={async (message) => {
                setNotice(message);
                setParams({ shop: null });
                await loadQueue();
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function papersCount(entry: VerificationQueueEntry): number {
  const onFile = papersOnFile(entry.files);
  return VERIFICATION_PAPERS.filter((p) => onFile[p.paper]).length;
}

function QueueRow({
  entry,
  selected,
  onOpen,
}: {
  entry: VerificationQueueEntry;
  selected: boolean;
  onOpen: () => void;
}) {
  const v = entry.verification;
  const status = staffStatus(entry);
  const name = entry.shopName ?? "Shop without a name";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      aria-label={`Open ${name}`}
      className={`gg-card hover:bg-overlay-hover flex w-full flex-col gap-2 p-3 text-left ${
        selected ? "border-text-primary border-2" : ""
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-body text-text-primary min-w-0 truncate" style={{ fontFamily: "var(--font-medium)" }}>
          {name}
        </span>
        <span className="text-caption text-text-secondary shrink-0 tabular-nums">{staffDaysLine(v)}</span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusChip tone={status.tone} icon={TONE_ICON[status.tone]} label={status.label} />
      </span>
      <span className="text-caption text-text-muted tabular-nums">
        {papersCount(entry)} of {VERIFICATION_PAPERS.length} papers · {formatPhp(v.paidBeforeVerificationMinor)} paid
        {v.recoveryDueMinor > 0 ? ` · ${formatPhp(v.recoveryDueMinor)} to recover` : ""}
      </span>
    </button>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-body text-text-primary m-0 tabular-nums" style={{ fontFamily: "var(--font-medium)" }}>
        {value}
      </dd>
      {hint ? <dd className="text-caption text-text-secondary m-0">{hint}</dd> : null}
    </div>
  );
}

function ShopPanel({
  entry,
  approval,
  canDecide,
  base,
  onDecided,
}: {
  entry: VerificationQueueEntry;
  approval: ApprovalCaseDetail | null;
  canDecide: boolean;
  base: "/ops" | "/admin";
  onDecided: (message: string) => Promise<void>;
}) {
  const v = entry.verification;
  const status = staffStatus(entry);
  const onFile = papersOnFile(entry.files);
  const others = entry.files.filter((file) => !file.paper);
  const ledger = staffLedger(entry.ledger ?? []);
  const name = entry.shopName ?? "Shop without a name";
  const capPercent =
    v.payoutCapMinor > 0 ? Math.min(100, Math.round((v.paidBeforeVerificationMinor / v.payoutCapMinor) * 100)) : 0;
  const pending = entry.approvalStatus === "pending";
  const decided = approval?.approvalCase;

  return (
    <article className="flex flex-col gap-4" aria-labelledby="shop-verification-name">
      <header className="gg-card flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="shop-verification-name" className="text-h2 text-text-primary m-0">
            {name}
          </h2>
          <StatusChip tone={status.tone} icon={TONE_ICON[status.tone]} label={status.label} />
        </div>
        {v.startedAt ? (
          <p className="text-caption text-text-muted m-0">Taking jobs since {formatDate(v.startedAt)}</p>
        ) : null}
        <dl className="m-0 grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-4">
          <Fact
            label="Days left"
            value={staffDaysLine(v)}
            hint={
              v.verified || !v.deadlineAt
                ? null
                : v.daysLeft <= 0
                  ? `Ended ${formatDateTime(v.deadlineAt)}`
                  : `New orders pause ${formatDateTime(v.deadlineAt)}`
            }
          />
          <Fact
            label="Paid before verification"
            value={formatPhp(v.paidBeforeVerificationMinor)}
            hint={v.payoutCapMinor > 0 ? `Cap ${formatPhp(v.payoutCapMinor)}` : null}
          />
          <Fact
            label="Waiting on verification"
            value={formatPhp(v.heldMinor)}
            hint={v.heldMinor > 0 ? "Paid once verified" : null}
          />
          <Fact
            label="To recover"
            value={formatPhp(v.recoveryDueMinor)}
            hint={v.recoveryDueMinor > 0 ? "From its next payouts" : null}
          />
        </dl>
        {!v.verified && v.payoutCapMinor > 0 ? (
          <Progress value={capPercent} aria-label={`${capPercent}% of the payout cap paid out`} className="pt-1" />
        ) : null}
        {!v.verified ? (
          <p className="text-caption text-text-secondary m-0">
            {v.paidOpenRegularJobs === 1
              ? "1 regular job with a paid stage open."
              : `${v.paidOpenRegularJobs} regular jobs with a paid stage open.`}{" "}
            {v.newOrdersPaused ? "New orders are paused; open jobs still finish." : "New orders are coming."}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="papers-heading" className="flex flex-col gap-2">
        <h3 id="papers-heading" className="text-h3 text-text-primary m-0">
          Papers
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {VERIFICATION_PAPERS.map((definition) => (
            <PaperPlate
              key={definition.paper}
              label={STAFF_PAPER_LABEL[definition.paper]}
              icon={PAPER_ICON[definition.paper]}
              file={onFile[definition.paper] ?? null}
            />
          ))}
        </div>
        {others.length ? (
          <>
            <p className="text-caption text-text-muted m-0">Also on file from the older accreditation</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {others.map((file) => (
                <PaperPlate
                  key={file.fileId}
                  label={file.sampleWork ? "Photo of work" : "Other paper"}
                  icon={FileText}
                  file={file}
                />
              ))}
            </div>
          </>
        ) : null}
      </section>

      {ledger.length ? (
        <section aria-labelledby="ledger-heading" className="gg-card flex flex-col p-4">
          <h3 id="ledger-heading" className="text-h3 text-text-primary m-0 pb-2">
            Payout history while unverified
          </h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {ledger.map(({ entry: item, line }) => (
              <li
                key={item.id}
                className="border-outline-subtle flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t py-2 first:border-t-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-body text-text-primary">{line}</span>
                  <span className="text-caption text-text-muted">
                    {item.at ? formatDateTime(item.at) : "Time not recorded"}
                    {item.orderId ? (
                      <>
                        {" · "}
                        <Link href={`${base}/orders/${encodeURIComponent(item.orderId)}`} className="underline">
                          Open the order
                        </Link>
                      </>
                    ) : null}
                  </span>
                </span>
                {item.amountMinor > 0 ? (
                  <span className="text-body text-text-primary tabular-nums">{formatPhp(item.amountMinor)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {decided && !pending ? <DecisionRecord approval={approval} /> : null}

      {pending ? (
        canDecide && approval ? (
          <DecisionBox entry={entry} approval={approval} name={name} onDecided={onDecided} />
        ) : canDecide ? (
          <p className="text-body text-text-secondary m-0" role="status">
            The approval record did not load, so a decision cannot be sent. Reload the page to try again.
          </p>
        ) : (
          <p className="text-body text-text-secondary m-0">
            Super Admin approves or rejects this shop. Approving pays out what is waiting, through
            the payout desk as usual.
          </p>
        )
      ) : null}
    </article>
  );
}

/**
 * One paper. The signed link is asked for only while the plate is on screen,
 * held in memory, and never written anywhere; the browser opens the file
 * straight from storage without a referrer.
 */
function PaperPlate({
  label,
  icon: Icon,
  file,
}: {
  label: string;
  icon: LucideIcon;
  file: VerificationFile | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const image = file ? isImageFile(file) : false;

  useEffect(() => {
    if (!file) return;
    let live = true;
    setUrl(null);
    setFailed(false);
    getFileDownloadUrl(file.fileId)
      .then((next) => {
        if (live) setUrl(next);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [file]);

  return (
    <figure className="gg-card m-0 flex flex-col gap-2 p-3" data-testid="paper-plate">
      <div className="bg-surface-variant flex h-40 items-center justify-center overflow-hidden rounded-field md:h-auto md:aspect-[4/3]">
        {!file ? (
          <span className="text-caption text-text-muted flex flex-col items-center gap-1">
            <Icon className="size-6" strokeWidth={1.5} aria-hidden />
            Not sent yet
          </span>
        ) : failed ? (
          <span className="text-caption text-text-secondary p-2 text-center">Could not open this file.</span>
        ) : !url ? (
          <span className="text-caption text-text-muted">Opening…</span>
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, never optimised or cached by Next
          <img src={url} alt={label} referrerPolicy="no-referrer" className="size-full object-contain" />
        ) : (
          <span className="text-caption text-text-muted flex flex-col items-center gap-1">
            <FileText className="size-6" strokeWidth={1.5} aria-hidden />
            PDF
          </span>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
            {label}
          </span>
          <span className="text-caption text-text-muted">
            {file ? (file.sentAt ? `Sent ${formatDateTime(file.sentAt)}` : "Sent") : "The shop has not sent it"}
          </span>
        </span>
        {file && url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            referrerPolicy="no-referrer"
            className="text-body text-text-primary flex min-h-11 items-center underline"
            aria-label={`Open ${label} full size`}
          >
            Open
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}

const DECISION_WORD: Record<string, string> = {
  approved: "Verified",
  rejected: "Rejected",
  suspended: "Suspended",
  pending: "Back to waiting",
};

/** Who decided, from the approval case's own record (Super Admin's read). */
function DecisionRecord({ approval }: { approval: ApprovalCaseDetail | null }) {
  if (!approval) return null;
  const c = approval.approvalCase;
  const history = [...approval.history].reverse().slice(0, 5);
  return (
    <section aria-labelledby="decision-heading" className="gg-card flex flex-col gap-2 p-4">
      <h3 id="decision-heading" className="text-h3 text-text-primary m-0">
        Decision
      </h3>
      <p className="text-body text-text-primary m-0">
        {DECISION_WORD[c.status] ?? c.status}
        {c.decidedByName ? ` by ${c.decidedByName}` : ""}
        {c.decidedAt ? `, ${formatDateTime(c.decidedAt)}` : ""}
      </p>
      {c.rejectionReason ? (
        <p className="text-body text-text-secondary m-0">Reason given to the shop: {c.rejectionReason}</p>
      ) : null}
      {history.length > 1 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {history.map((item) => (
            <li key={item.id} className="text-caption text-text-secondary">
              {formatDateTime(item.createdAt)}: {DECISION_WORD[item.toStatus] ?? item.toStatus}
              {item.actorUserId && item.actorUserId === c.decidedBy && c.decidedByName ? ` by ${c.decidedByName}` : ""}
              {item.reason ? `. ${item.reason}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

type Decision = "approve" | "reject";

function DecisionBox({
  entry,
  approval,
  name,
  onDecided,
}: {
  entry: VerificationQueueEntry;
  approval: ApprovalCaseDetail;
  name: string;
  onDecided: (message: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One request id per confirmation, so a retried press cannot decide twice.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const v = entry.verification;
  const reason = text.trim();

  async function decide() {
    if (!confirm) return;
    if (confirm === "reject" && !reason) {
      setError("Write the reason. The shop reads it word for word.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await decideApprovalCase(approval.approvalCase.id, confirm, {
        expectedVersion: approval.approvalCase.version,
        requestId,
        ...(confirm === "approve" ? { note: reason || undefined } : { reason }),
      });
      setConfirm(null);
      await onDecided(
        confirm === "approve"
          ? `${name} is verified. What was waiting is ready to pay on the payout desk.`
          : `${name} was rejected. The shop reads your reason.`,
      );
    } catch (err) {
      setError(
        isApiError(err) && err.status === 409
          ? "Someone else changed this shop's record. Reload to see the latest, then decide again."
          : opsErrorMessage(err, "The decision was not saved. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="decide-heading" className="gg-card flex flex-col gap-3 p-4">
      <h3 id="decide-heading" className="text-h3 text-text-primary m-0">
        Decide
      </h3>
      <Field>
        <FieldLabel htmlFor="verification-reason">Note or reason</FieldLabel>
        <Textarea
          id="verification-reason"
          value={text}
          maxLength={2000}
          onChange={(event) => setText(event.target.value)}
          placeholder="Optional when approving. Needed to reject."
        />
        <FieldDescription>
          A rejection reason goes to the shop word for word. Your name and the time are recorded with the decision.
        </FieldDescription>
      </Field>
      {error && !confirm ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => {
            setRequestId(crypto.randomUUID());
            setConfirm("approve");
          }}
        >
          Approve
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (!reason) {
              setError("Write the reason first. The shop reads it word for word.");
              return;
            }
            setError(null);
            setRequestId(crypto.randomUUID());
            setConfirm("reject");
          }}
        >
          Reject
        </Button>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => (open ? null : setConfirm(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "approve" ? `Verify ${name}?` : `Reject ${name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "approve"
                ? [
                    "The shop gets the Verified badge, its payouts have no cap, and new orders keep coming.",
                    v.heldMinor > 0
                      ? `${formatPhp(v.heldMinor)} waiting on verification becomes ready to pay on the payout desk; nothing is sent by this.`
                      : null,
                    v.recoveryDueMinor > 0
                      ? `${formatPhp(v.recoveryDueMinor)} to recover stays and comes out of its next payouts.`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ")
                : `The shop is told: “${reason}”. It stops getting new orders.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "reject" ? "danger" : "primary"}
              disabled={busy}
              onClick={() => void decide()}
            >
              {busy ? "Saving…" : confirm === "approve" ? "Verify shop" : "Reject shop"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
