"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { listNotificationInbox, markNotificationRead } from "@/lib/api/notifications";
import { pushedNoticeHref, readPushedNotice } from "@/lib/pwa/notice";

/**
 * A tapped phone notification opens here (see `public/desk-alerts-sw.js`):
 * mark the slip read and move on to the screen it is about. Nothing renders
 * but the wait, and the history entry is replaced so Back skips it.
 */
function OpenNotice() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    let live = true;
    const notice = readPushedNotice(new URLSearchParams(params.toString()));
    void (async () => {
      let href = pushedNoticeHref(notice);
      if (notice) {
        const inbox = await listNotificationInbox("supplier").catch(() => null);
        const row = inbox?.notifications.find((item) => item.id === notice.id);
        href = pushedNoticeHref(notice, row);
        await markNotificationRead(notice.id).catch(() => undefined);
      }
      if (live) router.replace(href);
    })();
    return () => {
      live = false;
    };
  }, [params, router]);

  return <LoadingBlock label="Opening the update…" />;
}

export default function SupplierNoticePage() {
  return (
    <Suspense fallback={<LoadingBlock label="Opening the update…" />}>
      <OpenNotice />
    </Suspense>
  );
}
