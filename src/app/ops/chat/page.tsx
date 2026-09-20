"use client";

import { SupportChatDesk } from "@/components/chat/SupportChatDesk";

export default function OpsChatPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Clients, shops and riders write to Operations here. Public landing-page
        tickets stay on the support desk; this inbox is signed-in GRIDGO chat.
      </p>
      <SupportChatDesk />
    </div>
  );
}
