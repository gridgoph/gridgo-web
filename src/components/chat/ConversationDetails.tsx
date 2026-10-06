"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";

import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { ChatImage } from "@/components/chat/ChatImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SupportChatAttachment, SupportChatMessage } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

function snippet(message: SupportChatMessage): string {
  const body = message.body?.trim();
  if (body) return body;
  return message.attachments?.length ? "Photo" : "Message";
}

export function ConversationDetails({
  name,
  subtitle,
  imageUrl,
  searchValue,
  onSearchValueChange,
  searchResults,
  photos,
  onDelete,
  onClose,
}: {
  name: string;
  subtitle: string;
  imageUrl?: string | null;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  searchResults: SupportChatMessage[];
  photos: SupportChatAttachment[];
  onDelete: () => void;
  onClose?: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const query = searchValue.trim();
  const resultCount = query ? searchResults.length : 0;

  if (searchOpen) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close search"
            onClick={() => setSearchOpen(false)}
          >
            <X />
          </Button>
          <h2 className="text-h3 text-text-primary m-0">Search</h2>
        </div>

        <div className="flex items-center gap-2 rounded-[var(--radius-field)] border border-border px-3">
          <Search className="size-4 shrink-0 text-text-muted" />
          <Input
            id="support-chat-search"
            value={searchValue}
            onChange={(event) => onSearchValueChange(event.target.value)}
            placeholder="Search this chat"
            aria-label="Search this chat"
            autoFocus
            className="min-w-0 flex-1 border-0 px-0 shadow-none focus-visible:ring-0"
          />
          {query ? (
            <p className="text-caption text-text-muted m-0 whitespace-nowrap">
              {resultCount === 1 ? "1 result" : `${resultCount} results`}
            </p>
          ) : null}
          {searchValue ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              onClick={() => onSearchValueChange("")}
            >
              <X />
            </Button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" aria-label="Search results">
          {!query ? (
            <p className="text-body text-text-muted m-0 pt-2">
              Type a word to find it in this conversation.
            </p>
          ) : searchResults.length === 0 ? (
            <p className="text-body text-text-muted m-0 pt-2">No messages match that search.</p>
          ) : (
            searchResults.map((message) => {
              const sender = message.mine ? "You" : name;
              const text = snippet(message);
              const when = formatDateTime(message.createdAt);
              return (
                <div
                  key={message.id}
                  className="flex items-start gap-3 border-b border-border py-3"
                  aria-label={`${sender}, ${text}, ${when}`}
                >
                  <ChatAvatar name={sender} imageUrl={message.senderImageUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-text-primary m-0 line-clamp-2">{text}</p>
                    <p className="text-caption text-text-muted m-0 mt-1">{when}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption text-text-muted m-0">Conversation</p>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close conversation details"
            onClick={onClose}
          >
            <X />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <ChatAvatar
          name={name}
          imageUrl={imageUrl}
          size="lg"
          className="size-20 data-[size=lg]:size-20"
        />
        <div className="min-w-0">
          <h2 className="text-h3 text-text-primary m-0">{name}</h2>
          <p className="text-caption text-text-muted m-0 mt-1">{subtitle}</p>
        </div>
      </div>

      <div className="flex justify-center">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="rounded-full"
          aria-label="Search in conversation"
          onClick={() => setSearchOpen(true)}
        >
          <Search />
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          Media & files
        </h3>
        {photos.length === 0 ? (
          <p className="text-caption text-text-muted m-0">No photos in this chat yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((attachment) => (
              <ChatImage key={attachment.fileId} attachment={attachment} square />
            ))}
          </div>
        )}
      </section>

      <div className="mt-auto pt-2">
        <Button type="button" variant="destructive" fullWidth onClick={onDelete}>
          Delete chat
        </Button>
      </div>
    </div>
  );
}
