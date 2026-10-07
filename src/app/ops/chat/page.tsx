"use client";

import { SupportChatDesk } from "@/components/chat/SupportChatDesk";

export default function OpsChatPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Find a signed-in client, shop, rider, or another desk account and write
        to them here. Public landing-page tickets stay on the support desk.
      </p>
      <SupportChatDesk />
    </div>
  );
}
