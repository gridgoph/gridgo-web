import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { ChatImage } from "@/components/chat/ChatImage";
import type { SupportChatMessage } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ChatMessage({
  message,
  counterpartLabel,
}: {
  message: SupportChatMessage;
  counterpartLabel: string;
}) {
  const name = message.mine ? "You" : counterpartLabel;
  return (
    <div
      className={cn("flex items-end gap-2", message.mine ? "justify-end" : "justify-start")}
    >
      {message.mine ? null : <ChatAvatar name={name} imageUrl={message.senderImageUrl} />}
      <div
        className={cn(
          "max-w-[80%] rounded-[var(--radius-field)] border border-border px-3 py-2",
          message.mine ? "bg-muted" : "bg-card",
        )}
      >
        {message.body ? (
          <p className="text-body text-text-primary m-0 whitespace-pre-wrap">{message.body}</p>
        ) : null}
        {message.attachments?.length ? (
          <div className={message.body ? "mt-2 flex flex-col gap-2" : "flex flex-col gap-2"}>
            {message.attachments.map((attachment) => (
              <ChatImage key={attachment.fileId} attachment={attachment} />
            ))}
          </div>
        ) : null}
        <p className="text-caption text-text-muted m-0 mt-1">
          {name}
          {` · ${formatDateTime(message.createdAt)}`}
        </p>
      </div>
      {message.mine ? <ChatAvatar name={name} imageUrl={message.senderImageUrl} /> : null}
    </div>
  );
}
