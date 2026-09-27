"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { openSupportChatStream } from "@/lib/api/support-chat";
import {
  getSupportChatMe,
  getSupportChatThread,
  markSupportChatRead,
  openSupportChatThread,
  sendSupportChatMessage,
} from "@/lib/api/support-chat-party";
import type { SupportChatMessage, SupportChatThread } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function errorCopy(error: unknown, action: string): string {
  if (error instanceof ApiError && error.status === 403) {
    return "This chat is only available to shop accounts.";
  }
  if (error instanceof ApiError) {
    return `Could not ${action}. Check the API and try again.`;
  }
  return `Could not ${action}. Try again.`;
}

function replaceThread(
  current: SupportChatThread[] | null,
  thread: SupportChatThread,
): SupportChatThread[] {
  const rows = current ?? [];
  if (!rows.some((row) => row.id === thread.id)) return [thread, ...rows];
  return rows.map((row) => (row.id === thread.id ? thread : row));
}

function prependThread(
  current: SupportChatThread[] | null,
  thread: SupportChatThread,
): SupportChatThread[] {
  const rows = current ?? [];
  return [thread, ...rows.filter((row) => row.id !== thread.id)];
}

/**
 * This shop's Operations conversations. Same personal thread as the supplier
 * app: history, a new chat, one open thread, send, mark read, and the live
 * stream. The staff desk is a different surface.
 */
