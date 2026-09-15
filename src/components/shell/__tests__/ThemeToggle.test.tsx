// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_STORAGE_KEY } from "@/lib/theme";

vi.stubGlobal("React", React);

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("light", "dark");
  window.localStorage.clear();
  Reflect.deleteProperty(window, "matchMedia");
});

function prefersDark(matches: boolean) {
  Object.assign(window, {
    matchMedia: vi.fn(() => ({
      matches,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function mount() {
  return render(
    <TooltipProvider>
      <ThemeToggle />
    </TooltipProvider>,
  );
}

it("offers dark mode on a light device, applies it, and remembers it", async () => {
  prefersDark(false);
  mount();
  const button = await screen.findByRole("button", { name: "Switch to dark mode" });
  fireEvent.click(button);
  await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
  expect(document.documentElement).not.toHaveClass("light");
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  expect(
    screen.getByRole("button", { name: "Switch to light mode" }),
  ).toBeInTheDocument();
});

it("offers light mode on a dark device and forces light with an explicit class", async () => {
  prefersDark(true);
  mount();
  const button = await screen.findByRole("button", { name: "Switch to light mode" });
  fireEvent.click(button);
  await waitFor(() => expect(document.documentElement).toHaveClass("light"));
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
});

it("starts from a remembered choice already applied to the document", async () => {
  prefersDark(false);
  document.documentElement.classList.add("dark");
  mount();
  expect(
    await screen.findByRole("button", { name: "Switch to light mode" }),
  ).toBeInTheDocument();
});

it("meets the 44px control floor", async () => {
  prefersDark(false);
  mount();
  const button = await screen.findByRole("button", { name: "Switch to dark mode" });
  expect(button.className).toMatch(/min-h-11/);
  expect(button.className).toMatch(/min-w-11/);
});
