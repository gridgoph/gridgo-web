"use client";

import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CircleCheck, SlidersHorizontal } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { ListingReviewPanel } from "@/components/listing-reviews/ListingReviewPanel";
import { ProductTypePanel } from "@/components/listing-reviews/ProductTypePanel";
import { SendBackDialog } from "@/components/listing-reviews/SendBackDialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  decideCatalogReview,
  decideProductTypeRequest,
  getTaxonomy,
  listAcceptedFileFormats,
  listCatalogReviews,
  listProductTypeRequests,
  listStaffCatalogItems,
  listUsers,
  type ReviewQueueStatus,
} from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import {
  DEFAULT_REVIEW_FILTERS,
  PRODUCT_TYPE_SEND_BACK_REASONS,
  REVIEW_KIND_OPTIONS,
  REVIEW_STATUS_TABS,
  SEND_BACK_REASONS,
  filterReviewEntries,
  isRevision,
  normalizeProductTypeRequests,
  normalizeReviewPage,
  oldestFirst,
  reviewChip,
  reviewCountLine,
  reviewErrorMessage,
  reviewFiltersSet,
  type ProductTypeRequest,
  type ReviewEntry,
  type ReviewFilters,
  type ReviewKind,
} from "@/lib/listing-review";
import { priceLine } from "@/lib/listings";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { readStaffShop } from "@/lib/supplier-products";
import { cn } from "@/lib/utils";

type View = "listings" | "types";

/** Pages of 50 read per state before the desk offers to read on. */
const MAX_REVIEW_PAGES = 10;
const SIDE_BY_SIDE_QUERY = "(min-width: 1024px)";

function sideBySide(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(SIDE_BY_SIDE_QUERY).matches
    : true;
}

async function readReviews(status: ReviewQueueStatus) {
  const entries: ReviewEntry[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_REVIEW_PAGES; page += 1) {
    const body = normalizeReviewPage(await listCatalogReviews(status, after));
    entries.push(...body.entries);
    after = body.nextCursor;
    if (!after) return { entries, partial: false };
  }
  return { entries, partial: true };
}

async function readRequests() {
  const requests: ProductTypeRequest[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_REVIEW_PAGES; page += 1) {
    const body = normalizeProductTypeRequests(await listProductTypeRequests(null, after));
    requests.push(...body.requests);
    after = body.nextCursor;
    if (!after) break;
  }
  return requests;
}

/** Shop names: the staff listing index names every shop with a listing; users fill the rest. */
async function readShopNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const [index, suppliers] = await Promise.all([
    listStaffCatalogItems({ limit: 1 }).catch(() => null),
    listUsers("supplier").catch(() => []),
  ]);
  const shops =
    index && typeof index === "object" && "shops" in index
      ? (index as { shops: unknown }).shops
      : [];
  for (const raw of Array.isArray(shops) ? shops : []) {
    const shop = readStaffShop(raw);
    if (shop?.shopName) names.set(shop.supplierId, shop.shopName);
  }
  for (const user of suppliers) {
    const name = user.supplierName?.trim() || user.name?.trim();
    if (name && !names.has(user.id)) names.set(user.id, name);
  }
  return names;
}

/**
 * Operations' listing review desk (gridgoph/gridgo-supplier#97): every new
 * listing and every change to a live one waits here until a person approves
 * it or sends it back, and new product-type requests sit in their own tab.
 * Mounted at `/ops/listing-reviews` and `/admin/listing-reviews`.
 */
