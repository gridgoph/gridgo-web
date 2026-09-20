import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { publicRequestUrl } from "@/lib/auth/public-request-url";
import {
  GRIDGO_DEV_WEB_HOST,
  hostnamePortFromHostHeader,
  isolatedDevWebHref,
} from "@/lib/devWebHost";

type SessionAuth = () => Promise<{ userId: string | null }>;

export function requiresPortalSession(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/supplier" ||
    pathname.startsWith("/supplier/") ||
    pathname === "/ops" ||
    pathname.startsWith("/ops/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

/**
 * Middleware authenticates a Clerk session only. Postgres membership checks
 * belong to the fixed API projection loaded by each role layout.
 */
export async function portalSessionMiddleware(auth: SessionAuth, request: NextRequest) {
  if (!requiresPortalSession(request.nextUrl.pathname)) return NextResponse.next();

  const { userId } = await auth();
  if (userId) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const destination = publicRequestUrl(request);
  const login = new URL("/login", destination.origin);
  login.searchParams.set("redirect_url", destination.href);
  const response = NextResponse.redirect(login);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function bounceIsolatedDevWebHost(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (process.env.JEST_WORKER_ID || process.env.VITEST) return null;
  const url = request.nextUrl;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const fromHost = hostnamePortFromHostHeader(forwardedHost || request.headers.get("host"));
  const href = isolatedDevWebHref(
    {
      protocol: url.protocol,
      hostname: fromHost?.hostname ?? url.hostname,
      port: fromHost?.port || url.port,
      pathname: url.pathname,
      search: url.search,
      hash: "",
    },
    GRIDGO_DEV_WEB_HOST,
  );
  if (!href) return null;
  return NextResponse.redirect(href);
}

const clerk = clerkMiddleware(portalSessionMiddleware);

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const bounced = bounceIsolatedDevWebHost(request);
  if (bounced) return bounced;
  return clerk(request, event);
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/supplier/:path*",
    "/ops/:path*",
    "/admin/:path*",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
    "/clerk-sync-keyless",
  ],
};
