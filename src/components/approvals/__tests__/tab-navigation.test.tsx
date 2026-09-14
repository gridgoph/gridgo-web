// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import OpsApprovals from "@/app/ops/approvals/page";
import AdminVerification from "@/app/admin/verification/page";

vi.stubGlobal("React", React);
const navigation = vi.hoisted(() => ({ url: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(navigation.url.split("?")[1] ?? ""),
  useRouter: () => ({ replace: navigation.replace }),
}));
vi.mock("@/components/approvals/SignupApprovals", () => ({
  SignupApprovals: () => <p>Signup queue</p>,
}));
vi.mock("@/components/approvals/ServiceLines", () => ({
  ServiceLines: () => <p>Service queue</p>,
}));
afterEach(() => {
  cleanup();
  navigation.replace.mockReset();
});

it.each([
  ["/ops/approvals", OpsApprovals],
  ["/admin/verification", AdminVerification],
] as const)(
  "keeps %s tabs synchronized with manual and inbox navigation",
  (path, Page) => {
    navigation.url = path;
    navigation.replace.mockImplementation((url: string) => {
      navigation.url = url;
    });
    const view = render(<Page />);
    expect(screen.getByRole("tab", { name: "Sign-ups" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Service lines" }));
    expect(navigation.replace).toHaveBeenCalledWith(path + "?tab=services", {
      scroll: false,
    });
    view.rerender(<Page />);
    expect(screen.getByRole("tab", { name: "Service lines" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    navigation.url = path;
    view.rerender(<Page />);
    expect(screen.getByRole("tab", { name: "Sign-ups" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    navigation.url = path + "?tab=services&filter=pending";
    view.rerender(<Page />);
    fireEvent.click(screen.getByRole("tab", { name: "Sign-ups" }));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      path + "?tab=signups&filter=pending",
      { scroll: false },
    );
    view.rerender(<Page />);
    expect(screen.getByRole("tab", { name: "Sign-ups" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
);
