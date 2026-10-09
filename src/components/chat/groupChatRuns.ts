import type { SupportChatMessage } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

/** Who the open thread is with, besides the signed-in viewer. */
export type ChatParty =
  | { kind: "operations" }
  | { kind: "person"; userId: string };

export type ChatSide = "incoming" | "outgoing";

export type ChatDayChip = {
  kind: "day";
  key: string;
  label: string;
};

export type ChatRun = {
  kind: "run";
  key: string;
  side: ChatSide;
  senderUserId: string;
  name: string;
  imageUrl: string | null;
  timeIso: string;
  messages: SupportChatMessage[];
};

export type ChatTranscriptItem = ChatDayChip | ChatRun;

/**
 * `null` when the sender is neither the viewer (`mine`) nor this thread's other party.
 * That line is left unplaced: it is not the client's side, and it is not a third column.
 */
export function transcriptSide(message: SupportChatMessage, party: ChatParty): ChatSide | null {
  if (message.mine) return "outgoing";
  if (party.kind === "operations") return "incoming";
  if (message.senderUserId === party.userId) return "incoming";
  return null;
}

export function chatDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Today" on the current calendar day; otherwise the same date the rest of the desk prints. */
export function chatDayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return formatDate(iso);
  const today =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return today ? "Today" : formatDate(iso);
}

export function formatChatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("en-PH", { timeStyle: "short" }).format(date);
  } catch {
    return iso;
  }
}

export function buildChatTranscript(
  messages: SupportChatMessage[],
  party: ChatParty,
  otherName: (message: SupportChatMessage) => string,
  now = new Date(),
): { items: ChatTranscriptItem[]; unplaced: SupportChatMessage[] } {
  const items: ChatTranscriptItem[] = [];
  const unplaced: SupportChatMessage[] = [];
  let dayKey: string | null = null;
  let run: ChatRun | null = null;

  for (const message of messages) {
    const side = transcriptSide(message, party);
    if (!side) {
      unplaced.push(message);
      run = null;
      continue;
    }
    const key = chatDayKey(message.createdAt);
    if (key !== dayKey) {
      dayKey = key;
      run = null;
      items.push({ kind: "day", key, label: chatDayLabel(message.createdAt, now) });
    }
    const continues =
      run !== null && run.side === side && run.senderUserId === message.senderUserId;
    if (continues && run) {
      run.messages.push(message);
      run.timeIso = message.createdAt;
      if (!run.imageUrl && message.senderImageUrl) run.imageUrl = message.senderImageUrl;
      continue;
    }
    run = {
      kind: "run",
      key: message.id,
      side,
      senderUserId: message.senderUserId,
      name: side === "outgoing" ? "You" : otherName(message),
      imageUrl: message.senderImageUrl ?? null,
      timeIso: message.createdAt,
      messages: [message],
    };
    items.push(run);
  }

  return { items, unplaced };
}
