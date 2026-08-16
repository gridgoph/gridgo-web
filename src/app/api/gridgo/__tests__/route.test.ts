import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, dynamic } from "@/app/api/gridgo/[...path]/route";

function request(
  url: string,
  init: { method?: string; headers?: HeadersInit; body?: string } = {},
): NextRequest {
  return new NextRequest(url, init);
}

describe("GET /api/gridgo/*", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("is never prerendered — a cached 404 would hide a live local API", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("404s in a production build so it cannot proxy the hosted API", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:8787";
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(request("http://localhost:3310/api/gridgo/auth/me"), {
      params: Promise.resolve({ path: ["auth", "me"] }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards Clerk-authorized API reads without browser Origin or cookies", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:18787";
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "usr_ops", email: "person@example.com", name: "Operator" },
          memberships: [{ role: "ops_admin" }],
          approvalCases: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(
      request("http://localhost:3310/api/gridgo/auth/me", {
        headers: {
          accept: "application/json",
          authorization: "Bearer clerk-session-token",
          origin: "http://localhost:3310",
          cookie: "__session=should-not-forward",
        },
      }),
      { params: Promise.resolve({ path: ["auth", "me"] }) },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [dest, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(dest).toBe("http://127.0.0.1:18787/auth/me");
    const headers = new Headers(init.headers);
    expect(headers.get("origin")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBe("Bearer clerk-session-token");
    expect(headers.get("accept")).toBe("application/json");
    expect(init.body).toBeUndefined();
  });
});
