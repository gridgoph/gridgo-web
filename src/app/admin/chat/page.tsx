"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { chatOpenWith, SupportChatDesk } from "@/components/chat/SupportChatDesk";

export default function AdminChatPage() {
  const searchParams = useSearchParams();
  const openWith = useMemo(() => chatOpenWith(searchParams), [searchParams]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        The same desk Operations uses. Look someone up to start a chat, including
        another Operations or admin account.
      </p>
      <SupportChatDesk openWith={openWith} />
    </div>
  );
}
