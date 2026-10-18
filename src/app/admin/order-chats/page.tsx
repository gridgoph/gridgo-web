"use client";

import { OrderChatsDesk } from "@/components/client-shop-chat/OrderChatsDesk";

export default function AdminOrderChatsPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        The same order conversations Operations reads: what each side actually
        typed, the reports, and a reply as GRIDGO.
      </p>
      <OrderChatsDesk tree="admin" />
    </div>
  );
}
