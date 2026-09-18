// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "@/app/supplier/_components/SegmentedControl";

vi.stubGlobal("React", React);

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { value: "per_unit", label: "Per piece" },
  { value: "per_package", label: "Per pack" },
  { value: "whole_job", label: "Whole job" },
] as const;

function Harness({ onChange }: { onChange?: (next: string) => void }) {
  const [value, setValue] = useState<string>("per_unit");
  return (
    <>
      <button type="button">Before</button>
      <SegmentedControl
        aria-label="Pricing unit"
        options={OPTIONS}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <button type="button">After</button>
    </>
  );
}

describe("SegmentedControl", () => {
  it("is one radio group with exactly one checked segment", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "Pricing unit" });
    const radios = screen.getAllByRole("radio");
    expect(group).toContainElement(radios[0]);
    expect(radios).toHaveLength(3);
    expect(
      radios.filter((radio) => radio.getAttribute("aria-checked") === "true"),
    ).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Per piece" })).toBeChecked();
  });

  it("is a single tab stop and moves the choice with arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Before" }));
    await user.tab();
    expect(screen.getByRole("radio", { name: "Per piece" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Per pack" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Per pack" })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith("per_package");

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Whole job" })).toBeChecked();

    await user.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: "Per piece" })).toBeChecked();
    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "Whole job" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Whole job" })).toHaveFocus();

    // Tab leaves the group in one step; the checked segment is the only stop.
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("radio", { name: "Whole job" })).toHaveFocus();
  });

  it("selects on click", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "Per pack" }));
    expect(screen.getByRole("radio", { name: "Per pack" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Per piece" })).not.toBeChecked();
  });
});
