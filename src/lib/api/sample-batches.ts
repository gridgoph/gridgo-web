/**
 * Operations' Sample First reads (contract `gridgo-api/docs/SAMPLE_FIRST_API.md`,
 * "Operations and dashboard"). Operations and Super Admin only, read-only: the
 * client approves, rejects and orders from the GRIDGO app.
 */

import { apiRequest } from "@/lib/api/client";
import type { SampleBatch } from "@/lib/api/types";

/** Fills what an older or partial answer may leave out. */
export function readSampleBatch(raw: SampleBatch): SampleBatch {
  return {
    ...raw,
    itemName: raw.itemName ?? null,
    sampleOrderState: raw.sampleOrderState ?? null,
    batchOrderId: raw.batchOrderId ?? null,
    previousDraftId: raw.previousDraftId ?? null,
    replacedByDraftId: raw.replacedByDraftId ?? null,
    batch: raw.batch ?? { quantity: 0 },
    sampleDeliveredAt: raw.sampleDeliveredAt ?? null,
    heldUntil: raw.heldUntil ?? null,
    holdActive: raw.holdActive === true,
    holdExpired: raw.holdExpired === true,
    heldPrice: raw.heldPrice ?? null,
    currentPrice: raw.currentPrice ?? null,
    canOrderAtHeldPrice: raw.canOrderAtHeldPrice === true,
    heldPriceBlocker: raw.heldPriceBlocker ?? null,
    canOrderAtCurrentPrice: raw.canOrderAtCurrentPrice === true,
    approval: raw.approval ?? null,
    rejection: raw.rejection ?? null,
  };
}

const base = "/ops/sample-batches";

/** The latest 200 drafts; `status` narrows on the API. */
export async function listSampleBatches(
  filter: { status?: string | null } = {},
): Promise<SampleBatch[]> {
  const query = filter.status ? `?status=${encodeURIComponent(filter.status)}` : "";
  const result = await apiRequest<{ sampleBatches?: SampleBatch[] }>(`${base}${query}`);
  return (result.sampleBatches ?? []).map(readSampleBatch);
}

/** One draft; `quantity` previews both prices for another batch quantity. */
export async function getSampleBatch(id: string, quantity?: number | null): Promise<SampleBatch> {
  const query = quantity ? `?quantity=${encodeURIComponent(String(quantity))}` : "";
  const result = await apiRequest<{ sampleBatch: SampleBatch }>(
    `${base}/${encodeURIComponent(id)}${query}`,
  );
  return readSampleBatch(result.sampleBatch);
}
