"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth/AuthProvider";
import { portalRolesFromMemberships } from "@/lib/auth/portal-access";

type Props = {
  /** What Operations reached, in a sentence: "Operational settings are changed by Super Admin." */
  body: string;
  /** The same page in the Super Admin tree. */
  adminHref: "/admin/settings" | "/admin/audit" | "/admin/verification";
  /** Button text for a person who also holds Super Admin: "Open settings as Super Admin". */
  adminLabel: string;
};

/**
 * What an Operations user sees at a link that is Super Admin only. It gives a
 * next step, and a person who also holds Super Admin gets the way there. The
 * link is convenience only: the admin tree checks its own projection.
 */
export function SuperAdminOnly({ body, adminHref, adminLabel }: Props) {
  const { memberships } = useAuth();
  const alsoSuperAdmin = portalRolesFromMemberships(memberships).includes("super_admin");
  return (
    <EmptyState
      title="Super Admin only"
      body={
        alsoSuperAdmin
          ? `${body} Your account is also Super Admin, so you can open it there.`
          : `${body} Ask a Super Admin if something here needs to change.`
      }
      action={
        alsoSuperAdmin ? (
          <Link href={adminHref} className={buttonVariants({ variant: "secondary" })}>
            {adminLabel}
          </Link>
        ) : undefined
      }
    />
  );
}
