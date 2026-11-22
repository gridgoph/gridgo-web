"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isApiError } from "@/lib/api/client";
import { getMyShopStatus, updateMyShopStatus } from "@/lib/api/shop-status";
import { useLiveReload } from "@/lib/live/useLiveReload";
import {
  changeSentence,
  shopStatusErrorCopy,
  type MyShopStatus,
  type MyShopStatusPatch,
} from "@/lib/my-shop-status";
import { SHOP_STATUS_CHANGED } from "@/lib/shop-status";

export type MyShopStatusState =
  | { kind: "loading" }
  | { kind: "ready"; status: MyShopStatus }
  /** This GRIDGO has no `/me/shop-status` yet: the panel is left out, not broken. */
  | { kind: "unsupported" }
  | { kind: "failed" };

/**
 * One reader and writer of `GET/PATCH /me/shop-status` for My shop. Every
 * write sends the version it read; a stale version rereads and asks the shop
 * to make the change again. The sentence after a change says what took.
 */
export function useMyShopStatus() {
  const [state, setState] = useState<MyShopStatusState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const current = useRef<MyShopStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const status = await getMyShopStatus();
      current.current = status;
      setState(status ? { kind: "ready", status } : { kind: "failed" });
    } catch (err) {
      setState(
        isApiError(err) && (err.status === 404 || err.status === 405)
          ? { kind: "unsupported" }
          : { kind: "failed" },
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload(["catalog", "identity"], load);

  const save = useCallback(
    async (patch: MyShopStatusPatch) => {
      const before = current.current;
      if (!before || busy) return;
      setBusy(true);
      setMessage(null);
      try {
        const next = await updateMyShopStatus(before.version, patch);
        if (next) {
          current.current = next;
          setState({ kind: "ready", status: next });
        } else {
          await load();
        }
        setMessage({ tone: "ok", text: changeSentence(patch) });
        window.dispatchEvent(new Event(SHOP_STATUS_CHANGED));
      } catch (err) {
        const code = isApiError(err) ? err.code : null;
        setMessage({ tone: "error", text: shopStatusErrorCopy(code) });
        if (code === "shop_profile_stale") await load();
      } finally {
        setBusy(false);
      }
    },
    [busy, load],
  );

  return { state, busy, message, save, reload: load };
}
