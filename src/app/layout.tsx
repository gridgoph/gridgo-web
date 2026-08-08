import type { Metadata } from "next";

import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth/AuthProvider";
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
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <TooltipProvider>
          <Toaster>
            <AuthProvider>{children}</AuthProvider>
          </Toaster>
        </TooltipProvider>
      </body>
    </html>
  );
}
