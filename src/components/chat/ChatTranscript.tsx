"use client";

import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { ChatMessage } from "@/components/chat/ChatMessage";
import {
  buildChatTranscript,
  formatChatTime,
  type ChatParty,
} from "@/components/chat/groupChatRuns";
import type { SupportChatMessage } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function ChatTranscript({
  messages,
  party,
  otherName,
}: {
  messages: SupportChatMessage[];
  party: ChatParty;
  otherName: (message: SupportChatMessage) => string;
}) {
  const { items } = buildChatTranscript(messages, party, otherName);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        if (item.kind === "day") {
          return (
            <div key={`day-${item.key}`} className="flex justify-center" data-testid="chat-day">
              <span className="text-caption text-text-muted bg-muted rounded-full px-3 py-1">
                {item.label}
              </span>
            </div>
          );
        }
        const incoming = item.side === "incoming";
        return (
          <div
            key={item.key}
            data-testid="chat-run"
            data-side={item.side}
            className={cn("flex gap-2", incoming ? "items-end justify-start" : "justify-end")}
          >
            {incoming ? (
              <div data-testid="chat-avatar">
                <ChatAvatar name={item.name} imageUrl={item.imageUrl} />
              </div>
            ) : null}
            <div
              className={cn(
                "flex w-fit max-w-[80%] flex-col gap-1",
                incoming ? "items-start" : "items-end",
              )}
            >
              <p className="text-caption text-text-muted m-0" data-testid="chat-run-time">
                {item.name}
                {` · ${formatChatTime(item.timeIso)}`}
              </p>
              {item.messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
