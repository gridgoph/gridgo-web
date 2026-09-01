import type { Role } from "@/lib/api/types";

/** Role → home path. Single source of truth for post-login landing. */
export const ROLE_HOME: Record<Role, string> = {
  supplier: "/supplier/jobs",
  ops_admin: "/ops/orders",
  super_admin: "/admin/overview",
  client: "/login",
  rider: "/login",
};

/** Role → path prefix for that role's area. */
export const ROLE_PREFIX: Record<string, Role> = {
  "/supplier": "supplier",
  "/ops": "ops_admin",
  "/admin": "super_admin",
};

export function homeForRole(role: Role): string {
  return ROLE_HOME[role] ?? "/login";
}

/** True when `pathname` belongs to a different role area than `role`. */
export function isForeignRolePath(pathname: string, role: Role): boolean {
  for (const [prefix, owner] of Object.entries(ROLE_PREFIX)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return owner !== role;
    }
  }
  return false;
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "supplier":
      return "Supplier partner";
    case "ops_admin":
      return "Operations";
    case "super_admin":
      return "Super Admin";
    case "client":
      return "Client";
    case "rider":
      return "Rider";
    default:
      return role;
  }
}
