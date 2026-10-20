// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ThemeToggle } from "@/components/shell/ThemeToggle";
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
  return render(<ThemeToggle />);
}

it("offers System, Light, and Dark, and Dark persists", async () => {
  prefersDark(false);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Dark" }));
  await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
  expect(document.documentElement).not.toHaveClass("light");
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
});

it("Light forces an explicit class on a dark device", async () => {
  prefersDark(true);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Light" }));
  await waitFor(() => expect(document.documentElement).toHaveClass("light"));
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
});

it("System clears the stored choice and the class", async () => {
  prefersDark(false);
  document.documentElement.classList.add("dark");
  window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "System" }));
  await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"));
  expect(document.documentElement).not.toHaveClass("light");
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
});

it("meets the 44px control floor", async () => {
  prefersDark(false);
  mount();
  const button = await screen.findByRole("button", { name: "System" });
  expect(button.className).toMatch(/min-h-11/);
});
