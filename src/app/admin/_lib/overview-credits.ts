import { creditBalance } from "@/lib/api/client";
import type { CreditBalance, Order } from "@/lib/api/types";

const CREDIT_CONCURRENCY = 4;

/** Same clients, balances and ledger counts as the overview's complete reads. */
export async function loadOverviewCredits(orders: Order[]): Promise<CreditBalance[]> {
  const ids = [...new Set(orders.map((order) => order.clientId).filter(Boolean))];
  const credits: (CreditBalance | undefined)[] = new Array(ids.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CREDIT_CONCURRENCY, ids.length) }, async () => {
      while (next < ids.length) {
        const index = next++;
        try {
          // Paging /credits/balance would truncate the displayed grant count.
          credits[index] = await creditBalance(ids[index]);
        } catch {
          // Preserve the overview's treatment of clients without a readable ledger.
        }
      }
    }),
  );
  return credits.filter((credit): credit is CreditBalance => credit !== undefined);
}
