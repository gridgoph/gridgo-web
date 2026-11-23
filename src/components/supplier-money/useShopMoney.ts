"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getMyShopMoney, getShopMoneySchedule } from "@/lib/api/client";
import { useShopAccess } from "@/lib/auth/shop-access";
import { useLiveReload } from "@/lib/live/useLiveReload";
import type { MoneyPeriod, ShopMoneyRead, ShopMoneySchedule } from "@/lib/supplier-money";

/**
 * The Owner's balances with GRIDGO and the payout schedule
 * (`lib/supplier-money.ts`). Only the Owner reads it: Staff, Managers and a
 * PIN worker on a shared shop PC are never asked, and GRIDGO refuses them
 * anyway.
 *
 * `read` stays null until GRIDGO answers with the route, so a GRIDGO without
 * it leaves Money as it was. A failed refresh keeps the last answer.
 */
export function useShopMoney(period: MoneyPeriod): {
  read: ShopMoneyRead | null;
  schedule: ShopMoneySchedule | null;
  reload: () => Promise<void>;
} {
  const access = useShopAccess();
  const enabled = !access.staff && access.role === "owner" && !access.worker;
  const [read, setRead] = useState<ShopMoneyRead | null>(null);
  const [schedule, setSchedule] = useState<ShopMoneySchedule | null>(null);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++generation.current;
    if (!enabled) {
      setRead(null);
      setSchedule(null);
      return;
    }
    try {
      const [money, terms] = await Promise.all([getMyShopMoney(period), getShopMoneySchedule()]);
      // A later read (or a period switch) wins.
      if (mine !== generation.current) return;
      setRead(money);
      setSchedule(terms);
    } catch {
      // Quiet: keep the last answer. The statement below has its own errors.
    }
  }, [enabled, period]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useLiveReload(["payouts", "jobs"], reload);

  return { read: enabled ? read : null, schedule: enabled ? schedule : null, reload };
}
