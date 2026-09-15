"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { applyTheme, resolveTheme, type ResolvedTheme } from "@/lib/theme";

/**
 * One control that switches the portal between light and dark.
 *
 * It shows the theme you would get by pressing it, the way a light switch
 * does, and remembers the choice for this browser. Until pressed, the portal
 * follows the device preference.
 */
export function ThemeToggle() {
  // Rendered as light on the server; corrected on the client before paint matters.
  const [theme, setTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const update = () => setTheme(resolveTheme());
    update();
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    media?.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      media?.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  const next: ResolvedTheme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Switch to dark mode" : "Switch to light mode";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={() => applyTheme(next)}
          />
        }
      >
        {next === "dark" ? <Moon aria-hidden /> : <Sun aria-hidden />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
