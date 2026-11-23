import type { Metadata } from "next";

import { SignupWizard } from "@/components/supplier-signup/SignupWizard";

export const metadata: Metadata = {
  title: "Set up your print shop · GRIDGO",
  robots: { index: false, follow: false },
};

/**
 * The portal's one public sign-up: a print shop opens on GRIDGO
 * (gridgoph/gridgo-web#328). Supplier only, with no role to pick; staff,
 * Operations and Super Admin accounts are never created here.
 */
export default function SignupPage() {
  return <SignupWizard />;
}
