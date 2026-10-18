"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { OrderChatThread } from "@/components/client-shop-chat/OrderChatThread";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusMark } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getOrder, isApiError, listClientShopChats } from "@/lib/api/client";
import type { ClientShopChatListEntry } from "@/lib/api/types";
import { chatListLine, chatStatusChip, isFlagged } from "@/lib/client-shop-chat";
import { formatDateTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const VIEWS = [
  { value: "flagged", label: "Flagged" },
  { value: "all", label: "All" },
] as const;

type View = (typeof VIEWS)[number]["value"];

function listErrorMessage(err: unknown): string {
  if (isApiError(err) && err.kind === "forbidden") {
    return "This account cannot read order conversations.";
  }
  return "The order conversations could not be loaded. Try again.";
}

/**
 * Every client–shop order conversation for Operations and Super Admin
 * (gridgo-api `docs/ORDER_CLIENT_SHOP_CHAT_API.md`). Flagged threads first:
 * a reported message or one sender who kept sharing contact details. The
 * thread itself is the same view the order workspace shows.
 *
 * `?order=<id>` opens that order's conversation, so an inbox notice lands on
 * it. Below the desktop breakpoint the list and the thread take turns.
 */
export function OrderChatsDesk({ tree }: { tree: "ops" | "admin" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("order");

  const [view, setView] = useState<View>("flagged");
  const [threads, setThreads] = useState<ClientShopChatListEntry[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  /** How many rows the reader has paged to, so a live refresh keeps them. */
  const shown = useRef(PAGE_SIZE);

  const load = useSerializedLoad(
    useCallback(async () => {
      try {
        const page = await listClientShopChats({
          flagged: view === "flagged",
          limit: Math.min(100, shown.current),
        });
        setThreads(page.threads);
        setNextOffset(page.nextOffset);
        setError(null);
      } catch (err) {
        setError(listErrorMessage(err));
      }
    }, [view]),
  );

  useEffect(() => {
    shown.current = PAGE_SIZE;
    setThreads(null);
    setNextOffset(null);
    void load();
  }, [load]);

  useLiveReload(["chat"], load);

  async function loadMore() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listClientShopChats({
        flagged: view === "flagged",
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setThreads((current) => {
        const rows = current ?? [];
        const seen = new Set(rows.map((row) => row.orderId));
        return [...rows, ...page.threads.filter((row) => !seen.has(row.orderId))];
      });
      setNextOffset(page.nextOffset);
      shown.current += PAGE_SIZE;
    } catch (err) {
      setError(listErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  // Each row's order title, read once per order. Best effort: a row without
  // one still names the order by its reference.
  const wanted = useMemo(() => {
    const ids = (threads ?? []).map((row) => row.orderId);
    if (selected) ids.push(selected);
    return ids;
  }, [threads, selected]);
  useEffect(() => {
    const missing = wanted.filter((id) => !asked.current.has(id));
    if (!missing.length) return;
    for (const id of missing) asked.current.add(id);
    void Promise.all(
      missing.map((id) =>
        getOrder(id).then(
          (order) => [id, order.title || "Untitled order"] as const,
          () => null,
        ),
      ),
    ).then((rows) => {
      const found = rows.filter((row): row is readonly [string, string] => row !== null);
      if (found.length) {
        setTitles((current) => ({ ...current, ...Object.fromEntries(found) }));
      }
    });
  }, [wanted]);

  function open(orderId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (orderId) params.set("order", orderId);
    else params.delete("order");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  if (error && !threads) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid min-h-[36rem] gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside
        className={cn("gg-card min-w-0 flex-col gap-3", selected ? "hidden lg:flex" : "flex")}
      >
        <ToggleGroup
          value={[view]}
          onValueChange={(values) => {
            const next = values[0] as View | undefined;
            if (next) setView(next);
          }}
          variant="outline"
          spacing={0}
          aria-label="Which conversations"
        >
          {VIEWS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Order conversations">
          {threads === null ? (
            <p className="text-body text-text-muted m-0 px-1 py-3">Loading conversations…</p>
          ) : threads.length === 0 ? (
            view === "flagged" ? (
              <EmptyState
                title="Nothing flagged"
                body="A conversation shows here when someone reports a message, or when one person keeps sharing contact details."
              />
            ) : (
              <EmptyState
                title="No conversations yet"
                body="A conversation appears once the client or the shop writes on an accepted order."
              />
            )
          ) : (
            threads.map((entry) => {
              const status = chatStatusChip(entry.status);
              const active = entry.orderId === selected;
              return (
                <button
                  key={entry.orderId}
                  type="button"
                  role="listitem"
                  aria-current={active ? "true" : undefined}
                  onClick={() => open(entry.orderId)}
                  className={cn(
                    "mb-1 flex min-h-11 w-full flex-col items-start gap-1 rounded-[var(--radius-field)] px-3 py-2 text-left",
                    active ? "bg-muted" : "hover:bg-overlay-hover",
                  )}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span
                      className="text-body text-text-primary min-w-0 break-words"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {titles[entry.orderId] ?? `Order ${entry.orderId}`}
                    </span>
                    {entry.unread > 0 ? (
                      <span
                        className="text-caption text-text-primary shrink-0"
                        aria-label={`${entry.unread} unread`}
                      >
                        {entry.unread}
                      </span>
                    ) : null}
                  </span>
                  {titles[entry.orderId] ? (
                    <span className="text-caption text-text-muted break-all">
                      Order {entry.orderId}
                    </span>
                  ) : null}
                  <span className="text-caption text-text-secondary flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StatusMark tone={status.tone} icon={status.icon} label={status.label} />
                    {isFlagged(entry) ? (
                      <StatusMark tone="warning" icon="triangle-alert" label="Flagged" />
                    ) : null}
                  </span>
                  <span className="text-caption text-text-secondary">{chatListLine(entry)}</span>
                  <span className="text-caption text-text-muted">
                    Last activity {formatDateTime(entry.updatedAt)}
                  </span>
                </button>
              );
            })
          )}
        </div>
        {nextOffset !== null ? (
          <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Show more conversations"}
          </Button>
        ) : null}
        {error && threads ? (
          <p className="text-caption text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
      </aside>

      <section
        className={cn(
          "gg-card min-h-[28rem] min-w-0 flex-col gap-3",
          selected ? "flex" : "hidden lg:flex",
        )}
      >
        {selected ? (
          <>
            <div className="flex items-start gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="lg:hidden"
                aria-label="All conversations"
                onClick={() => open(null)}
              >
                <ChevronLeft />
              </Button>
              <div className="min-w-0 flex-1">
                <h2 className="text-h3 text-text-primary m-0 break-words">
                  {titles[selected] ?? "Order conversation"}
                </h2>
                <p className="text-caption text-text-muted m-0 mt-1 break-all">
                  Order {selected} ·{" "}
                  <Link
                    href={`/${tree}/orders/${encodeURIComponent(selected)}`}
                    className="text-text-secondary underline-offset-2 hover:underline"
                  >
                    Open the order
                  </Link>
                </p>
              </div>
            </div>
            <OrderChatThread
              key={selected}
              orderId={selected}
              sendVariant="primary"
              transcriptClassName="max-h-[60vh]"
              onLoaded={() => void load()}
            />
          </>
        ) : (
          <EmptyState
            title="Pick a conversation"
            body="Open one from the list to read it, with what each person actually typed beside what the other side saw."
          />
        )}
      </section>
    </div>
  );
}
