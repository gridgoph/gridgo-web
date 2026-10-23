import { afterEach, expect, it, vi } from "vitest";
import { ApiError, onForbidden, setTokenProvider } from "@/lib/api/client";
import { getPickupChat } from "@/lib/api/supplier-pickup";

afterEach(() => {
  vi.unstubAllGlobals();
  setTokenProvider(() => null);
});

it("rechecks workspace access after a supplier pickup endpoint refuses the account", async () => {
  setTokenProvider(() => "test-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "account_suspended" }), { status: 403 }),
    ),
  );
  const denied = vi.fn();
  const off = onForbidden(denied);
  try {
    await expect(getPickupChat("ord_1")).rejects.toBeInstanceOf(ApiError);
    expect(denied).toHaveBeenCalledWith(
      expect.objectContaining({ code: "account_suspended" }),
    );
  } finally {
    off();
  }
});
