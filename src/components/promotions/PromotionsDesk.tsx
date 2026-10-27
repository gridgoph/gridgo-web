"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { BudgetMeter, FoundingSeats } from "@/components/promotions/PromotionGauges";
import { ClaimsTable, InvitesTable } from "@/components/promotions/PromotionTables";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getAdminPromotions,
  updateAdminPromotions,
  type AdminPromotions,
} from "@/lib/api/promotions";
import { formatPhp } from "@/lib/format";
import {
  CONFLICT_COPY,
  NEW_CLAIMS_ONLY,
  auditReason,
  capReached,
  checkDraft,
  draftFromSettings,
  fixFieldsText,
  foundingState,
  friendPassState,
  isVersionConflict,
  nextBoundary,
  presentPromotionState,
  promotionsErrorText,
  serverNow,
  upgradeHistory,
  type DraftField,
  type PromotionDraft,
} from "@/lib/promotions";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { formatManila } from "@/lib/vouchers";

type DeskTab = "claims" | "invites";

function deskTab(value: string | null): DeskTab {
  return value === "invites" ? "invites" : "claims";
}

const DATE_FIELDS: DraftField[] = ["foundingStarts", "foundingEnds", "friendUpgrade"];

/** Claims carry no live ping of their own, so a visible desk re-reads this often. */
const REFRESH_POLL_MS = 60_000;
const CLOCK_TICK_MS = 60_000;
/** setTimeout's ceiling; a boundary further out is re-armed on the next tick. */
const MAX_TIMER_MS = 2_147_483_647;

const TIME_ONLY = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });

/**
 * The launch promotions (27 Oct sprint): the Founding 30, the Friend Pass,
 * their shared budget cap and the ₱15 rewards. Super Admin edits every figure
 * and saves once, through the `expectedVersion` handshake; Operations reads
 * the same page without the form. Changes apply to new claims only.
 * The tables' tab lives in the URL (`?tab=invites`).
 */
