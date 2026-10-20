"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { applyTheme, clearTheme, readThemePreference, type ThemePreference } from "@/lib/theme";

type Choice = ThemePreference | "system";

const CHOICES: { id: Choice; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/**
 * System, Light, or Dark. System clears the stored choice so the device
 * preference applies. Light and Dark stay on this browser.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    const update = () => setChoice(readThemePreference() ?? "system");
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  function pick(next: Choice) {
    if (next === "system") clearTheme();
    else applyTheme(next);
    setChoice(next);
  }

  return (
    <div role="group" aria-label="Colour theme" className="flex items-center gap-1">
      {CHOICES.map((entry) => (
        <Button
          key={entry.id}
          variant={choice === entry.id ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={choice === entry.id}
          onClick={() => pick(entry.id)}
        >
          {entry.label}
        </Button>
      ))}
    </div>
  );
}
