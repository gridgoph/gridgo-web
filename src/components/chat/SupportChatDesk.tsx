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
import { ChevronLeft, Info } from "lucide-react";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
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
  SupportChatThreadRole,
} from "@/lib/api/types";
import { ChatAttachButton } from "@/components/chat/ChatAttachButton";
import { ChatTranscript } from "@/components/chat/ChatTranscript";
import { ConversationDetails } from "@/components/chat/ConversationDetails";
import {
  groupSupportChatThreads,
  mergeSupportChatMessages,
  supportChatCounterpartUserId,
} from "@/components/chat/conversations";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Two panes from the desktop breakpoint; below it the conversation covers the inbox. */
const SIDE_BY_SIDE_QUERY = "(min-width: 1024px)";

function sideBySide(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(SIDE_BY_SIDE_QUERY).matches
    : true;
}

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
  imageUrl: string | null;
} {
  if (thread.staffPeerUserId && thread.viewerUserId && thread.partyUserId === thread.viewerUserId) {
    return {
      name: thread.staffPeerName || thread.staffPeerEmail || "Desk",
      email: thread.staffPeerEmail ?? null,
      role: thread.staffPeerRole || "ops_admin",
      imageUrl: thread.staffPeerImageUrl ?? null,
    };
  }
  return {
    name: thread.partyName || thread.partyEmail || "Account",
    email: thread.partyEmail ?? null,
    role: thread.partyRole,
    imageUrl: thread.partyImageUrl ?? null,
  };
}

export { supportChatCounterpartUserId };

function errorCopy(error: unknown): string {
  if (error instanceof ApiError) {
    return "Could not load the chat desk. Confirm the API is running and try again.";
  }
  return "Could not load the chat desk. Try again.";
}

/** `?with=<userId>&role=<client|supplier|rider>` from a Message link, or null. */
export function chatOpenWith(
  params: Pick<URLSearchParams, "get">,
): { userId: string; role: SupportChatThreadRole } | null {
  const userId = params.get("with")?.trim();
  const role = params.get("role");
  if (!userId || (role !== "rider" && role !== "client" && role !== "supplier")) return null;
  return { userId, role };
}

type Props = {
  /**
   * Open (or create) the thread with this person on arrival, e.g. a stale
   * rider's Message action (`?with=<userId>&role=rider`).
   */
  openWith?: { userId: string; role: SupportChatThreadRole } | null;
};

