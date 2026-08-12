import { getConfiguredApiBase } from "@/lib/api/client";

/**
 * Liveness for the portal container.
 *
 * Docker's `HEALTHCHECK`, the compose service, and any operator check read this.
 * It answers one question: can this Next.js process serve a request?
 *
 * It deliberately does **not** call the GRIDGO API. A health check that fails
 * when the API is down would let an API outage mark a perfectly good portal
 * unhealthy — and, because a deploy is gated on health, would block shipping the
 * portal precisely when Operations most needs a fix. API reachability is the
 * API's own health check (`gridgo-api.talasora.com/health`).
 *
 * `apiBase` is echoed because `NEXT_PUBLIC_API_URL` is inlined at *build* time:
 * this is how an operator confirms the running image was built against the right
 * API without shipping a bundle to a browser. It is public configuration, not a
 * secret.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      ok: true,
      service: "gridgo-web",
      apiBase: getConfiguredApiBase(),
      commit: process.env.GRIDGO_BUILD_SHA ?? "unknown",
      builtAt: process.env.GRIDGO_BUILD_TIME ?? "unknown",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
