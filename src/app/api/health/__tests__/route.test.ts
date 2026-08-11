import { afterEach, describe, expect, it } from "vitest";

import { GET, dynamic } from "@/app/api/health/route";

const ENV_KEYS = [
  "NEXT_PUBLIC_API_URL",
  "GRIDGO_BUILD_SHA",
  "GRIDGO_BUILD_TIME",
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("GET /api/health", () => {
  it("is never prerendered — a cached 200 would outlive a dead process", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("answers ok with no-store", async () => {
    const res = GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toMatchObject({ ok: true, service: "gridgo-web" });
  });

  it("reports the API base the bundle was built against", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://gridgo-api.talasora.com";

    await expect(GET().json()).resolves.toMatchObject({
      apiBase: "https://gridgo-api.talasora.com",
    });
  });

  it("reports the build stamp, and says so plainly when there is none", async () => {
    await expect(GET().json()).resolves.toMatchObject({
      commit: "unknown",
      builtAt: "unknown",
    });

    process.env.GRIDGO_BUILD_SHA = "abc1234";
    process.env.GRIDGO_BUILD_TIME = "2026-08-11T00:00:00Z";

    await expect(GET().json()).resolves.toMatchObject({
      commit: "abc1234",
      builtAt: "2026-08-11T00:00:00Z",
    });
  });
});
