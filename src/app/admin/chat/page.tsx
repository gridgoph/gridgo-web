"use client";

import { SupportChatDesk } from "@/components/chat/SupportChatDesk";

export default function AdminChatPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        The same desk Operations uses. Look someone up to start a chat, including
        another Operations or admin account.
      </p>
      <SupportChatDesk />
    </div>
  );
}
