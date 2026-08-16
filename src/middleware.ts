import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

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

  const login = new URL("/login", request.url);
  login.searchParams.set("redirect_url", request.url);
  const response = NextResponse.redirect(login);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export default clerkMiddleware(portalSessionMiddleware);

export const config = {
  matcher: [
    "/",
    "/login",
    "/supplier/:path*",
    "/ops/:path*",
    "/admin/:path*",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
