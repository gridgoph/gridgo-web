"use client";

import { useCallback, useEffect, useState } from "react";

import { getMySupplierVerification, isApiError } from "@/lib/api/client";
import { useShopAccess } from "@/lib/auth/shop-access";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  readShopVerification,
  verificationUnavailable,
  type ShopVerificationRead,
} from "@/lib/shop-verification";

export type ShopVerificationState =
  | { kind: "loading" }
  /** No summary from GRIDGO (older API, Staff, a verified shop's empty read): draw nothing new. */
  | { kind: "none" }
  | { kind: "failed" }
  | { kind: "ready"; read: ShopVerificationRead };

/**
 * The Owner's `GET /me/supplier-verification`. Only the Owner reads it: Staff,
 * Managers and a PIN worker's turn never ask, so they never see an amount.
 */
export function useShopVerification(): {
  state: ShopVerificationState;
  reload: () => Promise<void>;
} {
  const { can } = useShopAccess();
  const owner = can.money;
  const [state, setState] = useState<ShopVerificationState>(
    owner ? { kind: "loading" } : { kind: "none" },
  );

  const reload = useSerializedLoad(
    useCallback(async () => {
      if (!owner) {
        setState({ kind: "none" });
        return;
      }
      try {
        const read = readShopVerification(await getMySupplierVerification());
        setState(read ? { kind: "ready", read } : { kind: "none" });
      } catch (err) {
        setState(
          isApiError(err) && verificationUnavailable(err.status)
            ? { kind: "none" }
            : { kind: "failed" },
        );
      }
    }, [owner]),
  );

  useLiveReload(["payouts", "identity"], reload);
  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}
