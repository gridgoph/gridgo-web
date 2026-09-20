"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  getSupportChatThread,
  listSupportChatThreads,
  openSupportChatStream,
  replySupportChat,
} from "@/lib/api/support-chat";
import { ApiError } from "@/lib/api/client";
import type { SupportChatMessage, SupportChatPartyRole, SupportChatThread } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROLE_FILTERS = [
  { value: "all", label: "All roles" },
  { value: "client", label: "Clients" },
  { value: "supplier", label: "Shops" },
  { value: "rider", label: "Riders" },
] as const;

function roleLabel(role: SupportChatPartyRole): string {
  if (role === "client") return "Client";
  if (role === "supplier") return "Shop";
  return "Rider";
}

function errorCopy(error: unknown): string {
  if (error instanceof ApiError) {
    return "Could not load the chat desk. Confirm the API is running and try again.";
  }
  return "Could not load the chat desk. Try again.";
}

export function SupportChatDesk() {
  const [threads, setThreads] = useState<SupportChatThread[] | null>(null);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [role, setRole] = useState<(typeof ROLE_FILTERS)[number]["value"]>("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => threads?.find((thread) => thread.id === selectedId) ?? null,
    [threads, selectedId],
  );

  const loadThreads = useCallback(async (keepId?: string | null) => {
    setError(null);
    const rows = await listSupportChatThreads({
      role: role === "all" ? undefined : role,
      q: query,
    });
    setThreads(rows);
    setSelectedId((current) => {
      const preferred = keepId ?? current;
      if (preferred && rows.some((row) => row.id === preferred)) return preferred;
      return rows[0]?.id ?? null;
    });
    return rows;
  }, [query, role]);

  const loadThread = useCallback(async (threadId: string) => {
    const detail = await getSupportChatThread(threadId);
    setMessages(detail.messages);
    setThreads((current) =>
      (current ?? []).map((row) => (row.id === detail.thread.id ? detail.thread : row)),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadThreads()
      .catch((err) => {
        if (!cancelled) {
          setThreads(null);
          setError(errorCopy(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadThread(selectedId).catch((err) => setError(errorCopy(err)));
  }, [loadThread, selectedId]);

  useEffect(() => {
    const stream = openSupportChatStream({
      onEvent: (event) => {
        setThreads((current) => {
          if (!current) return current;
          const others = current.filter((row) => row.id !== event.thread.id);
          return [event.thread, ...others];
        });
        if (event.thread.id === selectedId) {
          setMessages((current) => (
            current.some((row) => row.id === event.message.id)
              ? current
              : [...current, event.message]
          ));
        }
      },
    });
    return () => stream.close();
  }, [selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, selectedId]);

  async function send() {
    if (!selectedId || !draft.trim() || sending) return;
    setSending(true);
    try {
      const posted = await replySupportChat(selectedId, draft.trim());
      setDraft("");
      setMessages((current) => (
        current.some((row) => row.id === posted.message.id) ? current : [...current, posted.message]
      ));
      setThreads((current) => {
        if (!current) return current;
        const others = current.filter((row) => row.id !== posted.thread.id);
        return [posted.thread, ...others];
      });
    } catch (err) {
      setError(errorCopy(err));
    } finally {
      setSending(false);
    }
  }

  if (error && !threads) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void loadThreads()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid min-h-[36rem] gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="gg-card flex flex-col gap-3">
        <div>
          <h2 className="text-h3 text-text-primary m-0">Inbox</h2>
          <p className="text-caption text-text-muted m-0 mt-1">
            Clients, shops and riders write here. One thread each.
          </p>
        </div>
        <ToggleGroup
          value={[role]}
          onValueChange={(values) => {
            const next = values[0] as typeof role | undefined;
            if (next) setRole(next);
          }}
          variant="outline"
          spacing={0}
          aria-label="Filter conversations by role"
          className="flex flex-wrap gap-1"
        >
          {ROLE_FILTERS.map((filter) => (
            <ToggleGroupItem key={filter.value} value={filter.value}>
              {filter.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email or preview"
          aria-label="Search conversations"
        />
        <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Conversations">
          {loading && !threads ? (
            <p className="text-body text-text-muted m-0 px-1 py-3">Loading conversations…</p>
          ) : !threads?.length ? (
            <EmptyState
              title="No conversations yet"
              body="A thread appears here the first time a client, shop or rider writes to Operations."
            />
          ) : (
            threads.map((thread) => {
              const active = thread.id === selectedId;
              return (
                <button
                  key={thread.id}
                  type="button"
                  role="listitem"
                  onClick={() => setSelectedId(thread.id)}
                  className={cn(
                    "mb-1 flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-field)] px-3 py-2 text-left",
                    active ? "bg-muted" : "hover:bg-overlay-hover",
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                      {thread.partyName || thread.partyEmail || "Account"}
                    </span>
                    {thread.unreadCount > 0 ? (
                      <span className="text-caption text-text-primary">{thread.unreadCount}</span>
                    ) : null}
                  </span>
                  <span className="text-caption text-text-muted">
                    {roleLabel(thread.partyRole)}
                    {thread.lastMessageAt ? ` · ${formatDateTime(thread.lastMessageAt)}` : ""}
                  </span>
                  {thread.lastMessagePreview ? (
                    <span className="text-caption text-text-secondary line-clamp-2">
                      {thread.lastMessagePreview}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="gg-card flex min-h-[28rem] flex-col gap-3">
        {!selected ? (
          <EmptyState
            title="Pick a conversation"
            body="Replies from this desk reach the person on the other side of the thread."
          />
        ) : (
          <>
            <div>
              <h2 className="text-h3 text-text-primary m-0">
                {selected.partyName || selected.partyEmail || "Account"}
              </h2>
              <p className="text-caption text-text-muted m-0 mt-1">
                {roleLabel(selected.partyRole)}
                {selected.partyEmail ? ` · ${selected.partyEmail}` : ""}
              </p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-body text-text-muted m-0">No messages in this thread yet.</p>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex", message.mine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-[var(--radius-field)] border border-border px-3 py-2",
                        message.mine ? "bg-muted" : "bg-card",
                      )}
                    >
                      <p className="text-body text-text-primary m-0 whitespace-pre-wrap">{message.body}</p>
                      <p className="text-caption text-text-muted m-0 mt-1">
                        {message.mine ? "You" : message.senderName || roleLabel(selected.partyRole)}
                        {` · ${formatDateTime(message.createdAt)}`}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>
            <div className="flex flex-col gap-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Reply as Operations"
                aria-label="Reply as Operations"
                rows={3}
                maxLength={4000}
              />
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  disabled={sending || !draft.trim()}
                  onClick={() => void send()}
                >
                  Send
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
