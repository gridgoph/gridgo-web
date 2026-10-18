"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Flag } from "lucide-react";

import { ChatAttachButton } from "@/components/chat/ChatAttachButton";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { ChatImage } from "@/components/chat/ChatImage";
import { chatDayKey, chatDayLabel, formatChatTime } from "@/components/chat/groupChatRuns";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonDetail } from "@/components/ui/loading";
import {
  getClientShopChat,
  getFileDownloadUrl,
  isApiError,
  postClientShopChatMessage,
  uploadClientShopChatAttachment,
} from "@/lib/api/client";
import type {
  ClientShopChatAttachment,
  ClientShopChatMessage,
  ClientShopChatRead,
  ClientShopChatReport,
} from "@/lib/api/types";
import {
  CLIENT_SHOP_CHAT_ATTACHMENT_MAX_COUNT,
  CLIENT_SHOP_CHAT_BODY_MAX,
  chatFlagReasons,
  chatSide,
  chatStatusChip,
  chatWindowLine,
  isFlagged,
  mergeChatMessages,
  originalEvidence,
  reportReasonLabel,
  reportsByMessage,
  validateClientShopChatAttachment,
} from "@/lib/client-shop-chat";
import { formatDateTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { uploadErrorMessage } from "@/lib/upload-errors";
import { cn } from "@/lib/utils";

const ATTACH_ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";

function sendErrorMessage(err: unknown): string {
  if (!isApiError(err)) {
    return "The connection dropped, so the message was not sent. Try again.";
  }
  switch (err.code) {
    case "client_shop_chat_read_only":
      return "The conversation closed before this was sent. It is read only now.";
    case "client_shop_chat_not_available":
      return "The conversation opens when the shop accepts the order.";
    case "too_many_requests":
      return "Too many messages in a short time. Wait a few minutes, then send again.";
    case "invalid_chat_attachment":
    case "file_already_attached":
      return "One of the files could not be sent with this message. Remove it and attach it again.";
    case "invalid_request":
      return `Write up to ${CLIENT_SHOP_CHAT_BODY_MAX.toLocaleString("en-PH")} characters, or attach a file.`;
    default:
      if (err.kind === "forbidden") return "This account cannot write in this conversation.";
      return "The message was not sent. Try again.";
  }
}

function uploadMessage(err: unknown): string {
  if (isApiError(err) && err.code === "chat_image_sanitization_failed") {
    return "That photo could not be cleaned of its location and device details, so it was not sent. Try a different photo.";
  }
  return uploadErrorMessage(err, { what: "this file" });
}

function loadErrorMessage(err: unknown): string {
  if (isApiError(err) && err.kind === "forbidden") {
    return "This account cannot read this conversation.";
  }
  return "The conversation could not be loaded. Try again.";
}

function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A sent PDF opens through a short-lived signed link, fetched on the click. */
function ChatPdf({ attachment }: { attachment: ClientShopChatAttachment }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        className="justify-start"
        onClick={() => {
          setFailed(false);
          const tab = window.open("", "_blank");
          void getFileDownloadUrl(attachment.fileId)
            .then((url) => {
              if (tab) tab.location.href = url;
              else window.location.assign(url);
            })
            .catch(() => {
              tab?.close();
              setFailed(true);
            });
        }}
      >
        <FileText aria-hidden />
        PDF · {fileSize(attachment.size)}
      </Button>
      {failed ? (
        <p className="text-caption text-error m-0" role="alert">
          The PDF could not be opened. Try again.
        </p>
      ) : null}
    </div>
  );
}