export function ListingReviewsDesk({ tree }: { tree: "ops" | "admin" }) {
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>(
    searchParams.get("tab") === "types" ? "types" : "listings",
  );
  const [status, setStatus] = useState<ReviewQueueStatus>("pending");
  const [pending, setPending] = useState<ReviewEntry[] | null>(null);
  const [other, setOther] = useState<ReviewEntry[] | null>(null);
  const [partial, setPartial] = useState(false);
  const [requests, setRequests] = useState<ProductTypeRequest[] | null>(null);
  // null until the names have been read, so a row never says "Unnamed" early.
  const [shops, setShops] = useState<Map<string, string> | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [formats, setFormats] = useState<Map<string, string>>(new Map());
  const [filters, setFilters] = useState<ReviewFilters>(DEFAULT_REVIEW_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackError, setSendBackError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [arrivals, setArrivals] = useState<string | null>(null);
  const seenRef = useRef<Set<string> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setError(null);
      try {
        const [waiting, decided, asked] = await Promise.all([
          readReviews("pending"),
          status === "pending" ? Promise.resolve(null) : readReviews(status),
          readRequests(),
        ]);
        setPending(waiting.entries);
        setOther(decided?.entries ?? null);
        setPartial((decided ?? waiting).partial);
        setRequests(asked);
        noteArrivals(waiting.entries, asked);
      } catch (err) {
        setError(
          opsErrorMessage(
            err,
            "Could not load the review queue. Check your connection and try again.",
          ),
        );
      }
    }, [status]),
  );

  // A submission arriving while the desk is open is marked New and announced,
  // beside the Desk chime and any desktop alert the inbox raises.
  function noteArrivals(waiting: ReviewEntry[], asked: ProductTypeRequest[]) {
    const ids = [
      ...waiting.map(
        (entry) => `listing:${entry.listing.id}:${entry.listing.version ?? ""}`,
      ),
      ...asked
        .filter((request) => request.status === "pending")
        .map((request) => `type:${request.id}`),
    ];
    const seen = seenRef.current;
    if (!seen) {
      seenRef.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.has(id));
    if (!added.length) return;
    for (const id of added) seen.add(id);
    const listings = added.filter((id) => id.startsWith("listing:")).length;
    const types = added.length - listings;
    setFresh((current) => {
      const next = new Set(current);
      for (const id of added) next.add(id.split(":").slice(0, 2).join(":"));
      return next;
    });
    const parts = [
      listings
        ? `${listings} new or changed listing${listings === 1 ? "" : "s"} to review`
        : "",
      types ? `${types} new product-type request${types === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    setArrivals(`${parts.join(" and ")}.`);
  }

  useLiveReload("catalog", load);

  useEffect(() => {
    void load();
  }, [load]);

  const loadReference = useCallback(async () => {
    const [names, tax, list] = await Promise.all([
      readShopNames(),
      getTaxonomy().catch(() => null),
      listAcceptedFileFormats().catch(() => []),
    ]);
    setShops(names);
    if (tax) setTaxonomy(tax);
    setFormats(new Map(list.map((format) => [format.code, format.displayName])));
  }, []);

  useEffect(() => {
    void loadReference();
  }, [loadReference]);

  const shopName = useCallback(
    (supplierId: string | null) =>
      shops ? ((supplierId ? shops.get(supplierId) : null) ?? "Unnamed shop") : "…",
    [shops],
  );
  const typeName = useCallback(
    (code: string) =>
      taxonomy?.subcategories?.find((entry) => entry.code === code)?.name ??
      (code ? code.replace(/_/g, " ") : "No product type"),
    [taxonomy],
  );
  const categoryName = useCallback(
    (code: string) =>
      taxonomy?.categories.find((entry) => entry.code === code)?.name ??
      code.replace(/_/g, " "),
    [taxonomy],
  );
  const formatName = useCallback(
    (code: string) => formats.get(code) ?? code.replace(/_/g, " "),
    [formats],
  );

  const source = status === "pending" ? pending : other;
  const sorted = useMemo(() => {
    if (!source) return null;
    if (status === "pending") return oldestFirst(source);
    return [...source].sort((a, b) =>
      String(b.listing.reviewedAt ?? "").localeCompare(
        String(a.listing.reviewedAt ?? ""),
      ),
    );
  }, [source, status]);
  const entries = useMemo(
    () => (sorted ? filterReviewEntries(sorted, filters, shopName, typeName) : null),
    [sorted, filters, shopName, typeName],
  );
  const shownRequests = useMemo(() => {
    if (!requests) return null;
    const list = requests.filter((request) => request.status === status);
    return status === "pending"
      ? list.sort((a, b) =>
          String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
        )
      : list.sort((a, b) =>
          String(b.reviewedAt ?? "").localeCompare(String(a.reviewedAt ?? "")),
        );
  }, [requests, status]);

  const pendingRequests = requests?.filter(
    (request) => request.status === "pending",
  ).length;
  const selectedEntry =
    view === "listings"
      ? (entries?.find((entry) => entry.listing.id === selectedId) ?? null)
      : null;
  const selectedRequest =
    view === "types"
      ? (shownRequests?.find((request) => request.id === selectedId) ?? null)
      : null;
  const rowIds =
    view === "listings"
      ? (entries ?? []).map((entry) => entry.listing.id)
      : (shownRequests ?? []).map((request) => request.id);

  // Side by side, the oldest waiting item opens on its own: the desk works top down.
  useEffect(() => {
    if (selectedId && rowIds.includes(selectedId)) return;
    if (rowIds.length && sideBySide()) setSelectedId(rowIds[0]);
    else if (!rowIds.length) setSelectedId(null);
  }, [rowIds, selectedId]);

  function open(id: string) {
    setSelectedId(id);
    setActionError(null);
    if (!sideBySide()) {
      setDetailOpen(true);
      requestAnimationFrame(() => headingRef.current?.focus());
    }
  }

  function backToList() {
    setDetailOpen(false);
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-row-id="${selectedId}"] button`)
        ?.focus(),
    );
  }

  function switchView(next: View) {
    if (next === view) return;
    setView(next);
    setSelectedId(null);
    setDetailOpen(false);
    setActionError(null);
    setNotice(null);
  }

  function switchStatus(next: ReviewQueueStatus) {
    if (next === status) return;
    setOther(null);
    setStatus(next);
    setSelectedId(null);
    setDetailOpen(false);
    setActionError(null);
    setNotice(null);
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!rowIds.length) return;
    const index = rowIds.indexOf(selectedId ?? "");
    let next: number;
    if (event.key === "ArrowDown") next = Math.min(rowIds.length - 1, index + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else return;
    event.preventDefault();
    setSelectedId(rowIds[next]);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-row-id="${rowIds[next]}"] button`)
      ?.focus();
  }

  /** After a decision, the next item in the list opens, so the desk works down it. */
  function neighbourOf(id: string): string | null {
    const index = rowIds.indexOf(id);
    return rowIds[index + 1] ?? rowIds[index - 1] ?? null;
  }

  async function decide(run: () => Promise<unknown>, done: string, id: string) {
    setBusy(true);
    setActionError(null);
    setSendBackError(null);
    try {
      await run();
      setNotice(done);
      setSendBackOpen(false);
      const next = neighbourOf(id);
      setFresh((current) => {
        const copy = new Set(current);
        copy.delete(`listing:${id}`);
        copy.delete(`type:${id}`);
        return copy;
      });
      await load();
      setSelectedId(next);
      if (!sideBySide()) setDetailOpen(false);
    } catch (err) {
      const message =
        reviewErrorMessage(err) ??
        opsErrorMessage(err, "Could not save the decision. Try again.");
      if (sendBackOpen) setSendBackError(message);
      else setActionError(message);
      if (err && typeof err === "object" && "kind" in err && err.kind === "conflict")
        await load();
    } finally {
      setBusy(false);
    }
  }

  function approveListing(entry: ReviewEntry) {
    if (entry.listing.version == null) return;
    const version = entry.listing.version;
    void decide(
      () =>
        decideCatalogReview(entry.listing.id, version, {
          status: "approved",
          photosUnbranded: true,
        }),
      isRevision(entry.listing)
        ? `Approved “${entry.listing.name}”. Clients now see the new version, and the shop has been told.`
        : `Approved “${entry.listing.name}”. Clients see it whenever the shop has it on the board, and the shop has been told.`,
      entry.listing.id,
    );
  }

  function sendBack(reason: string) {
    if (selectedEntry && selectedEntry.listing.version != null) {
      const version = selectedEntry.listing.version;
      const { listing } = selectedEntry;
      void decide(
        () =>
          decideCatalogReview(listing.id, version, { status: "needs_revision", reason }),
        `Sent “${listing.name}” back. The shop has your reason.`,
        listing.id,
      );
    } else if (selectedRequest) {
      const request = selectedRequest;
      void decide(
        () =>
          decideProductTypeRequest(request.id, request.version, {
            status: "needs_revision",
            reason,
          }),
        `Sent the request for “${request.name}” back. The shop has your reason.`,
        request.id,
      );
    }
  }

  function approveRequest(request: ProductTypeRequest, code: string) {
    void decide(
      async () => {
        await decideProductTypeRequest(request.id, request.version, {
          status: "approved",
          code,
        });
        await loadReference();
      },
      `Added “${request.name}”. Every shop in ${categoryName(request.categoryCode)} can now pick it.`,
      request.id,
    );
  }

  const existingCodes = useMemo(
    () => new Set((taxonomy?.subcategories ?? []).map((entry) => entry.code)),
    [taxonomy],
  );

  if (error && !pending) {
    return (
      <ErrorState
        body={error}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }

  const initialLoad = view === "listings" ? !entries : !shownRequests;
  const filtered = reviewFiltersSet(filters);
  const shopChoices = [
    ...new Set((sorted ?? []).map((entry) => entry.listing.supplierId ?? "")),
  ]
    .filter(Boolean)
    .map((id) => ({ id, name: shopName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const typeChoices = [
    ...new Set((sorted ?? []).map((entry) => entry.listing.subcategoryCode)),
  ]
    .filter(Boolean)
    .map((code) => ({ code, name: typeName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex h-[calc(100dvh-5rem)] min-h-[32rem] flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          value={[view]}
          onValueChange={(values) => {
            const next = values[0] as View | undefined;
            if (next) switchView(next);
          }}
          variant="outline"
          spacing={0}
          aria-label="What to review"
          className="flex flex-wrap gap-1"
        >
          <ToggleGroupItem value="listings">
            Listings{pending ? ` · ${pending.length}` : ""}
          </ToggleGroupItem>
          <ToggleGroupItem value="types">
            New product types{pendingRequests != null ? ` · ${pendingRequests}` : ""}
          </ToggleGroupItem>
        </ToggleGroup>
        <Button size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div aria-live="polite" className="shrink-0 empty:hidden">
        {arrivals ? (
          <p className="text-body text-text-primary border-info m-0 flex flex-wrap items-center gap-2 rounded-[var(--radius-field)] border px-3 py-2">
            <span>{arrivals} They are marked New.</span>
            <Button size="sm" variant="ghost" onClick={() => setArrivals(null)}>
              Dismiss
            </Button>
          </p>
        ) : null}
        {notice ? (
          <p
            className="text-body text-text-primary m-0 flex items-start gap-2 py-1"
            role="status"
          >
            <CircleCheck aria-hidden className="text-success mt-0.5 size-4 shrink-0" />
            {notice}
          </p>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[24rem_minmax(0,1fr)] lg:gap-4">
        <aside
          aria-label={view === "listings" ? "Listing queue" : "Product-type requests"}
          className={cn(
            "gg-card-flush min-h-0 min-w-0 flex-col",
            detailOpen ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="flex shrink-0 flex-col gap-2 border-b border-outline p-3">
            <ToggleGroup
              value={[status]}
              onValueChange={(values) => {
                const next = values[0] as ReviewQueueStatus | undefined;
                if (next) switchStatus(next);
              }}
              variant="outline"
              spacing={0}
              aria-label="Filter by review state"
              className="flex flex-wrap gap-1"
            >
              {REVIEW_STATUS_TABS.map((tab) => (
                <ToggleGroupItem key={tab.value} value={tab.value}>
                  {view === "types" && tab.value === "approved" ? "Added" : tab.label}
                  {tab.value === "pending"
                    ? view === "listings"
                      ? pending
                        ? ` · ${pending.length}`
                        : ""
                      : pendingRequests != null
                        ? ` · ${pendingRequests}`
                        : ""
                    : ""}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {view === "listings" ? (
              <ListingFilters
                filters={filters}
                open={filtersOpen}
                onToggle={() => setFiltersOpen((value) => !value)}
                onChange={(next) => setFilters((current) => ({ ...current, ...next }))}
                onClear={() => setFilters(DEFAULT_REVIEW_FILTERS)}
                shops={shopChoices}
                types={typeChoices}
              />
            ) : null}
          </div>

          <div
            ref={listRef}
            onKeyDown={onListKeyDown}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          >
            {initialLoad ? (
              <>
                <p className="sr-only" role="status">
                  Loading the queue…
                </p>
                <ListSkeleton />
              </>
            ) : view === "listings" ? (
              entries!.length ? (
                <div role="list" aria-label="Listings" className="flex flex-col gap-0.5">
                  {entries!.map((entry) => (
                    <QueueRow
                      key={entry.listing.id}
                      id={entry.listing.id}
                      active={entry.listing.id === selectedId}
                      fresh={fresh.has(`listing:${entry.listing.id}`)}
                      onOpen={open}
                      thumb={entry.listing.photos[0]?.downloadUrl ?? null}
                      title={entry.listing.name || "Untitled listing"}
                      lines={[
                        `${shopName(entry.listing.supplierId)} · ${typeName(entry.listing.subcategoryCode)}`,
                      ]}
                      chips={
                        <>
                          <span className="text-caption text-text-primary tabular-nums">
                            {priceLine(entry.listing)}
                          </span>
                          {isRevision(entry.listing) ? (
                            <StatusChip tone="neutral" icon="square-pen" label="Change" />
                          ) : null}
                          {status === "pending" && entry.blockers.length ? (
                            <StatusChip {...reviewChip(entry)} />
                          ) : null}
                        </>
                      }
                      when={
                        status === "pending"
                          ? entry.listing.updatedAt
                            ? `Changed ${formatDateTime(entry.listing.updatedAt)}`
                            : null
                          : entry.listing.reviewedAt
                            ? `Decided ${formatDateTime(entry.listing.reviewedAt)}`
                            : null
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  className="border-0"
                  title={
                    filtered
                      ? "Nothing matches these filters"
                      : status === "pending"
                        ? "No listings waiting"
                        : status === "needs_revision"
                          ? "Nothing sent back"
                          : "Nothing approved yet"
                  }
                  body={
                    filtered
                      ? "Clear the filters to see the rest of this queue."
                      : status === "pending"
                        ? "A new listing, or a change to a live one, appears here as soon as a shop sends it."
                        : "Listings land here once someone decides them."
                  }
                  action={
                    filtered ? (
                      <Button onClick={() => setFilters(DEFAULT_REVIEW_FILTERS)}>
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              )
            ) : shownRequests!.length ? (
              <div
                role="list"
                aria-label="Product-type requests"
                className="flex flex-col gap-0.5"
              >
                {shownRequests!.map((request) => (
                  <QueueRow
                    key={request.id}
                    id={request.id}
                    active={request.id === selectedId}
                    fresh={fresh.has(`type:${request.id}`)}
                    onOpen={open}
                    thumb={undefined}
                    title={request.name}
                    lines={[
                      `${categoryName(request.categoryCode)} · ${shopName(request.supplierId)}`,
                    ]}
                    chips={null}
                    when={
                      request.createdAt
                        ? `Sent ${formatDateTime(request.createdAt)}`
                        : null
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                className="border-0"
                title={status === "pending" ? "No requests waiting" : "Nothing here yet"}
                body={
                  status === "pending"
                    ? "When a shop cannot find its product in the list, its request for a new product type appears here."
                    : "Requests land here once someone decides them."
                }
              />
            )}
          </div>

          {view === "listings" && entries && sorted?.length ? (
            <p
              className="text-caption text-text-muted m-0 shrink-0 border-t border-outline px-4 py-2"
              aria-live="polite"
            >
              {reviewCountLine(entries.length, sorted.length, filtered)}
              {status === "pending" ? ", oldest first" : ", latest decision first"}
              {partial ? `. Showing the first ${sorted.length}.` : ""}
            </p>
          ) : null}
        </aside>

        <section
          aria-label={
            view === "listings" ? "Listing under review" : "Request under review"
          }
          // One scrolling column on a phone, so the decision sits after the
          // listing instead of pinned over it; side by side it stays pinned.
          className={cn(
            "gg-card-flush min-h-0 min-w-0 flex-col max-lg:overflow-y-auto",
            detailOpen ? "flex" : "hidden lg:flex",
          )}
        >
          {initialLoad ? (
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="aspect-[3/1] w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : selectedEntry ? (
            <ListingReviewPanel
              key={`${selectedEntry.listing.id}:${selectedEntry.listing.version ?? ""}`}
              entry={selectedEntry}
              shopName={shopName(selectedEntry.listing.supplierId)}
              typeName={typeName}
              formatName={formatName}
              tree={tree}
              busy={busy}
              actionError={actionError}
              headingRef={headingRef}
              onBack={backToList}
              onApprove={() => approveListing(selectedEntry)}
              onSendBack={() => {
                setSendBackError(null);
                setSendBackOpen(true);
              }}
            />
          ) : selectedRequest ? (
            <ProductTypePanel
              key={`${selectedRequest.id}:${selectedRequest.version}`}
              request={selectedRequest}
              shopName={shopName(selectedRequest.supplierId)}
              categoryName={categoryName(selectedRequest.categoryCode)}
              existingCodes={existingCodes}
              siblings={(taxonomy?.subcategories ?? [])
                .filter(
                  (entry) =>
                    entry.categoryCode === selectedRequest.categoryCode &&
                    entry.active !== false,
                )
                .map((entry) => entry.name)}
              busy={busy}
              actionError={actionError}
              headingRef={headingRef}
              onBack={backToList}
              onApprove={(code) => approveRequest(selectedRequest, code)}
              onSendBack={() => {
                setSendBackError(null);
                setSendBackOpen(true);
              }}
            />
          ) : (
            <div className="p-4">
              <EmptyState
                className="border-0 p-0"
                title={rowIds.length ? "Pick one to review" : "Nothing to open"}
                body={
                  view === "listings"
                    ? "Its photos, specs, price and shop open here, with Approve and Send back."
                    : "The request and the product types already in its category open here."
                }
              />
            </div>
          )}
        </section>
      </div>

      <SendBackDialog
        key={selectedId ?? "none"}
        open={sendBackOpen}
        title={
          selectedEntry
            ? `Send back “${selectedEntry.listing.name || "this listing"}”`
            : `Send back the request for “${selectedRequest?.name ?? "this product type"}”`
        }
        audience={
          selectedEntry
            ? "The shop reads your reason on the listing and in a notification. Clients keep seeing any approved version."
            : "The shop reads your reason and can send a corrected request."
        }
        presets={selectedEntry ? SEND_BACK_REASONS : PRODUCT_TYPE_SEND_BACK_REASONS}
        busy={busy}
        error={sendBackError}
        onCancel={() => setSendBackOpen(false)}
        onSend={sendBack}
      />
    </div>
  );
}

function QueueRow({
  id,
  active,
  fresh,
  onOpen,
  thumb,
  title,
  lines,
  chips,
  when,
}: {
  id: string;
  active: boolean;
  fresh: boolean;
  onOpen: (id: string) => void;
  /** A photo URL, null for a listing without one, undefined for no thumbnail column. */
  thumb: string | null | undefined;
  title: string;
  lines: string[];
  chips: ReactNode;
  when: string | null;
}) {
  return (
    <div
      role="listitem"
      data-row-id={id}
      className={cn(
        "relative flex rounded-[var(--radius-field)]",
        active ? "bg-muted" : "hover:bg-overlay-hover",
      )}
    >
      {/* The open row also carries a bar, so the choice reads without colour. */}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[var(--color-text-primary)]"
        />
      ) : null}
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={() => onOpen(id)}
        className="flex w-full min-w-0 items-start gap-3 rounded-[var(--radius-field)] px-3 py-2 text-left"
      >
        {thumb !== undefined ? (
          thumb ? (
            // Signed, short-lived file URLs: next/image would proxy and cache them.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              className="border-outline bg-muted size-12 shrink-0 rounded-md border object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="border-outline bg-muted text-text-muted flex size-12 shrink-0 items-center justify-center rounded-md border text-[0.625rem]"
            >
              No photo
            </span>
          )
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span
              className="text-body text-text-primary min-w-0 flex-1 truncate"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {title}
            </span>
            {fresh ? <StatusChip tone="info" icon="circle-dot" label="New" /> : null}
          </span>
          {lines.map((line) => (
            <span key={line} className="text-caption text-text-secondary truncate">
              {line}
            </span>
          ))}
          {chips || when ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
              {chips}
              {when ? <span className="text-caption text-text-muted">{when}</span> : null}
            </span>
          ) : null}
        </span>
      </button>
    </div>
  );
}

function ListingFilters({
  filters,
  open,
  onToggle,
  onChange,
  onClear,
  shops,
  types,
}: {
  filters: ReviewFilters;
  open: boolean;
  onToggle: () => void;
  onChange: (next: Partial<ReviewFilters>) => void;
  onClear: () => void;
  shops: { id: string; name: string }[];
  types: { code: string; name: string }[];
}) {
  const extra = filters.kind !== "all" || filters.supplierId || filters.subcategoryCode;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={filters.q}
          maxLength={80}
          onChange={(event) => onChange({ q: event.target.value })}
          placeholder="Search listing, shop or type"
          aria-label="Search listing, shop or product type"
          className="min-w-0 flex-1"
        />
        <Button
          variant={open || extra ? "default" : "outline"}
          aria-expanded={open}
          aria-label={extra ? "Filters, some set" : "Filters"}
          onClick={onToggle}
        >
          <SlidersHorizontal data-icon="inline-start" aria-hidden />
          Filters
        </Button>
      </div>
      {open ? (
        <div className="flex flex-col gap-2">
          <Select
            value={filters.kind}
            onValueChange={(value) => {
              if (typeof value === "string") onChange({ kind: value as ReviewKind });
            }}
          >
            <SelectTrigger className="w-full" aria-label="New listings or changes">
              <SelectValue>
                {
                  REVIEW_KIND_OPTIONS.find((option) => option.value === filters.kind)
                    ?.label
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {REVIEW_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={filters.supplierId || "all"}
            onValueChange={(value) => {
              if (typeof value === "string")
                onChange({ supplierId: value === "all" ? "" : value });
            }}
          >
            <SelectTrigger className="w-full" aria-label="Shop">
              <SelectValue>
                {filters.supplierId
                  ? (shops.find((shop) => shop.id === filters.supplierId)?.name ?? "Shop")
                  : "Every shop"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">Every shop</SelectItem>
                {shops.map((shop) => (
                  <SelectItem key={shop.id} value={shop.id}>
                    {shop.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={filters.subcategoryCode || "all"}
            onValueChange={(value) => {
              if (typeof value === "string")
                onChange({ subcategoryCode: value === "all" ? "" : value });
            }}
          >
            <SelectTrigger className="w-full" aria-label="Product type">
              <SelectValue>
                {filters.subcategoryCode
                  ? (types.find((type) => type.code === filters.subcategoryCode)?.name ??
                    "Product type")
                  : "Every product type"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">Every product type</SelectItem>
                {types.map((type) => (
                  <SelectItem key={type.code} value={type.code}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {extra || filters.q ? (
            <Button variant="ghost" size="sm" className="self-start" onClick={onClear}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-1">
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="flex gap-3 p-2">
          <Skeleton className="size-12 shrink-0" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
