import type { Metadata } from "next";

import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProviders } from "@/components/providers/AppProviders";
import "./globals.css";
import { DEV_WEB_HOST_BOUNCE_SCRIPT } from "@/lib/devWebHost";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "GRIDGO Portal",
  description: "GRIDGO web portal — supplier partner, Operations, and Super Admin.",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }, { url: "/favicon.ico" }],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The theme class is set by the boot script before React runs, so the
    // server markup and the first client render legitimately differ here.
    <html lang="en" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === "development" ? (
          <script dangerouslySetInnerHTML={{ __html: DEV_WEB_HOST_BOUNCE_SCRIPT }} />
        ) : null}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <AppProviders>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <TooltipProvider>
            <Toaster>{children}</Toaster>
          </TooltipProvider>
        </AppProviders>
      </body>
    </html>
  );
}
