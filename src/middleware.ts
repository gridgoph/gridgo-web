import { NextResponse, type NextRequest } from "next/server";

const TOKEN_COOKIE = "gridgo_token";
const ROLE_COOKIE = "gridgo_role";

const PORTAL_ROLES = new Set(["supplier", "ops_admin", "super_admin"]);

function homeForRole(role: string): string {
  switch (role) {
    case "supplier":
      return "/supplier/jobs";
    case "ops_admin":
      return "/ops/qa";
    case "super_admin":
      return "/admin/overview";
    default:
      return "/login";
  }
}

function roleForPath(pathname: string): string | null {
  if (pathname === "/supplier" || pathname.startsWith("/supplier/")) return "supplier";
  if (pathname === "/ops" || pathname.startsWith("/ops/")) return "ops_admin";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "super_admin";
  return null;
}

/**
 * One gate: cookies decide which route group is reachable.
 * Pages re-validate with GET /auth/me; middleware only blocks wrong-role URLs
 * and bounces signed-out visitors off protected trees.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const role = request.cookies.get(ROLE_COOKIE)?.value;
  const requiredRole = roleForPath(pathname);

  // Public: login
  if (pathname === "/login") {
    if (token && role && PORTAL_ROLES.has(role)) {
      return NextResponse.redirect(new URL(homeForRole(role), request.url));
    }
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  // Root → role home or login
  if (pathname === "/") {
    if (token && role && PORTAL_ROLES.has(role)) {
      return NextResponse.redirect(new URL(homeForRole(role), request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Role-gated trees
  if (requiredRole) {
    if (!token || !role) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      const res = NextResponse.redirect(login);
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
    if (role !== requiredRole) {
      // Never serve another role's routes — send them home, not 404 flash.
      const res = NextResponse.redirect(new URL(homeForRole(role), request.url));
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/supplier/:path*", "/ops/:path*", "/admin/:path*"],
};
