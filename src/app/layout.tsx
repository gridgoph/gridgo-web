import type { Metadata } from "next";

import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProviders } from "@/components/providers/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "GRIDGO Portal",
  description:
    "GRIDGO web portal — supplier partner, Operations, and Super Admin.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
