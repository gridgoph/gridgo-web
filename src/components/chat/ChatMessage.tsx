import { ChatImage } from "@/components/chat/ChatImage";
import type { SupportChatMessage } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function ChatMessage({ message }: { message: SupportChatMessage }) {
  return (
    <div
      data-testid="chat-bubble"
      className={cn(
        "max-w-full rounded-[var(--radius-field)] border px-3 py-2",
        message.mine
          ? "border-transparent bg-[var(--color-action-yellow)] text-[var(--color-action-yellow-on)]"
          : "border-border bg-card",
      )}
    >
      {message.body ? (
        <p
          className={cn(
            "text-body m-0 whitespace-pre-wrap",
            message.mine ? "text-[var(--color-action-yellow-on)]" : "text-text-primary",
          )}
        >
          {message.body}
        </p>
      ) : null}
      {message.attachments?.length ? (
        <div className={message.body ? "mt-2 flex flex-col gap-2" : "flex flex-col gap-2"}>
          {message.attachments.map((attachment) => (
            <ChatImage key={attachment.fileId} attachment={attachment} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
