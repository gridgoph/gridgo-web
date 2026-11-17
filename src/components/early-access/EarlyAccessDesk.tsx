"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, UserRoundCheck, X } from "lucide-react";

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
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  grantEarlyAccess,
  listEarlyAccess,
  type EarlyAccessCounts,
  type EarlyAccessSignup,
} from "@/lib/api/early-access";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  EARLY_ACCESS_FILTERS,
  EARLY_ACCESS_PAGE_SIZE,
  EARLY_ACCESS_QUERY_MAX,
  apiStatusOf,
  appendPage,
  applyGrant,
  countFor,
  formatManilaDateTime,
  grantError,
  grantToast,
  grantedByLabel,
  hasMore,
  listChangeNotice,
  pagingSummary,
  listFromPage,
  listLoadError,
  refreshLoadError,
  nextOffset,
  platformLabel,
  searchFromView,
  sourceLabel,
  viewFromSearch,
  viewKey,
  type EarlyAccessFilter,
  type EarlyAccessList,
  type EarlyAccessView,
} from "@/lib/early-access";
import { useLiveReload } from "@/lib/live/useLiveReload";

const SEARCH_DELAY_MS = 300;

/**
 * Google Play early access sign-ups from the website, for Operations and
 * Super Admin. Staff add the Google account to the client app's Play closed
 * test, then grant here; the API emails the Play invite.
 *
 * The view (status filter and search) lives in the URL. A grant changes its
 * row in place and keeps every page already read; a new view drops them.
 */