export function PromotionsDesk({ tree }: { tree: "ops" | "admin" }) {
  const canEdit = tree === "admin";
  const router = useRouter();
  const search = useSearchParams();
  const tab = deskTab(search.get("tab"));

  /** The latest read: counts, tables and status always come from here. */
  const [data, setData] = useState<AdminPromotions | null>(null);
  /** This browser's clock when `data` arrived, to move `serverTime` on. */
  const [readAt, setReadAt] = useState(0);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  /**
   * The settings and version an edit started from. A refresh never rebases an
   * edit onto someone else's values: it keeps this, and the save is refused.
   */
  const [origin, setOrigin] = useState<Pick<AdminPromotions, "settings" | "version"> | null>(null);
  const [edits, setEdits] = useState<Partial<PromotionDraft>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const hasData = useRef(false);
  /** The installed settings version; a read never takes the screen back past it. */
  const installedVersion = useRef(-1);
  /**
   * Moves when a save or a conflict reload starts and when it ends. A
   * background read that began under another value may have been answered
   * before that write, so its result is dropped rather than installed.
   */
  const epoch = useRef(0);

  const install = useCallback((next: AdminPromotions) => {
    if (next.version < installedVersion.current) return;
    installedVersion.current = next.version;
    hasData.current = true;
    setData(next);
    setReadAt(Date.now());
    setTick(Date.now());
    setLoadError(null);
    setRefreshError(null);
  }, []);

  const readOnce = useCallback(async () => {
    const started = epoch.current;
    setRefreshing(true);
    try {
      const next = await getAdminPromotions();
      if (epoch.current === started) install(next);
    } catch (err) {
      if (epoch.current !== started) return;
      // A failed background read keeps the last figures and says how old they are.
      if (hasData.current) setRefreshError(promotionsErrorText(err, "Could not refresh."));
      else setLoadError(err);
    } finally {
      setRefreshing(false);
    }
  }, [install]);
  const refresh = useSerializedLoad(readOnce);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  // Claims, uses and the budget move with orders; settings with another admin.
  useLiveReload(["orders", "settings"], refresh);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      clearInterval(poll);
    };
  }, [refresh]);

  const now = data ? serverNow(data.serverTime, readAt, tick) : tick;
  const boundary = data ? nextBoundary(data.settings, now) : null;
  // The status words follow the clock: a minute tick, and a wake-up at the
  // next start, upgrade or end, which also re-reads the counts.
  useEffect(() => {
    const minute = setInterval(() => setTick(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(minute);
  }, []);
  useEffect(() => {
    if (boundary === null) return;
    const wait = Math.min(boundary - now + 1000, MAX_TIMER_MS);
    const timer = setTimeout(() => {
      setTick(Date.now());
      void refresh();
    }, Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [boundary, now, refresh]);

  const startSettings = origin?.settings ?? data?.settings ?? null;
  const base = useMemo(
    () => (startSettings ? draftFromSettings(startSettings) : null),
    [startSettings],
  );
  const draft = useMemo(() => (base ? { ...base, ...edits } : null), [base, edits]);
  const check = useMemo(
    () =>
      startSettings && draft ? checkDraft(draft, startSettings, data?.budget.committedMinor) : null,
    [startSettings, draft, data?.budget.committedMinor],
  );

  const edited = useCallback(
    (field: DraftField) => base !== null && field in edits && edits[field] !== base[field],
    [base, edits],
  );
  const datesEdited = DATE_FIELDS.some(edited);
  /** Errors show on what was typed; date order shows once any date moves. */
  const visibleError = (field: DraftField): string | undefined =>
    edited(field) || (datesEdited && DATE_FIELDS.includes(field)) ? check?.errors[field] : undefined;
  const invalid = (Object.keys(check?.errors ?? {}) as DraftField[]).filter((field) =>
    Boolean(visibleError(field)),
  );
  const blocking = invalid.length > 0;
  const changes = check?.changes ?? [];
  const dirty = changes.length > 0;
  const pending = dirty || blocking;
  /** Someone else saved after this edit began; saving will be refused. */
  const overtaken = origin !== null && data !== null && data.version !== origin.version;

  function edit<K extends DraftField>(field: K, value: PromotionDraft[K]) {
    setSaveError(null);
    setSaved(null);
    const next = { ...edits, [field]: value };
    // Typed back to where it started: the form follows the latest read again.
    if (!base || !(Object.keys(next) as DraftField[]).some((key) => next[key] !== base[key])) {
      setEdits({});
      setOrigin(null);
      return;
    }
    if (!origin && data) setOrigin({ settings: data.settings, version: data.version });
    setEdits(next);
  }

  function clearEdit() {
    setEdits({});
    setOrigin(null);
    setSaveError(null);
  }

  async function save() {
    if (!data || !check || !dirty || blocking || saving || conflict) return;
    const version = origin?.version ?? data.version;
    epoch.current += 1;
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      install(await updateAdminPromotions(check.patch, version, auditReason(changes)));
      clearEdit();
      setSaved(
        changes.length === 1
          ? "Saved 1 change. New claims use it from now on."
          : `Saved ${changes.length} changes. New claims use them from now on.`,
      );
    } catch (err) {
      if (isVersionConflict(err)) setConflict(true);
      else setSaveError(promotionsErrorText(err, "Could not save. Try again."));
    } finally {
      epoch.current += 1;
      setSaving(false);
    }
  }

  /** The lock and the stale edit stay until a read succeeds. */
  async function reloadAfterConflict() {
    if (reloading) return;
    epoch.current += 1;
    setReloading(true);
    setReloadError(null);
    try {
      install(await getAdminPromotions());
      clearEdit();
      setConflict(false);
      setSaved(null);
    } catch (err) {
      setReloadError(promotionsErrorText(err, "Could not reload. Try again."));
    } finally {
      epoch.current += 1;
      setReloading(false);
    }
  }

  function discard() {
    clearEdit();
    setSaved(null);
  }

  const goTab = useCallback(
    (next: DeskTab) => {
      router.replace(
        next === "claims" ? `/${tree}/promotions` : `/${tree}/promotions?tab=${next}`,
        { scroll: false },
      );
    },
    [router, tree],
  );

  if (!data || !draft) {
    if (!loadError)
      return <SkeletonCards count={4} lines={3} label="Loading promotions" className="gap-3" />;
    return (
      <ErrorState
        title="Promotions could not be loaded"
        body={promotionsErrorText(loadError, "Try again in a moment.")}
        action={
          <Button variant="outline" disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? "Trying again…" : "Try again"}
          </Button>
        }
      />
    );
  }

  const founding = presentPromotionState(foundingState(data, now));
  const friendState = friendPassState(data, now);
  const friend = presentPromotionState(friendState, "All passes given");
  const locked = saving || conflict;
  const upgrades = upgradeHistory(data.friendPass.invites);
  const friendSwitchedOff = !data.settings.founding.enabled || !data.settings.friendPass.enabled;
  const waitingFriends = data.friendPass.invites.filter((invite) => invite.status === "invited").length;

  const input = (props: {
    field: Exclude<DraftField, "foundingEnabled" | "friendEnabled">;
    label: string;
    help?: ReactNode;
    kind?: "money" | "count" | "time";
    read: string;
  }) => {
    const { field, label, help, kind = "money", read } = props;
    const error = visibleError(field);
    const id = `promo-${field}`;
    return (
      <Field data-invalid={error ? true : undefined} data-disabled={locked || undefined}>
        <FieldLabel htmlFor={canEdit ? id : undefined}>{label}</FieldLabel>
        {canEdit ? (
          <Input
            id={id}
            type={kind === "time" ? "datetime-local" : "text"}
            inputMode={kind === "money" ? "decimal" : kind === "count" ? "numeric" : undefined}
            value={draft[field]}
            disabled={locked}
            aria-invalid={error ? true : undefined}
            aria-describedby={help ? `${id}-help` : undefined}
            className={kind === "time" ? "max-w-xs" : "max-w-40 tabular-nums"}
            onChange={(event) => edit(field, event.target.value)}
          />
        ) : (
          <p className="text-body text-text-primary m-0 tabular-nums">{read}</p>
        )}
        {help ? <FieldDescription id={`${id}-help`}>{help}</FieldDescription> : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
    );
  };

  const toggle = (field: "foundingEnabled" | "friendEnabled", label: string, help: string) => {
    const id = `promo-${field}`;
    return (
      <Field orientation="horizontal" data-disabled={locked || undefined}>
        {canEdit ? (
          <Switch
            id={id}
            aria-describedby={`${id}-help`}
            checked={draft[field]}
            disabled={locked}
            onCheckedChange={(value) => edit(field, value)}
          />
        ) : null}
        <div className="flex flex-col gap-0.5">
          <FieldLabel htmlFor={canEdit ? id : undefined}>
            {canEdit ? `Run the ${label}` : `${label}: ${draft[field] ? "turned on" : "turned off"}`}
          </FieldLabel>
          <FieldDescription id={`${id}-help`}>{help}</FieldDescription>
        </div>
      </Field>
    );
  };

  return (
    <div className="flex flex-col gap-3 pb-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Launch vouchers GRIDGO pays for, taken off the whole order as one discount: the Founding
          30 for the first clients to claim, and a Friend Pass for one friend of each Founder. One
          discount per person, never both. Both stop at the budget cap.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-caption text-text-muted m-0" aria-live="polite">
            {refreshError ? null : `Updated ${TIME_ONLY.format(readAt)}`}
          </p>
          <Button variant="outline" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw size={16} aria-hidden className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>
      {refreshError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not refresh</AlertTitle>
          <AlertDescription>
            {refreshError} These figures are from {TIME_ONLY.format(readAt)}. Refresh to try
            again.
          </AlertDescription>
        </Alert>
      ) : null}
      {canEdit ? null : (
        <Alert role="note">
          <AlertTitle>Read only</AlertTitle>
          <AlertDescription>
            Super Admin sets these amounts and dates. You can read the counts, claims and invites.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="gg-card flex flex-col gap-4" aria-labelledby="founding-heading">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="founding-heading" className="text-h3 text-text-primary m-0">
                Founding 30
              </h2>
              <p className="text-body text-text-secondary m-0 mt-0.5">
                <span className="text-text-primary tabular-nums">{data.founding.available}</span> of{" "}
                <span className="tabular-nums">{data.founding.slots}</span> left to claim
              </p>
            </div>
            <StatusChip {...founding} />
          </header>
          <FoundingSeats founding={data.founding} />
          {data.founding.expiredUnused ? (
            <p className="text-caption text-text-secondary m-0">
              {data.founding.expiredUnused === 1
                ? "1 claim expired unused; its slot went back to the pool."
                : `${data.founding.expiredUnused} claims expired unused; their slots went back to the pool.`}
            </p>
          ) : null}
          <FieldGroup className="border-outline border-t pt-4">
            {input({
              field: "foundingAmount",
              label: "Amount (pesos)",
              read: formatPhp(data.settings.founding.amountMinor),
              help: NEW_CLAIMS_ONLY,
            })}
            {input({
              field: "foundingSlots",
              label: "Slots",
              kind: "count",
              read: String(data.settings.founding.slots),
              help:
                data.founding.claimed > 0
                  ? `${data.founding.claimed} already claimed. Fewer slots than that stops new claims; nobody loses theirs.`
                  : undefined,
            })}
            <div className="grid gap-4 md:grid-cols-2">
              {input({
                field: "foundingStarts",
                label: "Starts (Philippine time)",
                kind: "time",
                read: formatManila(data.settings.founding.startsAt),
              })}
              {input({
                field: "foundingEnds",
                label: "Ends (Philippine time)",
                kind: "time",
                read: formatManila(data.settings.founding.endsAt),
                help: "New claims, Friend Passes included, expire at this time. Vouchers already claimed keep the expiry they were claimed with.",
              })}
            </div>
            {toggle(
              "foundingEnabled",
              "Founding 30",
              "Off hides the claim prompt from clients and stops the Friend Pass too. Vouchers already claimed still work.",
            )}
          </FieldGroup>
        </section>

        <section className="gg-card flex flex-col gap-4" aria-labelledby="friend-heading">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="friend-heading" className="text-h3 text-text-primary m-0">
                Friend Pass
              </h2>
              <p className="text-body text-text-secondary m-0 mt-0.5">
                <span className="text-text-primary tabular-nums">{data.friendPass.issued}</span> of{" "}
                <span className="tabular-nums">{data.friendPass.total}</span> passes claimed
                {waitingFriends
                  ? `, ${waitingFriends} ${waitingFriends === 1 ? "friend" : "friends"} yet to claim`
                  : ""}
              </p>
            </div>
            <StatusChip {...friend} />
          </header>
          {friendState === "off_with_founding" ? (
            <p className="text-body text-text-secondary m-0">
              The Founding 30 is off, so Friend Pass invites, claims and upgrades are off too. They
              reopen when the Founding 30 is turned back on.
            </p>
          ) : null}
          <p className="text-body text-text-secondary m-0">
            From {formatManila(data.settings.friendPass.upgradeAt)}, unused Friend Passes upgrade to{" "}
            {formatPhp(data.settings.founding.amountMinor)} while Founding slots and the budget
            allow, earliest claim first.{" "}
            {friendSwitchedOff
              ? "Upgrades wait while either promotion is off."
              : upgrades.count
                ? `${upgrades.count} ${upgrades.count === 1 ? "pass" : "passes"} upgraded so far, the last on ${formatManila(upgrades.lastAt)}.`
                : "No pass has been upgraded yet."}
          </p>
          <FieldGroup className="border-outline border-t pt-4">
            {input({
              field: "friendAmount",
              label: "Amount (pesos)",
              read: formatPhp(data.settings.friendPass.amountMinor),
              help: NEW_CLAIMS_ONLY,
            })}
            <div className="grid gap-4 md:grid-cols-2">
              {input({
                field: "friendPerFounder",
                label: "Friends per Founder",
                kind: "count",
                read: String(data.settings.friendPass.perFounder),
              })}
              {input({
                field: "friendTotal",
                label: "Passes in total",
                kind: "count",
                read: String(data.settings.friendPass.total),
              })}
            </div>
            {input({
              field: "friendUpgrade",
              label: "Upgrade on (Philippine time)",
              kind: "time",
              read: formatManila(data.settings.friendPass.upgradeAt),
              help: "Between the Founding start and end. From this time, unused passes can upgrade to the Founding amount.",
            })}
            {toggle(
              "friendEnabled",
              "Friend Pass",
              "Off stops new invites, claims and upgrades. Passes already claimed still work. Also off whenever the Founding 30 is off.",
            )}
          </FieldGroup>
        </section>

        <section className="gg-card flex flex-col gap-4" aria-labelledby="budget-heading">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <h2 id="budget-heading" className="text-h3 text-text-primary m-0">
              Budget cap
            </h2>
            {capReached(data) ? (
              <StatusChip tone="error" icon="triangle-alert" label="Cap reached" />
            ) : null}
          </header>
          <BudgetMeter budget={data.budget} />
          <FieldGroup className="border-outline border-t pt-4">
            {input({
              field: "budgetCap",
              label: "Cap (pesos)",
              read: formatPhp(data.settings.budgetCapMinor),
              help: "A hard stop. Every live Founding and Friend Pass voucher counts at face value, upgrades included; used ones stay counted. Nothing new is given past the cap, and it cannot go below what is committed. ₱0 gives nothing new.",
            })}
          </FieldGroup>
        </section>

        <section className="gg-card flex flex-col gap-4" aria-labelledby="rewards-heading">
          <header>
            <h2 id="rewards-heading" className="text-h3 text-text-primary m-0">
              Rewards
            </h2>
            <p className="text-body text-text-secondary m-0 mt-0.5 max-w-prose">
              GRIDGO vouchers clients still earn alongside the launch promotions, in pesos.{" "}
              {NEW_CLAIMS_ONLY}
            </p>
          </header>
          <FieldGroup>
            <div className="grid items-end gap-4 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {input({
                field: "survey",
                label: "Order survey",
                read: formatPhp(data.settings.rewards.surveyMinor),
              })}
              {input({
                field: "mission",
                label: "Founding Tester reward",
                read: formatPhp(data.settings.rewards.missionMinor),
              })}
              {input({
                field: "invite",
                label: "Invite, each side",
                read: formatPhp(data.settings.rewards.inviteMinor),
              })}
            </div>
            <FieldDescription>
              The Founding Tester reward is one voucher for finishing all five steps; a client who
              already earned a survey voucher keeps that one instead. An invite pays both people, so
              each one costs {formatPhp(data.settings.rewards.inviteMinor * 2)}.
            </FieldDescription>
          </FieldGroup>
        </section>
      </div>

      <Tabs value={tab} onValueChange={(value) => goTab(deskTab(String(value)))} className="mt-2">
        <TabsList>
          <TabsTrigger value="claims">Founding claims ({data.founding.claims.length})</TabsTrigger>
          <TabsTrigger value="invites">Friend Pass invites ({data.friendPass.invites.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="claims" className="mt-4">
          {tab === "claims" ? <ClaimsTable claims={data.founding.claims} tree={tree} /> : null}
        </TabsContent>
        <TabsContent value="invites" className="mt-4">
          {tab === "invites" ? <InvitesTable invites={data.friendPass.invites} /> : null}
        </TabsContent>
      </Tabs>

      {canEdit && (pending || conflict || saveError || saved) ? (
        <div
          className="gg-card border-text-primary sticky bottom-3 z-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
          aria-live="polite"
        >
          {conflict ? (
            <>
              <div className="flex flex-col gap-0.5">
                <p className="text-body text-text-primary m-0" role="alert">
                  {CONFLICT_COPY}
                </p>
                <p className="text-caption text-text-muted m-0">Your edits were not saved.</p>
                {reloadError ? (
                  <p className="text-caption text-error m-0" role="alert">
                    {reloadError}
                  </p>
                ) : null}
              </div>
              <Button
                variant="primary"
                disabled={reloading}
                onClick={() => void reloadAfterConflict()}
              >
                {reloading ? "Reloading…" : reloadError ? "Try reloading again" : "Reload promotions"}
              </Button>
            </>
          ) : pending ? (
            <>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-body text-text-primary m-0">
                  {changes.length === 1 ? "1 unsaved change" : `${changes.length} unsaved changes`}
                </p>
                <ul className="text-caption text-text-secondary m-0 list-none p-0">
                  {changes.slice(0, 4).map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                  {changes.length > 4 ? <li>and {changes.length - 4} more</li> : null}
                </ul>
                <p className="text-caption text-text-muted m-0">{NEW_CLAIMS_ONLY}</p>
                {overtaken ? (
                  <p className="text-caption text-warning m-0">
                    Someone else saved these promotions while you were editing. Saving will be
                    refused; discard to see their values.
                  </p>
                ) : null}
                {saveError ? (
                  <p className="text-caption text-error m-0" role="alert">
                    {saveError}
                  </p>
                ) : null}
                {blocking ? (
                  <p className="text-caption text-error m-0">{fixFieldsText(invalid)}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" onClick={discard} disabled={saving}>
                  Discard
                </Button>
                <Button variant="primary" onClick={() => void save()} disabled={saving || blocking || !dirty}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-body text-text-primary m-0" role={saveError ? "alert" : "status"}>
              {saveError ?? saved}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
