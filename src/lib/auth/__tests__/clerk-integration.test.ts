import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { config, portalSessionMiddleware, requiresPortalSession } from "@/middleware";

describe("Clerk session middleware", () => {
  it.each(["/", "/supplier/jobs", "/ops/payments", "/admin/roles"])(
    "requires a signed-in session for %s",
    (pathname) => {
      expect(requiresPortalSession(pathname)).toBe(true);
    },
  );

  it("keeps login public and redirects signed-out role routes without consulting claims", async () => {
    const auth = vi.fn().mockResolvedValue({
      userId: null,
      sessionClaims: { gridgo_role: "super_admin" },
    });
    const request = new NextRequest("https://portal.example/ops/payments");

    const response = await portalSessionMiddleware(auth, request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://portal.example/login?redirect_url=https%3A%2F%2Fportal.example%2Fops%2Fpayments",
    );
    expect(auth).toHaveBeenCalledTimes(1);
    expect(requiresPortalSession("/login")).toBe(false);
  });

  it("rebuilds the public login bounce from forwarded host when the container bind address is visible", async () => {
    const auth = vi.fn().mockResolvedValue({ userId: null });
    const request = new NextRequest("http://0.0.0.0:3000/ops/payments", {
      headers: {
        "X-Forwarded-Host": "gridgo-dash.talasora.com",
        "X-Forwarded-Proto": "https",
      },
    });

    const response = await portalSessionMiddleware(auth, request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://gridgo-dash.talasora.com/login?redirect_url=https%3A%2F%2Fgridgo-dash.talasora.com%2Fops%2Fpayments",
    );
  });

  it("admits any signed-in identity to the layout that performs DB authorization", async () => {
    const auth = vi.fn().mockResolvedValue({ userId: "clerk_user" });

    const response = await portalSessionMiddleware(
      auth,
      new NextRequest("https://portal.example/admin/overview"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("runs Clerk on API and handshake paths after portal routes", () => {
    const apiIndex = config.matcher.indexOf("/(api|trpc)(.*)");
    const handshakeIndex = config.matcher.indexOf("/__clerk/:path*");

    expect(apiIndex).toBeGreaterThanOrEqual(0);
    expect(handshakeIndex).toBe(apiIndex + 1);
  });
});
