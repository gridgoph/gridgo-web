import { afterEach, expect, it, vi } from "vitest";

import { ApiError, setTokenProvider } from "@/lib/api/client";
import { getAdminPromotions, updateAdminPromotions } from "@/lib/api/promotions";
import { rawPromotions } from "@/test/promotions";

afterEach(() => {
  vi.unstubAllGlobals();
  setTokenProvider(() => null);
});

function stubFetch(...answers: [number, unknown][]) {
  const fetch = vi.fn(async () => {
    const [status, body] = answers.shift()!;
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("patches only the changed fields with the version and a reason", async () => {
  setTokenProvider(() => "test-token");
  const fetch = stubFetch([200, rawPromotions({ version: 4 })]);
  const saved = await updateAdminPromotions({ founding: { amountMinor: 25000 } }, 3, "Launch promotions: x");
  expect(saved.version).toBe(4);
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toMatch(/\/admin\/promotions$/);
  expect(init.method).toBe("PATCH");
  expect(JSON.parse(String(init.body))).toEqual({
    founding: { amountMinor: 25000 },
    expectedVersion: 3,
    reason: "Launch promotions: x",
  });
});

it("reads the counts again when the save answers with settings alone", async () => {
  setTokenProvider(() => "test-token");
  const { settings } = rawPromotions();
  const fetch = stubFetch([200, { version: 4, settings }], [200, rawPromotions({ version: 4 })]);
  const saved = await updateAdminPromotions({ budgetCapMinor: 1000000 }, 3, "r");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(saved.founding.claims).toHaveLength(2);
});

it("passes a stale version through as an ApiError", async () => {
  setTokenProvider(() => "test-token");
  stubFetch([409, { error: "settings_version_conflict", version: 4 }]);
  await expect(updateAdminPromotions({ budgetCapMinor: 1 }, 1, "r")).rejects.toMatchObject({
    status: 409,
    code: "settings_version_conflict",
  });
  stubFetch([500, { error: "internal" }]);
  await expect(getAdminPromotions()).rejects.toBeInstanceOf(ApiError);
});