export function EarlyAccessDesk() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { user } = useAuth();
  const view = useMemo(() => viewFromSearch(search), [search]);
  const key = viewKey(view);

  const [list, setList] = useState<EarlyAccessList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [changeNotice, setChangeNotice] = useState<string | null>(null);
  const [granting, setGranting] = useState<EarlyAccessSignup | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantErr, setGrantErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // A grant waits for a Show more already in flight, so the page's counts
  // never land on top of the grant's (a modal confirm keeps the reverse
  // from happening). `grants` counts grants applied here, so a counts check
  // that started before one is not compared against it.
  const moreFlight = useRef<Promise<void> | null>(null);
  const grants = useRef(0);

  // Only the latest read for the view on screen may land.
  const generation = useRef(0);
  const activeKey = useRef(key);
  activeKey.current = key;
  const listRef = useRef(list);
  listRef.current = list;
  // The view as last chosen here: a search typed just before a filter click
  // (or the reverse) builds on it before the URL has caught up.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const loadFirst = useCallback(async (forView: EarlyAccessView) => {
    const forKey = viewKey(forView);
    const mine = ++generation.current;
    setLoadError(null);
    setRefreshing(true);
    try {
      const page = await listEarlyAccess({
        status: apiStatusOf(forView.filter),
        q: forView.q,
        limit: EARLY_ACCESS_PAGE_SIZE,
      });
      if (mine !== generation.current || activeKey.current !== forKey) return;
      setList(listFromPage(forView, page));
      setChangeNotice(null);
      setMoreError(null);
    } catch (err) {
      if (mine !== generation.current || activeKey.current !== forKey) return;
      setLoadError(listRef.current ? refreshLoadError(err) : listLoadError(err));
    } finally {
      if (mine === generation.current) setRefreshing(false);
    }
  }, []);

  // A new view starts from its first page; the old view's rows and its
  // Show more go with it.
  useEffect(() => {
    setList((current) => (current?.key === key ? current : null));
    setMoreBusy(false);
    setMoreError(null);
    setChangeNotice(null);
    void loadFirst(view);
    // `key` carries the view; `view` is a fresh object per search change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loadFirst]);

  function showMore() {
    const current = listRef.current;
    if (!current || moreFlight.current || !hasMore(current)) return;
    const flight = readMore(current).finally(() => {
      if (moreFlight.current === flight) moreFlight.current = null;
    });
    moreFlight.current = flight;
  }

  async function readMore(current: EarlyAccessList) {
    const forKey = current.key;
    const mine = generation.current;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const page = await listEarlyAccess({
        status: apiStatusOf(current.filter),
        q: viewRef.current.q,
        limit: EARLY_ACCESS_PAGE_SIZE,
        offset: nextOffset(current),
      });
      if (mine !== generation.current || activeKey.current !== forKey) return;
      setList((latest) =>
        latest && latest.key === forKey ? appendPage(latest, page) : latest,
      );
    } catch (err) {
      if (mine !== generation.current || activeKey.current !== forKey) return;
      setMoreError(listLoadError(err));
    } finally {
      if (activeKey.current === forKey) setMoreBusy(false);
    }
  }

  // The stream says sign-ups changed (a new one, or a grant on the support
  // desk). Rows never move under the reader: only the counts are read, and a
  // difference offers a refresh.
  const checkForChanges = useCallback(async () => {
    const current = listRef.current;
    if (!current) return;
    const forKey = current.key;
    const grantsBefore = grants.current;
    try {
      const page = await listEarlyAccess({ q: viewRef.current.q, limit: 1 });
      const latest = listRef.current;
      if (!latest || latest.key !== forKey || activeKey.current !== forKey) return;
      // A grant landed meanwhile; its own stream ping checks again.
      if (grants.current !== grantsBefore) return;
      setChangeNotice(listChangeNotice(latest.counts, page.counts));
    } catch {
      /* The list on screen stays; the next change or Refresh tries again. */
    }
  }, []);
  useLiveReload("early-access", checkForChanges);

  const setView = useCallback(
    (next: EarlyAccessView) => {
      viewRef.current = next;
      router.replace(`${pathname}${searchFromView(next)}`, { scroll: false });
    },
    [router, pathname],
  );

  async function confirmGrant() {
    const row = granting;
    if (!row || grantBusy) return;
    const forKey = key;
    setGrantBusy(true);
    setGrantErr(null);
    try {
      if (moreFlight.current) await moreFlight.current;
      const updated = await grantEarlyAccess(row.id);
      if (activeKey.current === forKey) {
        grants.current += 1;
        setList((latest) =>
          latest && latest.key === forKey ? applyGrant(latest, updated) : latest,
        );
      }
      setGranting(null);
      toast.add({ type: "success", ...grantToast(updated, myId) });
    } catch (err) {
      setGrantErr(grantError(err));
    } finally {
      setGrantBusy(false);
    }
  }

  const myId = user?.id ?? null;
  const columns = useMemo<DataTableColumn<EarlyAccessSignup>[]>(
    () => [
      {
        id: "email",
        header: "Email",
        primary: true,
        alwaysVisible: true,
        cell: (row) => (
          <span
            className="text-body text-text-primary break-all"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {row.email}
          </span>
        ),
      },
      {
        id: "status",
        header: "Access",
        alwaysVisible: true,
        cell: (row) =>
          row.status === "granted" ? (
            <div className="flex flex-col items-start gap-1">
              <StatusChip tone="success" icon="circle-check" label="Granted" />
              <span className="text-caption text-text-secondary whitespace-nowrap">
                {formatManilaDateTime(row.grantedAt)}
                {grantedByLabel(row.grantedBy, myId)
                  ? ` ${grantedByLabel(row.grantedBy, myId)}`
                  : ""}
              </span>
            </div>
          ) : (
            <StatusChip tone="neutral" icon="clock" label="Waiting" />
          ),
      },
      {
        id: "signedUp",
        header: "Signed up",
        cell: (row) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatManilaDateTime(row.createdAt)}
          </span>
        ),
      },
      {
        id: "source",
        header: "Source",
        cell: (row) => (
          <span
            className={
              row.source
                ? "text-body text-text-primary block max-w-56 whitespace-normal break-all"
                : "text-body text-text-secondary"
            }
          >
            {sourceLabel(row.source)}
          </span>
        ),
      },
      {
        id: "platform",
        header: "Platform",
        cell: (row) => (
          <span className="text-body text-text-secondary">
            {platformLabel(row.platform)}
          </span>
        ),
      },
    ],
    [myId],
  );

  const counts: EarlyAccessCounts | null = list?.counts ?? null;
  const rows = list?.rows ?? [];
  const loading = !list && !loadError;
  const searching = view.q.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        People who asked on the website to test the GRIDGO Android app. Add each Google
        account to the client app&rsquo;s Play closed test first, then grant access here:
        GRIDGO emails them the Play invite. Times are Manila time.
      </p>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <StatusFilter
          filter={view.filter}
          counts={counts}
          onChange={(filter) => setView({ ...viewRef.current, filter })}
        />
        <SearchBox q={view.q} onSearch={(q) => setView({ ...viewRef.current, q })} />
      </div>

      {searching && counts ? (
        <p className="text-caption text-text-secondary m-0" role="status">
          Counts and rows match &ldquo;{view.q.trim()}&rdquo;.
        </p>
      ) : null}

      {changeNotice ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-outline bg-surface px-4 py-2"
          role="status"
        >
          <span className="text-body text-text-primary">{changeNotice}</span>
          <Button
            variant="outline"
            disabled={refreshing}
            onClick={() => void loadFirst(viewRef.current)}
          >
            {refreshing ? "Refreshing…" : "Refresh list"}
          </Button>
        </div>
      ) : null}

      {loadError && list ? (
        // A failed refresh keeps the rows already read and says so.
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-error bg-surface px-4 py-2"
          role="alert"
        >
          <span className="text-body text-text-primary">{loadError}</span>
          <Button
            variant="outline"
            disabled={refreshing}
            onClick={() => void loadFirst(viewRef.current)}
          >
            {refreshing ? "Refreshing…" : "Retry"}
          </Button>
        </div>
      ) : null}

      {loadError && !list ? (
        <ErrorState
          title="Could not load sign-ups"
          body={loadError}
          action={<Button onClick={() => void loadFirst(view)}>Try again</Button>}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          getRowId={(row) => row.id}
          caption="Early access sign-ups"
          itemLabel="sign-ups"
          rowActionsDensity="labeled"
          // The API pages; every row read stays on one page here.
          pageSize={100_000}
          empty={
            <EmptyFor
              view={view}
              onClear={() => setView({ ...viewRef.current, q: "" })}
            />
          }
          rowActions={(row) =>
            row.status === "pending" ? (
              <DataTableRowAction
                label="Grant access"
                icon={UserRoundCheck}
                onClick={() => {
                  setGrantErr(null);
                  setGranting(row);
                }}
              />
            ) : null
          }
        />
      )}

      {list && rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="text-caption text-text-secondary tabular-nums"
            aria-live="polite"
          >
            {pagingSummary(list)}
          </span>
          {hasMore(list) ? (
            <Button variant="outline" disabled={moreBusy} onClick={showMore}>
              {moreBusy ? "Loading…" : "Show more"}
            </Button>
          ) : null}
          {moreError ? (
            <span className="text-body text-error" role="alert">
              {moreError}
            </span>
          ) : null}
        </div>
      ) : null}

      <AlertDialog
        open={granting !== null}
        onOpenChange={(open) => !open && !grantBusy && setGranting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grant early access?</AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              Check that this Google account is in the client app&rsquo;s Play closed
              test. Granting emails the Play invite now and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p
            className="m-0 rounded-[12px] border border-outline bg-surface-variant px-3 py-2 text-body text-text-primary break-all"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {granting?.email}
          </p>
          {grantErr ? (
            <p className="text-body text-error m-0" role="alert">
              {grantErr}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={grantBusy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              disabled={grantBusy}
              onClick={() => void confirmGrant()}
            >
              {grantBusy ? "Granting…" : "Grant access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The counts are the filter: each choice names how many it holds. */
function StatusFilter({
  filter,
  counts,
  onChange,
}: {
  filter: EarlyAccessFilter;
  counts: EarlyAccessCounts | null;
  onChange: (filter: EarlyAccessFilter) => void;
}) {
  return (
    <ToggleGroup
      value={[filter]}
      onValueChange={(values) => {
        const next = values[0] as EarlyAccessFilter | undefined;
        if (next) onChange(next);
      }}
      variant="outline"
      spacing={0}
      aria-label="Show sign-ups"
      className="self-start"
    >
      {EARLY_ACCESS_FILTERS.map((choice) => {
        const count = counts ? countFor(counts, choice.value) : null;
        return (
          <ToggleGroupItem
            key={choice.value}
            value={choice.value}
            className="h-11 min-w-20 gap-2 px-3"
            aria-label={count === null ? choice.label : `${choice.label}, ${count}`}
          >
            <span>{choice.label}</span>
            <span className="text-text-secondary tabular-nums" aria-hidden>
              {count === null ? "–" : count}
            </span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

/** Typing searches after a short pause; Enter searches now; Escape clears. */
function SearchBox({ q, onSearch }: { q: string; onSearch: (q: string) => void }) {
  const [draft, setDraft] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Back/forward or a cleared search moves the URL; the box follows it.
  useEffect(() => {
    setDraft(q);
  }, [q]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function search(next: string, now = false) {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    if (now) onSearch(next);
    else timer.current = setTimeout(() => onSearch(next), SEARCH_DELAY_MS);
  }

  return (
    <form
      role="search"
      className="relative w-full md:max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        search(draft, true);
      }}
    >
      <Search
        size={16}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
      />
      <Input
        ref={inputRef}
        type="search"
        value={draft}
        onChange={(event) => search(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && draft) {
            event.preventDefault();
            search("", true);
          }
        }}
        placeholder="Search by email"
        aria-label="Search sign-ups by email"
        maxLength={EARLY_ACCESS_QUERY_MAX}
        autoComplete="off"
        spellCheck={false}
        className="h-11 pr-11 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          className="absolute top-0 right-0"
          onClick={() => {
            search("", true);
            inputRef.current?.focus();
          }}
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </form>
  );
}

function EmptyFor({ view, onClear }: { view: EarlyAccessView; onClear: () => void }) {
  const q = view.q.trim();
  if (q) {
    return (
      <EmptyState
        title="No sign-ups match this search"
        body={`Nothing ${view.filter === "pending" ? "waiting" : view.filter === "granted" ? "granted" : "on file"} has an email containing “${q}”.`}
        action={<Button onClick={onClear}>Clear search</Button>}
      />
    );
  }
  if (view.filter === "pending") {
    return (
      <EmptyState
        title="No one is waiting"
        body="New sign-ups from the website's early access form appear here as they arrive."
      />
    );
  }
  if (view.filter === "granted") {
    return (
      <EmptyState
        title="No access granted yet"
        body="Grant a waiting sign-up and it moves here with the time it was granted."
      />
    );
  }
  return (
    <EmptyState
      title="No sign-ups yet"
      body="Sign-ups from the website's early access form appear here as they arrive."
    />
  );
}
