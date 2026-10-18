"use client";

import { OrderChatsDesk } from "@/components/client-shop-chat/OrderChatsDesk";

export default function OpsOrderChatsPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Every conversation between a client and the shop on their order. Read
        what each side actually typed, see the reports, and step in as GRIDGO.
      </p>
      <OrderChatsDesk tree="ops" />
    </div>
  );
}
