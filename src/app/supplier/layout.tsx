import type { Metadata, Viewport } from "next";

import { RoleGate } from "@/components/shell/RoleGate";

/**
 * The supplier tree is an installable web app (`public/supplier.webmanifest`).
 * Only this tree links the manifest, so Operations and Super Admin are never
 * offered an install. Icons replace the root list here because a nested
 * `icons` overrides the parent's instead of merging.
 */
export const metadata: Metadata = {
  manifest: "/supplier.webmanifest",
  applicationName: "GRIDGO Supplier",
  appleWebApp: {
    capable: true,
    title: "GRIDGO Supplier",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }, { url: "/favicon.ico" }],
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

/** The status bar matches the shell header (`bg-surface`) in each theme. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
};

export default function SupplierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGate allow="supplier">{children}</RoleGate>;
}