function ReportLines({ reports }: { reports: ClientShopChatReport[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Reports on this message">
      {reports.map((report) => (
        <li key={report.id} className="flex items-start gap-1.5">
          <Flag size={13} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <span className="text-caption text-text-secondary">
            Reported by {report.reporterLabel}: {reportReasonLabel(report.reason)} ·{" "}
            {formatDateTime(report.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ChatLine({
  message,
  reports,
}: {
  message: ClientShopChatMessage;
  reports: ClientShopChatReport[];
}) {
  const side = chatSide(message.senderLabel);
  const original = originalEvidence(message);
  const incoming = side === "incoming";
  return (
    <div
      data-testid="client-shop-chat-line"
      data-side={side}
      className={cn("flex gap-2", incoming ? "items-start justify-start" : "justify-end")}
    >
      {incoming ? <ChatAvatar name={message.senderLabel} /> : null}
      <div
        className={cn(
          "flex w-fit max-w-[85%] min-w-0 flex-col gap-1",
          incoming ? "items-start" : "items-end",
        )}
      >
        <p className="text-caption text-text-muted m-0">
          {message.senderLabel}
          {message.mine ? " (you)" : ""} · {formatChatTime(message.createdAt)}
        </p>
        <div
          className={cn(
            "max-w-full rounded-[var(--radius-field)] border px-3 py-2",
            incoming ? "border-border bg-card" : "border-transparent bg-muted",
          )}
        >
          {message.body ? (
            <p className="text-body text-text-primary m-0 whitespace-pre-wrap break-words">
              {message.body}
            </p>
          ) : null}
          {message.attachments?.length ? (
            <div className={message.body ? "mt-2 flex flex-col gap-2" : "flex flex-col gap-2"}>
              {message.attachments.map((attachment) =>
                attachment.contentType === "application/pdf" ? (
                  <ChatPdf key={attachment.fileId} attachment={attachment} />
                ) : (
                  <ChatImage
                    key={attachment.fileId}
                    attachment={{ ...attachment, originalFilename: "Photo sent in the chat" }}
                  />
                ),
              )}
            </div>
          ) : null}
        </div>
        {message.contactAttempt ? (
          <StatusChip tone="warning" icon="triangle-alert" label="Contact details hidden" />
        ) : null}
        {original !== null ? (
          <div
            data-testid="client-shop-chat-original"
            className="max-w-full rounded-[var(--radius-field)] border border-dashed border-outline px-3 py-2"
          >
            <p className="text-caption text-text-muted m-0">
              What they typed · only Operations sees this
            </p>
            <p className="text-body text-text-secondary m-0 mt-1 whitespace-pre-wrap break-words">
              {original}
            </p>
          </div>
        ) : null}
        {reports.length ? <ReportLines reports={reports} /> : null}
      </div>
    </div>
  );
}

type Props = {
  orderId: string;
  /** The desk's Send is its one yellow action; inside the workspace it stays outlined. */
  sendVariant?: "primary" | "secondary";
  /** Height cap of the scrolling transcript. */
  transcriptClassName?: string;
  onLoaded?: (read: ClientShopChatRead) => void;
};

/**
 * One order's client–shop conversation, read as Operations: the masked text
 * both sides see, what the sender actually typed beside it, every report with
 * its reason, and a composer that posts as "GRIDGO" while the window is open.
 */
export function OrderChatThread({
  orderId,
  sendVariant = "secondary",
  transcriptClassName = "max-h-[32rem]",
  onLoaded,
}: Props) {
  const [read, setRead] = useState<ClientShopChatRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const load = useSerializedLoad(
    useCallback(async () => {
      try {
        const next = await getClientShopChat(orderId);
        setRead(next);
        setError(null);
        onLoadedRef.current?.(next);
      } catch (err) {
        setError(loadErrorMessage(err));
      }
    }, [orderId]),
  );

  useEffect(() => {
    setRead(null);
    setError(null);
    setDraft("");
    setFiles([]);
    setSendError(null);
    void load();
  }, [load]);

  // Staff hear about every message and report as a `chat` invalidation for the order.
  useLiveReload(["chat"], load, { matchId: orderId });

  // Keep the newest message in view: on each new message, and when a photo
  // finishes loading below it, unless the reader has scrolled up.
  const pinned = useRef(true);
  const messageCount = read?.messages.length ?? 0;
  useEffect(() => {
    const box = transcriptRef.current;
    if (box) box.scrollTop = box.scrollHeight;
    pinned.current = true;
  }, [messageCount]);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      const problem = validateClientShopChatAttachment(file);
      if (problem) {
        setSendError(problem);
        return;
      }
      if (next.length >= CLIENT_SHOP_CHAT_ATTACHMENT_MAX_COUNT) {
        setSendError(
          `A message can carry up to ${CLIENT_SHOP_CHAT_ATTACHMENT_MAX_COUNT} files.`,
        );
        return;
      }
      next.push(file);
    }
    setSendError(null);
    setFiles(next);
  }

  async function send() {
    if (!read || sending) return;
    const body = draft.trim();
    if (!body && !files.length) return;
    setSending(true);
    setSendError(null);
    try {
      const ids: string[] = [];
      for (const file of files) {
        try {
          ids.push((await uploadClientShopChatAttachment(file)).fileId);
        } catch (err) {
          setSendError(uploadMessage(err));
          return;
        }
      }
      const posted = await postClientShopChatMessage(orderId, body, ids);
      setDraft("");
      setFiles([]);
      setRead((current) =>
        current
          ? {
              ...current,
              chat: posted.chat,
              messages: mergeChatMessages(current.messages, [posted.message]),
            }
          : current,
      );
    } catch (err) {
      setSendError(sendErrorMessage(err));
      if (
        isApiError(err) &&
        (err.code === "client_shop_chat_read_only" ||
          err.code === "client_shop_chat_not_available")
      ) {
        void load();
      }
    } finally {
      setSending(false);
    }
  }

  if (error && !read) {
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
  if (!read) return <SkeletonDetail label="Loading the conversation…" />;

  const { chat, messages } = read;
  const status = chatStatusChip(chat.status);
  const flagged = isFlagged(chat);
  const reasons = chatFlagReasons(chat);
  const byMessage = reportsByMessage(read.reports);
  let lastDay: string | null = null;

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="client-shop-chat">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={status.tone} icon={status.icon} label={status.label} />
          {flagged ? (
            <StatusChip tone="warning" icon="triangle-alert" label="Flagged for review" />
          ) : null}
          {chat.unread > 0 ? (
            <span className="text-caption text-text-secondary">
              {chat.unread === 1 ? "1 new message" : `${chat.unread} new messages`} since you last
              read it
            </span>
          ) : null}
        </div>
        <p className="text-body text-text-secondary m-0">{chatWindowLine(chat)}</p>
        {flagged || reasons.length ? (
          <p className="text-caption text-text-muted m-0">
            {flagged && chat.flaggedAt ? `Flagged ${formatDateTime(chat.flaggedAt)}. ` : ""}
            {reasons.length ? `${reasons.join(" · ")}.` : ""}
          </p>
        ) : null}
        <p className="text-caption text-text-muted m-0">
          The client and the shop see each other only as &ldquo;Client&rdquo; and &ldquo;Print
          shop&rdquo;, and contact details are hidden from both. You post as &ldquo;GRIDGO&rdquo;.
        </p>
      </div>

      <div
        ref={transcriptRef}
        className={cn(
          "flex min-h-0 flex-col gap-3 overflow-y-auto rounded-[var(--radius-field)] border border-outline-subtle p-3",
          transcriptClassName,
        )}
        role="log"
        aria-label="Client and shop conversation"
        onScroll={(event) => {
          const box = event.currentTarget;
          pinned.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        }}
        onLoadCapture={() => {
          const box = transcriptRef.current;
          if (box && pinned.current) box.scrollTop = box.scrollHeight;
        }}
      >
        {messages.length === 0 ? (
          <p className="text-body text-text-muted m-0">No messages yet.</p>
        ) : (
          messages.map((message) => {
            const day = chatDayKey(message.createdAt);
            const chip =
              day !== lastDay ? (
                <div className="flex justify-center" key={`day-${day}`}>
                  <span className="text-caption text-text-muted bg-muted rounded-full px-3 py-1">
                    {chatDayLabel(message.createdAt)}
                  </span>
                </div>
              ) : null;
            lastDay = day;
            return [
              chip,
              <ChatLine
                key={message.id}
                message={message}
                reports={byMessage.get(message.id) ?? []}
              />,
            ];
          })
        )}
      </div>

      {chat.status === "open" ? (
        <div className="flex flex-col gap-2">
          <p className="text-caption text-text-muted m-0">{chat.reminder}</p>
          {files.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-caption text-text-secondary m-0">
                {files.length === 1 ? files[0].name : `${files.length} files ready to send`}
              </p>
              <Button type="button" variant="ghost" onClick={() => setFiles([])} disabled={sending}>
                Remove
              </Button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <ChatAttachButton
              disabled={sending}
              onFiles={addFiles}
              accept={ATTACH_ACCEPT}
              label="Attach photos or a PDF"
            />
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write as GRIDGO"
              aria-label="Write as GRIDGO"
              rows={2}
              maxLength={CLIENT_SHOP_CHAT_BODY_MAX}
              className="min-w-0 flex-1"
            />
            <Button
              variant={sendVariant}
              disabled={sending || (!draft.trim() && !files.length)}
              onClick={() => void send()}
            >
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      ) : null}
      {sendError ? (
        <p className="text-body text-error m-0" role="alert">
          {sendError}
        </p>
      ) : null}
    </div>
  );
}
