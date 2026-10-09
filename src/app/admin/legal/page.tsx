"use client";

import { LegalLibrary } from "@/components/legal/LegalLibrary";

export default function AdminLegalPage() {
  return <LegalLibrary tree="admin" canEdit={true} />;
}
