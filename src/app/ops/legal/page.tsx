"use client";

import { LegalLibrary } from "@/components/legal/LegalLibrary";

export default function OpsLegalPage() {
  return <LegalLibrary tree="ops" canEdit={false} />;
}
