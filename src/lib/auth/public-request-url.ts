import type { NextRequest } from "next/server";

/** Browser-facing portal origin. The container bind address is never this. */
export const PRODUCTION_PORTAL_ORIGIN = "https://gridgo-dash.talasora.com";

/**
 * URL the signed-out visitor asked for, on the public portal host.
 *
 * Next standalone listens on `HOSTNAME=0.0.0.0`, so `request.url` behind
 * Caddy/Cloudflare is `http://0.0.0.0:3000/…`. Clerk `redirect_url` must
 * not send the browser there. Local `next dev` keeps the request host.
 */
export function publicRequestUrl(request: NextRequest): URL {
  const incoming = new URL(request.url);
  const pathAndQuery = `${incoming.pathname}${incoming.search}`;

  if (!isUnusablePublicOrigin(incoming)) {
    return incoming;
  }

  const forwardedOrigin = originFromForwarded(request.headers);
  if (forwardedOrigin) {
    const reconstructed = new URL(pathAndQuery, forwardedOrigin);
    if (!isUnusablePublicOrigin(reconstructed)) {
      return reconstructed;
    }
  }

  if (process.env.NODE_ENV === "production") {
    return new URL(pathAndQuery, PRODUCTION_PORTAL_ORIGIN);
  }

  return incoming;
}

function originFromForwarded(headers: Headers): string | null {
  const host = firstForwarded(headers.get("x-forwarded-host"));
  if (!host) return null;

  const protoRaw = firstForwarded(headers.get("x-forwarded-proto"))?.toLowerCase();
  const proto = protoRaw === "http" || protoRaw === "https" ? protoRaw : "https";

  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

function firstForwarded(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim();
  return first || undefined;
}

function isUnusablePublicOrigin(url: URL): boolean {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "0.0.0.0" ||
    hostname === "::" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "localhost" ||
    hostname === "gridgo-web"
  ) {
    return true;
  }

  // Production container listen port. next dev is the same port on localhost
  // and is already rejected above, then returned unchanged for development.
  return process.env.NODE_ENV === "production" && url.port === "3000";
}
