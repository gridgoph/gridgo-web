"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Info } from "lucide-react";
import { InboxPager, sliceInboxPage } from "@/components/chat/InboxPager";
import {
  deleteSupportChatThread,
  getSupportChatThread,
  listSupportChatThreads,
  openSupportChatStream,
  openSupportChatThread,
  replySupportChat,
  searchSupportChatPeople,
} from "@/lib/api/support-chat";
import { ApiError, uploadSupportChatImage } from "@/lib/api/client";
import {
  SUPPORT_CHAT_IMAGE_MAX_COUNT,
  validateSupportChatImage,
} from "@/lib/chatImages";
import type {
  SupportChatAttachment,
  SupportChatMessage,
  SupportChatPerson,
  SupportChatSenderRole,
  SupportChatThread,
} from "@/lib/api/types";
import { ChatAttachButton } from "@/components/chat/ChatAttachButton";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ConversationDetails } from "@/components/chat/ConversationDetails";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROLE_FILTERS = [
  { value: "all", label: "All roles" },
  { value: "client", label: "Clients" },
  { value: "supplier", label: "Shops" },
  { value: "rider", label: "Riders" },
  { value: "staff", label: "Staff" },
] as const;

function roleLabel(role: SupportChatSenderRole): string {
  if (role === "client") return "Client";
  if (role === "supplier") return "Shop";
  if (role === "rider") return "Rider";
  if (role === "super_admin") return "Admin";
  return "Operations";
}

