// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import OpsAuditPage from "@/app/ops/audit/page";
import OpsSettingsPage from "@/app/ops/settings/page";

vi.stubGlobal("React", React);

afterEach(() => {
  cleanup();
});

describe("Operations settings and audit routes", () => {
  it("shows Super Admin only on settings, with no form", () => {
    render(<OpsSettingsPage />);
    expect(screen.getByRole("heading", { name: "Super Admin only" })).toBeVisible();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.queryByLabelText(/service fee/i)).toBeNull();
  });

  it("shows Super Admin only on audit, with no rows", () => {
    render(<OpsAuditPage />);
    expect(screen.getByRole("heading", { name: "Super Admin only" })).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("row")).toBeNull();
  });
});
