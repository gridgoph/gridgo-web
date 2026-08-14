import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { config } from "@/middleware";

describe("Clerk integration contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps Clerk auth opt-in until the API dual-auth rollout is enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDGO_AUTH_MODE", "legacy");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_public");
    vi.resetModules();

    const { isClerkAuthEnabled } = await import("@/lib/auth/clerk-config");
    expect(isClerkAuthEnabled()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_GRIDGO_AUTH_MODE", "clerk");
    expect(isClerkAuthEnabled()).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    expect(isClerkAuthEnabled()).toBe(false);
  });

  it("runs Clerk middleware on API routes and the Clerk handshake path", () => {
    const apiIndex = config.matcher.indexOf("/(api|trpc)(.*)");
    const handshakeIndex = config.matcher.indexOf("/__clerk/:path*");

    expect(apiIndex).toBeGreaterThanOrEqual(0);
    expect(handshakeIndex).toBe(apiIndex + 1);
  });

  it("places the optional Clerk provider below the document body", () => {
    const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");
    const providersPath = resolve(
      process.cwd(),
      "src/components/providers/AppProviders.tsx",
    );

    expect(existsSync(providersPath)).toBe(true);
    const providers = existsSync(providersPath) ? readFileSync(providersPath, "utf8") : "";
    expect(layout.indexOf("<body")).toBeLessThan(layout.indexOf("<AppProviders"));
    expect(providers).toContain("<ClerkProvider");
  });
});
