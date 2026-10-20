"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { chatOpenWith, SupportChatDesk } from "@/components/chat/SupportChatDesk";

export default function AdminChatPage() {
  const searchParams = useSearchParams();
  const openWith = useMemo(() => chatOpenWith(searchParams), [searchParams]);
  return (
    <div className="flex h-[calc(100dvh-3.5rem-1.5rem)] min-h-0 flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose shrink-0">
        The same desk Operations uses. Look someone up to start a chat, including
        another Operations or admin account.
      </p>
      <SupportChatDesk openWith={openWith} />
    </div>
  );
}
