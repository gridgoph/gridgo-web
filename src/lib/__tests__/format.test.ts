import { afterEach, describe, expect, it, vi } from "vitest";

import { formatPhp } from "@/lib/format";
import {
  getApiBase,
  getConfiguredApiBase,
  LOCAL_API_PROXY_PREFIX,
  shouldUseLocalApiProxy,
} from "@/lib/api/client";

describe("formatPhp", () => {
  it("formats minor units as PHP pesos", () => {
    expect(formatPhp(120000)).toMatch(/1,200\.00/);
    expect(formatPhp(0)).toMatch(/0\.00/);
  });
});

describe("getApiBase", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it("defaults to local demo API", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(getConfiguredApiBase()).toBe("http://127.0.0.1:8787");
    expect(getApiBase()).toBe("http://127.0.0.1:8787");
  });

  it("strips trailing slash from env override", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://example.test:9000/";
    expect(getApiBase()).toBe("http://example.test:9000");
  });

  it("uses the same-origin proxy in the browser during next dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    (globalThis as { window: { location: { origin: string } } }).window = {
      location: { origin: "http://localhost:3310" },
    };
    expect(shouldUseLocalApiProxy()).toBe(true);
    expect(getApiBase()).toBe(LOCAL_API_PROXY_PREFIX);
    expect(getConfiguredApiBase()).toBe("http://127.0.0.1:8787");
  });

  it("does not proxy a production build even in a browser", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_API_URL = "https://gridgo-api.talasora.com";
    (globalThis as { window: { location: { origin: string } } }).window = {
      location: { origin: "https://gridgo-dash.talasora.com" },
    };
    expect(shouldUseLocalApiProxy()).toBe(false);
    expect(getApiBase()).toBe("https://gridgo-api.talasora.com");
  });
});