export default function SupplierChatPage() {
  const [threads, setThreads] = useState<SupportChatThread[] | null>(null);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inboxNonce, setInboxNonce] = useState(0);
  const [threadNonce, setThreadNonce] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getSupportChatMe()
      .then((me) => {
        if (cancelled) return;
        setThreads(me.threads ?? (me.thread ? [me.thread] : []));
      })
      .catch((err) => {
        if (cancelled) return;
        setThreads(null);
        setError(errorCopy(err, "open Operations"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inboxNonce]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setThreadLoading(false);
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    setError(null);
    setMessages([]);
    void (async () => {
      try {
        const detail = await getSupportChatThread(selectedId);
        if (cancelled) return;
        setMessages((current) => {
          const fromServer = detail.messages ?? [];
          const known = new Set(fromServer.map((row) => row.id));
          return [...fromServer, ...current.filter((row) => !known.has(row.id))];
        });
        setThreads((current) => replaceThread(current, detail.thread));
        const read = await markSupportChatRead(detail.thread.id);
        if (cancelled) return;
        const fresh = read.thread;
        if (fresh) setThreads((current) => replaceThread(current, fresh));
      } catch (err) {
        if (!cancelled) setError(errorCopy(err, "open this conversation"));
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, threadNonce]);

  useEffect(() => {
    const stream = openSupportChatStream({
      onEvent: (event) => {
        setThreads((current) => prependThread(current, event.thread));
        const openId = selectedIdRef.current;
        if (!openId || event.thread.id !== openId) return;
        setMessages((current) =>
          current.some((row) => row.id === event.message.id)
            ? current
            : [...current, event.message],
        );
        if (event.message.mine) return;
        void markSupportChatRead(event.thread.id)
          .then((result) => {
            const fresh = result.thread;
            if (fresh) setThreads((current) => replaceThread(current, fresh));
          })
          .catch(() => {});
      },
    });
    return () => stream.close();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, selectedId]);

  async function openNew() {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      const opened = await openSupportChatThread();
      setThreads((current) => replaceThread(current, opened.thread));
      setSelectedId(opened.thread.id);
    } catch (err) {
      setError(errorCopy(err, "start a new chat"));
    } finally {
      setOpening(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!selectedId || !body || sending) return;
    setSending(true);
    setError(null);
    try {
      const posted = await sendSupportChatMessage(body, selectedId);
      setDraft("");
      setSelectedId(posted.thread.id);
      setMessages((current) =>
        current.some((row) => row.id === posted.message.id)
          ? current
          : [...current, posted.message],
      );
      setThreads((current) => prependThread(current, posted.thread));
    } catch (err) {
      setError(errorCopy(err, "send that message"));
    } finally {
      setSending(false);
    }
  }

  function retry() {
    if (!threads) {
      setInboxNonce((n) => n + 1);
      return;
    }
    if (selectedId) setThreadNonce((n) => n + 1);
    else setInboxNonce((n) => n + 1);
  }

  if (error && !threads) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        }
      />
    );
  }

  const selected = threads?.find((thread) => thread.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Your conversations with Operations. Ask about a job, a payout, or anything the
        desk needs to settle.
      </p>
      {error && threads ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-card border border-error bg-surface p-4"
        >
          <p className="text-body text-text-secondary m-0">{error}</p>
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        </div>
      ) : null}
      <div className="grid min-h-[36rem] gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="gg-card flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-h3 text-text-primary m-0">Operations</h2>
              <p className="text-caption text-text-muted m-0 mt-1">Your conversations</p>
            </div>
            <Button
              variant="secondary"
              disabled={opening || (loading && !threads)}
              aria-busy={opening}
              onClick={() => void openNew()}
            >
              <Plus />
              New chat
            </Button>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            role="list"
            aria-label="Conversations"
          >
            {loading && !threads ? (
              <p className="text-body text-text-muted m-0 px-1 py-3">
                Loading conversations…
              </p>
            ) : !threads?.length ? (
              <EmptyState
                title="No conversations yet"
                body="Start a chat with Operations. It stays here so you can come back to it."
                action={
                  <Button
                    variant="secondary"
                    disabled={opening}
                    onClick={() => void openNew()}
                  >
                    New chat
                  </Button>
                }
              />
            ) : (
              threads.map((thread) => {
                const preview = thread.lastMessagePreview?.trim() || "No messages yet";
                const active = thread.id === selectedId;
                return (
                  <div key={thread.id} role="listitem">
                    <button
                      type="button"
                      onClick={() => setSelectedId(thread.id)}
                      aria-current={active ? "true" : undefined}
                      aria-label={`Operations, ${preview}`}
                      className={cn(
                        "mb-1 flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-field)] px-3 py-2 text-left",
                        active ? "bg-muted" : "hover:bg-overlay-hover",
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span
                          className="text-body text-text-primary m-0"
                          style={{ fontFamily: "var(--font-medium)" }}
                        >
                          Operations
                        </span>
                        {thread.lastMessageAt ? (
                          <span className="text-caption text-text-muted">
                            {formatDateTime(thread.lastMessageAt)}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="text-caption text-text-secondary line-clamp-2 min-w-0">
                          {preview}
                        </span>
                        {thread.unreadCount > 0 ? (
                          <span className="text-caption text-text-primary">
                            {thread.unreadCount}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <section className="gg-card flex min-h-[28rem] min-w-0 flex-col gap-3">
          {!selectedId ? (
            <EmptyState
              title="Pick a conversation"
              body="Open one of your chats with Operations, or start a new one."
            />
          ) : (
            <>
              <div>
                <h2 className="text-h3 text-text-primary m-0">Operations</h2>
                <p className="text-caption text-text-muted m-0 mt-1">
                  GRIDGO operations
                  {selected?.lastMessageAt
                    ? ` · ${formatDateTime(selected.lastMessageAt)}`
                    : ""}
                </p>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                {threadLoading && messages.length === 0 ? (
                  <p className="text-body text-text-muted m-0">Loading messages…</p>
                ) : messages.length === 0 && !error ? (
                  <EmptyState
                    title="No messages yet"
                    body="Ask about a job, a payout, or anything the desk needs to settle. They write back here."
                  />
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        message.mine ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-[var(--radius-field)] border border-border px-3 py-2",
                          message.mine ? "bg-muted" : "bg-card",
                        )}
                      >
                        <p className="text-body text-text-primary m-0 whitespace-pre-wrap">
                          {message.body}
                        </p>
                        <p className="text-caption text-text-muted m-0 mt-1">
                          {message.mine ? "You" : "Operations"}
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
                  placeholder="Write to Operations"
                  aria-label="Message Operations"
                  rows={3}
                  maxLength={4000}
                  disabled={sending}
                />
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    disabled={sending || !draft.trim()}
                    aria-busy={sending}
                    onClick={() => void send()}
                  >
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
