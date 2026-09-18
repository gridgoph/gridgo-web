"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

/**
 * Catalogue-line verification. Operations and Super Admin mount the same
 * queue so an inbox service-review slip opens a screen that account can use.
 */

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";

import { presentServiceState, presentVerification } from "@/app/admin/_lib/present";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import {
  ApplicantHeader,
  SupplierCategoryRanks,
} from "@/components/approvals/applicant-identity";
import {
  isMakeAllLiveEligible,
  presentCategoryName,
  presentLineFacts,
  presentServiceLineSections,
  taxonomyNames,
  type ShopServiceBlock,
} from "@/components/approvals/service-lines-groups";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  listSupplierServices,
  listUsers,
  getTaxonomy,
  suspendSupplierService,
  verifySupplierService,
} from "@/lib/api/client";
import type { SupplierService, Taxonomy, User } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const UNAPPROVED_ACCOUNT_COPY =
  "Approve the account first — a line cannot go live under a pending account.";

type ConfirmService =
  | { kind: "verify"; service: SupplierService }
  | { kind: "suspend"; service: SupplierService }
  | { kind: "verify-all"; services: SupplierService[]; shopName: string };

type Loaded = {
  services: SupplierService[];
  suppliers: User[];
  taxonomy: Taxonomy;
};

