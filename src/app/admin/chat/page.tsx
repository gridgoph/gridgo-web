"use client";

import { SupportChatDesk } from "@/components/chat/SupportChatDesk";

export default function AdminChatPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        The same Operations inbox Super Admin can work. One thread per client,
        shop or rider — never the unused supplier/rider/Gridbot placeholders.
      </p>
      <SupportChatDesk />
    </div>
  );
}