export function supportChatCounterpart(thread: SupportChatThread): {
  name: string;
  email: string | null;
  role: SupportChatSenderRole;
} {
  if (thread.staffPeerUserId && thread.viewerUserId && thread.partyUserId === thread.viewerUserId) {
    return {
      name: thread.staffPeerName || thread.staffPeerEmail || "Desk",
      email: thread.staffPeerEmail ?? null,
      role: thread.staffPeerRole || "ops_admin",
    };
  }
  return {
    name: thread.partyName || thread.partyEmail || "Account",
    email: thread.partyEmail ?? null,
    role: thread.partyRole,
  };
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
  const [finding, setFinding] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState<SupportChatPerson[] | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [inboxPage, setInboxPage] = useState(0);
  const [peoplePage, setPeoplePage] = useState(0);
  const [messageQuery, setMessageQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SupportChatMessage[]>([]);
  const [photos, setPhotos] = useState<SupportChatAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => threads?.find((thread) => thread.id === selectedId) ?? null,
    [threads, selectedId],
  );
  const selectedPerson = selected ? supportChatCounterpart(selected) : null;
  const staffConversation = Boolean(selected?.staffPeerUserId);

  const loadThreads = useCallback(async (keepId?: string | null) => {
    setError(null);
    const rows = await listSupportChatThreads({
      role: role === "all" ? undefined : role,
      q: query,
    });
    setThreads((current) => {
      const kept = keepId ? current?.find((row) => row.id === keepId) : null;
      if (kept && !rows.some((row) => row.id === kept.id)) return [kept, ...rows];
      return rows;
    });
    setSelectedId((current) => {
      const preferred = keepId ?? current;
      if (preferred && (rows.some((row) => row.id === preferred) || preferred === keepId)) {
        return preferred;
      }
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

  const loadPhotos = useCallback(async (threadId: string) => {
    const detail = await getSupportChatThread(threadId, { media: true });
    setPhotos(detail.messages.flatMap((message) => message.attachments ?? []));
  }, []);

  const loadSearch = useCallback(async (threadId: string, q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    const detail = await getSupportChatThread(threadId, { q });
    setSearchResults(detail.messages);
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
    const timer = setTimeout(() => setSearchQuery(messageQuery), 250);
    return () => clearTimeout(timer);
  }, [messageQuery]);

  useEffect(() => {
    setInboxPage(0);
  }, [query, role]);

  useEffect(() => {
    setPeoplePage(0);
  }, [finding, peopleQuery]);

  useEffect(() => {
    setMessageQuery("");
    setSearchQuery("");
    setSearchResults([]);
    setPhotos([]);
    setPendingFiles([]);
    setConfirmDelete(false);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadThread(selectedId).catch((err) => setError(errorCopy(err)));
    void loadPhotos(selectedId).catch(() => setPhotos([]));
  }, [loadPhotos, loadThread, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void loadSearch(selectedId, searchQuery).catch(() => setSearchResults([]));
  }, [loadSearch, searchQuery, selectedId]);

  useEffect(() => {
    if (!finding) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setPeopleLoading(true);
      void searchSupportChatPeople({ q: peopleQuery, limit: 200 })
        .then((rows) => {
          if (!cancelled) setPeople(rows);
        })
        .catch((err) => {
          if (!cancelled) setError(errorCopy(err));
        })
        .finally(() => {
          if (!cancelled) setPeopleLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [finding, peopleQuery]);

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
    if (!selectedId || sending) return;
    if (!draft.trim() && !pendingFiles.length) return;
    setSending(true);
    try {
      const uploadedIds: string[] = [];
      for (const file of pendingFiles) {
        const stored = await uploadSupportChatImage(file);
        uploadedIds.push(stored.fileId);
      }
      const posted = uploadedIds.length
        ? await replySupportChat(selectedId, draft.trim(), uploadedIds)
        : await replySupportChat(selectedId, draft.trim());
      setDraft("");
      setPendingFiles([]);
      setMessages((current) => (
        current.some((row) => row.id === posted.message.id) ? current : [...current, posted.message]
      ));
      setThreads((current) => {
        if (!current) return current;
        const others = current.filter((row) => row.id !== posted.thread.id);
        return [posted.thread, ...others];
      });
      if (uploadedIds.length) {
        void loadPhotos(selectedId).catch(() => {});
      }
    } catch (err) {
      setError(errorCopy(err));
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
      setMessages([]);
    } catch (err) {
      setError(errorCopy(err));
    } finally {
      setDeleting(false);
    }
  }

  async function startWith(person: SupportChatPerson) {
    try {
      const opened = await openSupportChatThread({
        userId: person.userId,
        role: person.role,
      });
      setThreads((current) => {
        const rows = current ?? [];
        if (rows.some((row) => row.id === opened.thread.id)) {
          return rows.map((row) => (row.id === opened.thread.id ? opened.thread : row));
        }
        return [opened.thread, ...rows];
      });
      setSelectedId(opened.thread.id);
      setInboxPage(0);
      setFinding(false);
      setPeopleQuery("");
      setPeople(null);
    } catch (err) {
      setError(errorCopy(err));
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
    <>
    <div
      className={`grid min-h-[36rem] gap-4 ${
        detailsOpen
          ? "grid-cols-1 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]"
          : "lg:grid-cols-[18rem_minmax(0,1fr)]"
      }`}
    >
      <aside className={`gg-card flex-col gap-3 ${detailsOpen ? "hidden xl:flex" : "flex"}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-h3 text-text-primary m-0">Inbox</h2>
            <p className="text-caption text-text-muted m-0 mt-1">
              Find a client, shop, rider, or another desk account and write to them.
            </p>
          </div>
          <Button
            variant="secondary"
            type="button"
            aria-expanded={finding}
            onClick={() => {
              setFinding((open) => !open);
              setPeople(null);
              setPeopleQuery("");
            }}
          >
            New conversation
          </Button>
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
        {finding ? (
          <>
            <Input
              value={peopleQuery}
              onChange={(event) => setPeopleQuery(event.target.value)}
              placeholder="Search name or email"
              aria-label="Find a person"
              autoFocus
            />
            <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="People">
              {peopleLoading && !people ? (
                <p className="text-body text-text-muted m-0 px-1 py-3">Looking up people…</p>
              ) : !people?.length ? (
                <EmptyState
                  title="No matching accounts"
                  body="Try a name or email. Operations and admin can write to each other from here too."
                />
              ) : (
                sliceInboxPage(people, peoplePage).map((person) => (
                  <button
                    key={`${person.role}:${person.userId}`}
                    type="button"
                    aria-label={`${person.name}, ${roleLabel(person.role)}`}
                    onClick={() => void startWith(person)}
                    className="mb-1 flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-field)] px-3 py-2 text-left hover:bg-overlay-hover"
                  >
                    <span className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                      {person.name}
                    </span>
                    <span className="text-caption text-text-muted">
                      {roleLabel(person.role)}
                      {person.email ? ` · ${person.email}` : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
            {people?.length ? (
              <InboxPager
                page={peoplePage}
                total={people.length}
                onPageChange={setPeoplePage}
                label="People pages"
              />
            ) : null}
          </>
        ) : (
          <>
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
                  body="Start one from New conversation, or wait until a client, shop or rider writes in."
                />
              ) : (
                sliceInboxPage(threads, inboxPage).map((thread) => {
                  const person = supportChatCounterpart(thread);
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
                          {person.name}
                        </span>
                        {thread.unreadCount > 0 ? (
                          <span className="text-caption text-text-primary">{thread.unreadCount}</span>
                        ) : null}
                      </span>
                      <span className="text-caption text-text-muted">
                        {roleLabel(person.role)}
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
            {threads?.length ? (
              <InboxPager page={inboxPage} total={threads.length} onPageChange={setInboxPage} />
            ) : null}
          </>
        )}
      </aside>

      <section className={`gg-card flex min-h-[28rem] min-w-0 flex-col gap-3 ${detailsOpen ? "hidden xl:flex" : "flex"}`}>
        {!selected || !selectedPerson ? (
          <EmptyState
            title="Pick a conversation"
            body="Find someone in New conversation, or open a thread that already has messages."
          />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className="min-w-0 rounded-[var(--radius-field)] text-left hover:bg-overlay-hover"
                onClick={() => setDetailsOpen(true)}
              >
                <h2 className="text-h3 text-text-primary m-0">{selectedPerson.name}</h2>
                <p className="text-caption text-text-muted m-0 mt-1">
                  {roleLabel(selectedPerson.role)}
                  {selectedPerson.email ? ` · ${selectedPerson.email}` : ""}
                </p>
              </button>
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
              {messages.length === 0 ? (
                <p className="text-body text-text-muted m-0">No messages in this thread yet.</p>
              ) : (
                messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    counterpartLabel={message.senderName || roleLabel(selectedPerson.role)}
                  />
                ))
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
                  placeholder={staffConversation ? "Write a message" : "Reply as Operations"}
                  aria-label={staffConversation ? "Write a message" : "Reply as Operations"}
                  rows={2}
                  maxLength={4000}
                  className="min-w-0 flex-1"
                />
                <Button
                  variant="primary"
                  disabled={sending || (!draft.trim() && !pendingFiles.length)}
                  onClick={() => void send()}
                >
                  Send
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      {selected && selectedPerson ? (
        <aside
          className={`gg-card min-h-[28rem] min-w-0 w-full flex-col gap-3 ${
            detailsOpen ? "flex" : "hidden"
          }`}
        >
          <ConversationDetails
            name={selectedPerson.name}
            subtitle={[roleLabel(selectedPerson.role), selectedPerson.email].filter(Boolean).join(" · ")}
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
    </>
  );
}
