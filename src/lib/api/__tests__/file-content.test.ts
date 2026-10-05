import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getFileContent, onForbidden, setTokenProvider } from "@/lib/api/client";

afterEach(() => {
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("getFileContent", () => {
  it("reads the file's bytes from the API with the session bearer", async () => {
    vi.stubGlobal("window", { location: { pathname: "/ops/orders/ord_1" } });
    setTokenProvider(() => "test-bearer");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["png-bytes"], { type: "image/png" }), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const blob = await getFileContent("file_proof");

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/files\/file_proof\/content$/);
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("Authorization")).toBe("Bearer test-bearer");
    expect(headers.get("X-GRIDGO-Role")).toBe("ops_admin");
    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("png-bytes");
  });

  it("throws the API's error code, and a refusal still reaches RoleGate", async () => {
    vi.stubGlobal("window", { location: { pathname: "/admin/orders/ord_1" } });
    const heard = vi.fn();
    const stop = onForbidden(heard);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
      ),
    );

    const error = await getFileContent("file_proof").catch((err: unknown) => err);
    stop();

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("forbidden");
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