export function SupportChatDesk({ openWith = null }: Props = {}) {
  const [threads, setThreads] = useState<SupportChatThread[] | null>(null);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  /** The selected person (counterpart user id): their threads read as one conversation. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
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

  const conversations = useMemo(() => groupSupportChatThreads(threads ?? []), [threads]);
  const selected = useMemo(
    () => conversations.find((conversation) => conversation.key === selectedKey) ?? null,
    [conversations, selectedKey],
  );
  /** Replies go to the person's most recently active thread. */
  const replyThread = selected?.lead ?? null;
  const selectedPerson = replyThread ? supportChatCounterpart(replyThread) : null;
  const staffConversation = Boolean(replyThread?.staffPeerUserId);
  const threadIdsKey = selected ? selected.threads.map((thread) => thread.id).join(",") : "";

  const loadThreads = useCallback(async () => {
    setError(null);
    const rows = await listSupportChatThreads({
      role: role === "all" ? undefined : role,
      q: query,
    });
    setThreads(rows);
    setSelectedKey((current) => {
      if (current && rows.some((row) => supportChatCounterpartUserId(row) === current)) {
        return current;
      }
      return rows[0] ? supportChatCounterpartUserId(rows[0]) : null;
    });
    return rows;
  }, [query, role]);

  const loadConversation = useCallback(async (threadIds: string[]) => {
    const details = await Promise.all(threadIds.map((id) => getSupportChatThread(id)));
    const fresh = new Map(details.map((detail) => [detail.thread.id, detail.thread]));
    setThreads((current) => (current ?? []).map((row) => fresh.get(row.id) ?? row));
    return mergeSupportChatMessages(...details.map((detail) => detail.messages));
  }, []);

  const loadPhotos = useCallback(async (threadIds: string[]) => {
    const details = await Promise.all(
      threadIds.map((id) => getSupportChatThread(id, { media: true })),
    );
    return mergeSupportChatMessages(...details.map((detail) => detail.messages)).flatMap(
      (message) => message.attachments ?? [],
    );
  }, []);

  const loadSearch = useCallback(async (threadIds: string[], q: string) => {
    if (!q.trim()) return [];
    const details = await Promise.all(threadIds.map((id) => getSupportChatThread(id, { q })));
    return mergeSupportChatMessages(...details.map((detail) => detail.messages));
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
  }, [selectedKey]);

  useEffect(() => {
    if (!threadIdsKey) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const ids = threadIdsKey.split(",");
    void loadConversation(ids)
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(errorCopy(err));
      });
    void loadPhotos(ids)
      .then((rows) => {
        if (!cancelled) setPhotos(rows);
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loadConversation, loadPhotos, threadIdsKey]);

  useEffect(() => {
    if (!threadIdsKey) return;
    let cancelled = false;
    void loadSearch(threadIdsKey.split(","), searchQuery)
      .then((rows) => {
        if (!cancelled) setSearchResults(rows);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSearch, searchQuery, threadIdsKey]);

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
        if (supportChatCounterpartUserId(event.thread) === selectedKey) {
          setMessages((current) => mergeSupportChatMessages(current, [event.message]));
        }
      },
    });
    return () => stream.close();
  }, [selectedKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, selectedKey]);

  async function send() {
    if (!replyThread || sending) return;
    if (!draft.trim() && !pendingFiles.length) return;
    setSending(true);
    try {
      const uploadedIds: string[] = [];
      for (const file of pendingFiles) {
        const stored = await uploadSupportChatImage(file);
        uploadedIds.push(stored.fileId);
      }
      const posted = uploadedIds.length
        ? await replySupportChat(replyThread.id, draft.trim(), uploadedIds)
        : await replySupportChat(replyThread.id, draft.trim());
      setDraft("");
      setPendingFiles([]);
      setMessages((current) => mergeSupportChatMessages(current, [posted.message]));
      setThreads((current) => {
        if (!current) return current;
        const others = current.filter((row) => row.id !== posted.thread.id);
        return [posted.thread, ...others];
      });
      if (uploadedIds.length && selected) {
        void loadPhotos(selected.threads.map((thread) => thread.id))
          .then(setPhotos)
          .catch(() => {});
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
    if (!selected || deleting) return;
    setDeleting(true);
    try {
      const { key } = selected;
      const ids = selected.threads.map((thread) => thread.id);
      for (const id of ids) await deleteSupportChatThread(id);
      setConfirmDelete(false);
      setThreads((current) => (current ?? []).filter((row) => !ids.includes(row.id)));
      setSelectedKey((current) => (current === key ? null : current));
      setThreadOpen(false);
      setMessages([]);
    } catch (err) {
      setError(errorCopy(err));
    } finally {
      setDeleting(false);
    }
  }

  async function startWith(person: Pick<SupportChatPerson, "userId" | "role">) {
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
      setSelectedKey(supportChatCounterpartUserId(opened.thread));
      if (!sideBySide()) setThreadOpen(true);
      setInboxPage(0);
      setFinding(false);
      setPeopleQuery("");
      setPeople(null);
    } catch (err) {
      setError(errorCopy(err));
    }
  }

  // Arriving with someone to write to: open their thread once the inbox has
  // loaded, so it sits in the list like any other conversation.
  const openedWith = useRef<string | null>(null);
  const openWithKey = openWith ? `${openWith.role}:${openWith.userId}` : null;
  const inboxLoaded = threads !== null;
  const startWithRef = useRef(startWith);
  startWithRef.current = startWith;
  useEffect(() => {
    if (!openWith || !openWithKey || !inboxLoaded || openedWith.current === openWithKey) {
      return;
    }
    openedWith.current = openWithKey;
    void startWithRef.current(openWith);
  }, [openWith, openWithKey, inboxLoaded]);

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
      <aside
        className={`gg-card min-w-0 flex-col gap-3 ${
          detailsOpen ? "hidden xl:flex" : threadOpen ? "hidden lg:flex" : "flex"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-h3 text-text-primary m-0">Inbox</h2>
          <Button
            variant="secondary"
            type="button"
            aria-expanded={finding}
            onClick={() => {
              setFinding((open) => {
                const next = !open;
                if (next) {
                  setDetailsOpen(false);
                  if (!sideBySide()) setThreadOpen(true);
                } else if (!sideBySide()) {
                  setThreadOpen(false);
                }
                return next;
              });
              setPeople(null);
              setPeopleQuery("");
            }}
          >
            New conversation
          </Button>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email or preview"
          aria-label="Search conversations"
        />
        {/* The five filters overflow the 18rem inbox, so the strip keeps a visible scrollbar. */}
        <div
          data-testid="role-filter-scroller"
          className="min-w-0 overflow-x-auto pb-2 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
        >
        <ToggleGroup
          value={[role]}
          onValueChange={(values) => {
            const next = values[0] as typeof role | undefined;
            if (next) setRole(next);
          }}
          variant="outline"
          spacing={0}
          aria-label="Filter conversations by role"
          className="w-max flex-nowrap"
        >
          {ROLE_FILTERS.map((filter) => (
            <ToggleGroupItem key={filter.value} value={filter.value}>
              {filter.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Conversations">
              {loading && !threads ? (
                <p className="text-body text-text-muted m-0 px-1 py-3">Loading conversations…</p>
              ) : !conversations.length ? (
                <EmptyState
                  title="No conversations yet"
                  body="Start one from New conversation, or wait until a client, shop or rider writes in."
                />
              ) : (
                sliceInboxPage(conversations, inboxPage).map((conversation) => {
                  const thread = conversation.lead;
                  const person = supportChatCounterpart(thread);
                  const active = conversation.key === selectedKey;
                  return (
                    <button
                      key={conversation.key}
                      type="button"
                      role="listitem"
                      onClick={() => {
                        setSelectedKey(conversation.key);
                        setFinding(false);
                        setPeople(null);
                        setPeopleQuery("");
                        if (!sideBySide()) setThreadOpen(true);
                      }}
                      className={cn(
                        "mb-1 flex w-full items-center gap-2 rounded-[var(--radius-field)] px-3 py-2 text-left",
                        active ? "bg-muted" : "hover:bg-overlay-hover",
                      )}
                    >
                      <span data-testid="inbox-avatar">
                        <ChatAvatar name={person.name} imageUrl={person.imageUrl} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                            {person.name}
                          </span>
                          {conversation.unreadCount > 0 ? (
                            <span className="text-caption text-text-primary">{conversation.unreadCount}</span>
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
                      </span>
                    </button>
                  );
                })
              )}
            </div>
        {conversations.length ? (
          <InboxPager page={inboxPage} total={conversations.length} onPageChange={setInboxPage} />
        ) : null}
      </aside>

      <section
        className={`gg-card min-h-[28rem] min-w-0 flex-col gap-3 ${
          detailsOpen ? "hidden xl:flex" : threadOpen ? "flex" : "hidden lg:flex"
        }`}
      >
        {finding ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              {threadOpen ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Back to inbox"
                  onClick={() => {
                    setFinding(false);
                    setPeople(null);
                    setPeopleQuery("");
                    setThreadOpen(false);
                  }}
                >
                  <ChevronLeft />
                </Button>
              ) : null}
              <span className="text-body text-text-muted shrink-0">To:</span>
              <Input
                value={peopleQuery}
                onChange={(event) => setPeopleQuery(event.target.value)}
                aria-label="Find a person"
                autoFocus
                className="h-11 border-0 bg-transparent px-0"
              />
            </div>
            <h3 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
              Your contacts
            </h3>
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
                    className="mb-1 flex w-full items-center gap-2 rounded-[var(--radius-field)] px-3 py-2 text-left hover:bg-overlay-hover"
                  >
                    <ChatAvatar name={person.name} imageUrl={person.imageUrl} />
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                      <span className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                        {person.name}
                      </span>
                      <span className="text-caption text-text-muted">
                        {roleLabel(person.role)}
                        {person.email ? ` · ${person.email}` : ""}
                      </span>
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
          </div>
        ) : !selected || !selectedPerson ? (
          <EmptyState
            title="Pick a conversation"
            body="Find someone in New conversation, or open a thread that already has messages."
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
                  <ChatAvatar name={selectedPerson.name} imageUrl={selectedPerson.imageUrl} />
                  <span className="min-w-0">
                    <h2 className="text-h3 text-text-primary m-0">{selectedPerson.name}</h2>
                    <p className="text-caption text-text-muted m-0 mt-1">
                      {roleLabel(selectedPerson.role)}
                      {selectedPerson.email ? ` · ${selectedPerson.email}` : ""}
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
              {messages.length === 0 ? (
                <p className="text-body text-text-muted m-0">No messages in this thread yet.</p>
              ) : (
                <ChatTranscript
                  messages={messages}
                  party={{ kind: "person", userId: selected.key }}
                  otherName={(message) => message.senderName || roleLabel(selectedPerson.role)}
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
