"use client";

import { ClerkOnboarding } from "@/app/login/ClerkOnboarding";
import { LegacyLogin } from "@/app/login/LegacyLogin";
import { isClerkAuthEnabled } from "@/lib/auth/clerk-config";

export default function LoginPage() {
  return isClerkAuthEnabled() ? <ClerkOnboarding /> : <LegacyLogin />;
}