export function ServiceLines() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmService | null>(null);
  const [reason, setReason] = useState("");

  const signupsHref = useMemo(() => {
    const next = new URLSearchParams(search.toString());
    next.set("tab", "signups");
    const q = next.toString();
    return q ? `${pathname}?${q}` : `${pathname}?tab=signups`;
  }, [pathname, search]);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [services, suppliers, taxonomy] = await Promise.all([
          listSupplierServices(),
          listUsers("supplier"),
          getTaxonomy(),
        ]);
        setData({ services, suppliers, taxonomy });
      } catch (err) {
        setData(null);
        setError(
          opsErrorMessage(
            err,
            "Could not load supplier service lines. Confirm the demo API is running.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload(["approvals", "services", "identity"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const names = useMemo(() => taxonomyNames(data?.taxonomy), [data]);
  const sections = useMemo(
    () =>
      presentServiceLineSections(
        data?.services ?? [],
        data?.suppliers ?? [],
        query,
        names,
      ),
    [data, query, names],
  );

  async function apply() {
    if (!confirm) return;
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      if (confirm.kind === "suspend") {
        if (!reason.trim()) {
          setActionError("A suspension reason is required.");
          setBusy(false);
          return;
        }
        await suspendSupplierService(confirm.service.id, {
          reason: reason.trim(),
        });
        setActionOk(
          "Service suspended. It will not be matched to new work; orders already assigned carry on.",
        );
      } else if (confirm.kind === "verify-all") {
        const failed: string[] = [];
        const note = reason.trim() || undefined;
        for (const line of confirm.services) {
          try {
            await verifySupplierService(line.id, { reason: note });
          } catch {
            failed.push(presentCategoryName(line.categoryCode, names.categories));
          }
        }
        if (failed.length === 0) {
          setActionOk(
            `All ${confirm.services.length} lines for ${confirm.shopName} are live.`,
          );
        } else {
          setActionError(
            failed.length === confirm.services.length
              ? `Could not make these lines live: ${failed.join(", ")}.`
              : `Could not make live: ${failed.join(", ")}.`,
          );
          if (failed.length < confirm.services.length) {
            setActionOk(
              `${confirm.services.length - failed.length} of ${confirm.services.length} lines for ${confirm.shopName} are live.`,
            );
          }
        }
      } else {
        await verifySupplierService(confirm.service.id, {
          reason: reason.trim() || undefined,
        });
        setActionOk("Service is live and can be matched to new orders.");
      }
      setConfirm(null);
      setReason("");
      await load();
    } catch (err) {
      setActionError(opsErrorMessage(err, "Could not update the supplier service."));
    } finally {
      setBusy(false);
    }
  }

  const pending = loading && !data;

  if (!pending && (error || !data)) {
    return (
      <ErrorState
        body={error ?? "No data."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const hasAnyLines = (data?.services.length ?? 0) > 0;
  const hasVisibleShops =
    sections.waiting.length + sections.live.length + sections.suspended.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Catalogue lines declared by suppliers. Verifying one makes it live for matching
          — the supplier&rsquo;s account must be approved as well. Suspending a live line
          removes it from new matching only; jobs already assigned keep running.
        </p>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {actionOk ? (
        <p className="text-body text-success m-0" role="status">
          {actionOk}
        </p>
      ) : null}
      {actionError && !confirm ? (
        <p className="text-body text-error m-0" role="alert">
          {actionError}
        </p>
      ) : null}

      {pending ? (
        <SkeletonCards count={2} lines={3} label="Loading service lines" />
      ) : !hasAnyLines ? (
        <EmptyState
          title="No service lines"
          body="Lines appear when a supplier declares what it can make. Approve their account first so they can submit one."
        />
      ) : (
        <>
          <div className="relative w-full sm:max-w-xs">
            <label className="sr-only" htmlFor="service-lines-filter">
              Filter shops and service lines
            </label>
            <Search
              aria-hidden
              className="text-text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              id="service-lines-filter"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by shop, category, or zone"
              autoComplete="off"
              className="pl-9"
            />
          </div>

          {!hasVisibleShops ? (
            <p className="text-body text-text-secondary m-0">No shops match that filter.</p>
          ) : (
            <>
              <ShopSection
                id="service-waiting"
                title="Waiting for a decision"
                count={sections.waiting.length}
                defaultOpen
              >
                {sections.waiting.map((block) => (
                  <ShopBlock
                    key={block.supplierId}
                    block={block}
                    names={names}
                    signupsHref={signupsHref}
                    onConfirm={setConfirm}
                    onClearFeedback={() => {
                      setActionError(null);
                      setReason("");
                    }}
                  />
                ))}
              </ShopSection>
              <ShopSection
                id="service-live"
                title="Live"
                count={sections.live.length}
              >
                {sections.live.map((block) => (
                  <ShopBlock
                    key={block.supplierId}
                    block={block}
                    names={names}
                    signupsHref={signupsHref}
                    onConfirm={setConfirm}
                    onClearFeedback={() => {
                      setActionError(null);
                      setReason("");
                    }}
                  />
                ))}
              </ShopSection>
              <ShopSection
                id="service-suspended"
                title="Suspended and withdrawn"
                count={sections.suspended.length}
              >
                {sections.suspended.map((block) => (
                  <ShopBlock
                    key={block.supplierId}
                    block={block}
                    names={names}
                    signupsHref={signupsHref}
                    onConfirm={setConfirm}
                    onClearFeedback={() => {
                      setActionError(null);
                      setReason("");
                    }}
                  />
                ))}
              </ShopSection>
            </>
          )}
        </>
      )}

      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
            setReason("");
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "suspend"
                ? "Suspend this service line?"
                : confirm?.kind === "verify-all"
                  ? `Make all ${confirm.services.length} live?`
                  : "Make this service live?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "suspend"
                ? "Suspension removes this line from new matching only. Orders already assigned to this supplier are not cancelled or rewound. A reason is required and audited."
                : confirm?.kind === "verify-all"
                  ? `Verification makes every waiting line for ${confirm.shopName} eligible for new matching. One optional reason is stored against each line.`
                  : "Verification makes this line eligible for new matching. The supplier still needs an approved account before any work reaches them."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="svc-reason">
                {confirm?.kind === "suspend" ? "Reason (required)" : "Reason (optional)"}
              </FieldLabel>
              <Textarea
                id="svc-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required={confirm?.kind === "suspend"}
              />
            </Field>
          </FieldGroup>
          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setConfirm(null);
                setReason("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === "suspend" ? "danger" : "secondary"}
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy
                ? "Saving…"
                : confirm?.kind === "suspend"
                  ? "Suspend service"
                  : confirm?.kind === "verify-all"
                    ? "Make all live"
                    : "Make live"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ShopSection({
  id,
  title,
  count,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  const headingId = `${id}-heading`;
  const panelId = `${id}-panel`;
  const label = `${title} (${count})`;
  const expanded = defaultOpen || open;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      {defaultOpen ? (
        <h2 id={headingId} className="text-h3 text-text-primary m-0">
          {label}
        </h2>
      ) : (
        <h2 id={headingId} className="m-0">
          <button
            type="button"
            className="text-h3 text-text-primary inline-flex min-h-11 items-center gap-2 text-left"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronRight
              aria-hidden
              className={open ? "size-4 rotate-90" : "size-4"}
            />
            {label}
          </button>
        </h2>
      )}
      <ul
        id={defaultOpen ? undefined : panelId}
        className={cn(
          "m-0 list-none flex-col gap-3 p-0",
          expanded ? "flex" : "hidden",
        )}
      >
        {children}
      </ul>
    </section>
  );
}

function ShopBlock({
  block,
  names,
  signupsHref,
  onConfirm,
  onClearFeedback,
}: {
  block: ShopServiceBlock;
  names: ReturnType<typeof taxonomyNames>;
  signupsHref: string;
  onConfirm: (confirm: ConfirmService) => void;
  onClearFeedback: () => void;
}) {
  const status = presentVerification(block.verificationStatus);
  const caption = block.detailsUnavailable
    ? "Shop details unavailable"
    : [block.contactName, block.phone, block.shopAddress].filter(Boolean).join(" · ");
  const noteId = `unapproved-${block.supplierId}`;
  const unapproved = !block.accountApproved;
  const showMakeAll = block.pendingLines.length >= 2;
  const makeAllEnabled = isMakeAllLiveEligible(block);

  return (
    <li className="gg-card flex flex-col gap-3">
      <ApplicantHeader title={block.shopName} caption={caption} status={status} />

      {!block.detailsUnavailable ? (
        <SupplierCategoryRanks
          ranks={block.supplier?.categoryRanks}
          categoryNames={names.categories}
          empty={
            <p className="text-body text-text-secondary m-0 mt-1">
              They ranked no categories at sign-up, so matching has nothing to go on.
            </p>
          }
        />
      ) : null}

      {unapproved ? (
        <p id={noteId} className="text-body text-text-secondary m-0">
          {UNAPPROVED_ACCOUNT_COPY}{" "}
          <Link
            href={signupsHref}
            className="text-[var(--color-brand)] underline underline-offset-4"
          >
            Sign-ups
          </Link>
        </p>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-3 border-t border-outline-subtle p-0 pt-3">
        {block.lines.map((line) => {
          const presented = presentServiceState(line.state);
          const facts = presentLineFacts(line, names);
          return (
            <li
              key={line.id}
              className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className="text-body text-text-primary m-0"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {presentCategoryName(line.categoryCode, names.categories)}
                  </p>
                  <StatusChip
                    tone={presented.tone}
                    label={presented.label}
                    icon={presented.icon}
                  />
                </div>
                {facts.length ? (
                  <p className="text-caption text-text-muted m-0 mt-0.5">
                    {facts.join(" · ")}
                  </p>
                ) : null}
                {line.equipmentNotes ? (
                  <p className="text-caption text-text-secondary m-0 mt-0.5">
                    {line.equipmentNotes}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {line.state === "pending_verification" || line.state === "draft" ? (
                  <LineAction
                    label="Make live"
                    disabled={unapproved}
                    describedBy={unapproved ? noteId : undefined}
                    onClick={() => {
                      onClearFeedback();
                      onConfirm({ kind: "verify", service: line });
                    }}
                  />
                ) : null}
                {line.state === "live" ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      onClearFeedback();
                      onConfirm({ kind: "suspend", service: line });
                    }}
                  >
                    Suspend
                  </Button>
                ) : null}
                {line.state === "suspended" ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onClearFeedback();
                      onConfirm({ kind: "verify", service: line });
                    }}
                  >
                    Restore
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {showMakeAll ? (
        <div className="flex flex-wrap border-t border-outline-subtle pt-3">
          <LineAction
            label={`Make all ${block.pendingLines.length} live`}
            disabled={!makeAllEnabled}
            describedBy={unapproved ? noteId : undefined}
            onClick={() => {
              onClearFeedback();
              onConfirm({
                kind: "verify-all",
                services: block.pendingLines,
                shopName: block.shopName,
              });
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

function LineAction({
  label,
  disabled,
  describedBy,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  describedBy?: string;
  onClick: () => void;
}) {
  const button = (
    <Button
      variant="secondary"
      disabled={disabled}
      aria-describedby={describedBy}
      onClick={onClick}
    >
      {label}
    </Button>
  );
  if (!disabled) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        {button}
      </TooltipTrigger>
      <TooltipContent>{UNAPPROVED_ACCOUNT_COPY}</TooltipContent>
    </Tooltip>
  );
}
