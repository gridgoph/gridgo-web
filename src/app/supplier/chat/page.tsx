"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Info, Plus } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { ChatAttachButton } from "@/components/chat/ChatAttachButton";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { ConversationDetails } from "@/components/chat/ConversationDetails";
import { InboxPager, sliceInboxPage } from "@/components/chat/InboxPager";
import { ApiError, uploadSupportChatImage } from "@/lib/api/client";
import { openSupportChatStream } from "@/lib/api/support-chat";
import {
  deleteSupportChatThread,
  getSupportChatMe,
  getSupportChatThread,
  markSupportChatRead,
  openSupportChatThread,
  sendSupportChatMessage,
} from "@/lib/api/support-chat-party";
import {
  SUPPORT_CHAT_IMAGE_MAX_COUNT,
  validateSupportChatImage,
} from "@/lib/chatImages";
import type { SupportChatAttachment, SupportChatMessage, SupportChatThread } from "@/lib/api/types";
import { ChatTranscript } from "@/components/chat/ChatTranscript";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const SIDE_BY_SIDE_QUERY = "(min-width: 1024px)";

function sideBySide(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(SIDE_BY_SIDE_QUERY).matches
    : true;
}

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
  const [threadOpen, setThreadOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inboxNonce, setInboxNonce] = useState(0);
  const [threadNonce, setThreadNonce] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [inboxPage, setInboxPage] = useState(0);
  const [messageQuery, setMessageQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SupportChatMessage[]>([]);
  const [photos, setPhotos] = useState<SupportChatAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    if (!selectedId) {
      setPhotos([]);
      return;
    }
    let cancelled = false;
    void getSupportChatThread(selectedId, { media: true })
      .then((detail) => {
        if (!cancelled) {
          setPhotos(detail.messages.flatMap((message) => message.attachments ?? []));
        }
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, threadNonce]);

  useEffect(() => {
    if (!selectedId || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    void getSupportChatThread(selectedId, { q: searchQuery })
      .then((detail) => {
        if (!cancelled) setSearchResults(detail.messages);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, selectedId]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(messageQuery), 250);
    return () => clearTimeout(timer);
  }, [messageQuery]);

  useEffect(() => {
    setMessageQuery("");
    setSearchQuery("");
    setSearchResults([]);
    setPhotos([]);
    setPendingFiles([]);
    setConfirmDelete(false);
  }, [selectedId]);

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
      if (!sideBySide()) setThreadOpen(true);
      setInboxPage(0);
    } catch (err) {
      setError(errorCopy(err, "start a new chat"));
    } finally {
      setOpening(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!selectedId || sending) return;
    if (!body && !pendingFiles.length) return;
    setSending(true);
    setError(null);
    try {
      const uploadedIds: string[] = [];
      for (const file of pendingFiles) {
        const stored = await uploadSupportChatImage(file);
        uploadedIds.push(stored.fileId);
      }
      const posted = uploadedIds.length
        ? await sendSupportChatMessage(body, selectedId, uploadedIds)
        : await sendSupportChatMessage(body, selectedId);
      setDraft("");
      setPendingFiles([]);
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

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...pendingFiles];
    for (const file of Array.from(list)) {
      const problem = validateSupportChatImage(file);
      if (problem) {
        setError(problem);
        return;
      }
      if (next.length >= SUPPORT_CHAT_IMAGE_MAX_COUNT) {
        setError(`A message can include up to ${SUPPORT_CHAT_IMAGE_MAX_COUNT} photos.`);
        return;
      }
      next.push(file);
    }
    setError(null);
    setPendingFiles(next);
  }

  async function removeChat() {
    if (!selectedId || deleting) return;
    setDeleting(true);
    try {
      const id = selectedId;
      await deleteSupportChatThread(id);
      setConfirmDelete(false);
      setThreads((current) => (current ?? []).filter((row) => row.id !== id));
      setSelectedId((current) => (current === id ? null : current));
      setThreadOpen(false);
      setMessages([]);
    } catch (err) {
      setError(errorCopy(err, "delete this chat"));
    } finally {
      setDeleting(false);
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
      <div
        className={`grid min-h-[36rem] gap-4 ${
          detailsOpen
            ? "grid-cols-1 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]"
            : "lg:grid-cols-[18rem_minmax(0,1fr)]"
        }`}
      >
        <aside
          className={`gg-card flex-col gap-3 ${
            detailsOpen ? "hidden xl:flex" : threadOpen ? "hidden lg:flex" : "flex"
          }`}
        >
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
              sliceInboxPage(threads, inboxPage).map((thread) => {
                const preview = thread.lastMessagePreview?.trim() || "No messages yet";
                const active = thread.id === selectedId;
                return (
                  <div key={thread.id} role="listitem">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(thread.id);
                        if (!sideBySide()) setThreadOpen(true);
                      }}
                      aria-current={active ? "true" : undefined}
                      aria-label={`Operations, ${preview}`}
                      className={cn(
                        "mb-1 flex w-full items-center gap-2 rounded-[var(--radius-field)] px-3 py-2 text-left",
                        active ? "bg-muted" : "hover:bg-overlay-hover",
                      )}
                    >
                      <ChatAvatar name="Operations" />
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
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
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
          {threads?.length ? (
            <InboxPager page={inboxPage} total={threads.length} onPageChange={setInboxPage} />
          ) : null}
        </aside>

        <section
          className={`gg-card min-h-[28rem] min-w-0 flex-col gap-3 ${
            detailsOpen ? "hidden xl:flex" : threadOpen ? "flex" : "hidden lg:flex"
          }`}
        >
          {!selectedId ? (
            <EmptyState
              title="Pick a conversation"
              body="Open one of your chats with Operations, or start a new one."
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {threadOpen ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="lg:hidden"
                      aria-label="Back to inbox"
                      onClick={() => setThreadOpen(false)}
                    >
                      <ChevronLeft />
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 rounded-[var(--radius-field)] text-left hover:bg-overlay-hover"
                    onClick={() => setDetailsOpen(true)}
                  >
                    <ChatAvatar name="Operations" />
                    <span className="min-w-0">
                      <h2 className="text-h3 text-text-primary m-0">Operations</h2>
                      <p className="text-caption text-text-muted m-0 mt-1">
                        GRIDGO operations
                        {selected?.lastMessageAt
                          ? ` · ${formatDateTime(selected.lastMessageAt)}`
                          : ""}
                      </p>
                    </span>
                  </button>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Conversation details"
                  aria-expanded={detailsOpen}
                  onClick={() => setDetailsOpen((open) => !open)}
                >
                  <Info />
                </Button>
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
                  <ChatTranscript
                    messages={messages}
                    party={{ kind: "operations" }}
                    otherName={() => "Operations"}
                  />
                )}
                <div ref={endRef} />
              </div>
              <div className="flex flex-col gap-2">
                {pendingFiles.length ? (
                  <p className="text-caption text-text-muted m-0">
                    {pendingFiles.length === 1
                      ? pendingFiles[0].name
                      : `${pendingFiles.length} photos ready to send`}
                  </p>
                ) : null}
                <div className="flex items-end gap-2">
                  <ChatAttachButton disabled={sending} onFiles={addFiles} />
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Write to Operations"
                    aria-label="Message Operations"
                    rows={2}
                    maxLength={4000}
                    disabled={sending}
                    className="min-w-0 flex-1"
                  />
                  <Button
                    variant="primary"
                    disabled={sending || (!draft.trim() && !pendingFiles.length)}
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

        {selectedId ? (
          <aside
            className={`gg-card min-h-[28rem] min-w-0 w-full flex-col gap-3 ${
              detailsOpen ? "flex" : "hidden"
            }`}
          >
            <ConversationDetails
              name="Operations"
              subtitle="GRIDGO operations"
              imageUrl={messages.find((message) => !message.mine)?.senderImageUrl}
              searchValue={messageQuery}
              onSearchValueChange={setMessageQuery}
              searchResults={searchResults}
              photos={photos}
              onDelete={() => setConfirmDelete(true)}
              onClose={() => setDetailsOpen(false)}
            />
          </aside>
        ) : null}
      </div>
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to delete this chat?</AlertDialogTitle>
              <AlertDialogDescription>
                This conversation and its photos are removed for everyone in it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deleting}
                onClick={() => void removeChat()}
              >
                Delete chat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}
