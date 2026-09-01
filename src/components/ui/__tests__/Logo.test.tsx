// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Logo } from "@/components/ui/Logo";

vi.stubGlobal("React", React);

afterEach(() => {
  cleanup();
});

describe("Logo", () => {
  it("renders the 3×3 GRIDGO grid with the brand yellow and muted dots", () => {
    const { container } = render(<Logo compact />);
    const mark = container.querySelector('[data-slot="logo-mark"]');
    expect(mark).toBeInTheDocument();
    const dots = mark?.querySelectorAll("circle");
    expect(dots).toHaveLength(9);

    const topRight = [...(dots ?? [])].find(
      (dot) => dot.getAttribute("cx") === "40" && dot.getAttribute("cy") === "8",
    );
    const centerRight = [...(dots ?? [])].find(
      (dot) => dot.getAttribute("cx") === "40" && dot.getAttribute("cy") === "24",
    );
    const bottomRight = [...(dots ?? [])].find(
      (dot) => dot.getAttribute("cx") === "40" && dot.getAttribute("cy") === "40",
    );
    expect(topRight?.getAttribute("fill")).toBe("var(--color-brand-logo)");
    expect(centerRight?.getAttribute("fill")).toBe("var(--color-brand-logo-muted)");
    expect(bottomRight?.getAttribute("fill")).toBe("var(--color-brand-logo-muted)");

    const others = [...(dots ?? [])].filter(
      (dot) => dot !== topRight && dot !== centerRight && dot !== bottomRight,
    );
    expect(others).toHaveLength(6);
    expect(others.every((dot) => dot.getAttribute("fill") === "currentColor")).toBe(
      true,
    );
  });

  it("shows the wordmark beside the mark unless compact", () => {
    const { rerender } = render(<Logo />);
    expect(screen.getByLabelText("GRIDGO")).toHaveTextContent("GRIDGO");

    rerender(<Logo compact />);
    expect(screen.getByLabelText("GRIDGO").textContent).toBe("");
  });
});
