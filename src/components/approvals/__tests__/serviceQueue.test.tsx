// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import OpsApprovals from "@/app/ops/approvals/page";
vi.stubGlobal("React", React);
const list = vi.hoisted(() => vi.fn(async () => []));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=services"),
}));
vi.mock("@/components/approvals/SignupApprovals", () => ({
  SignupApprovals: () => <p>Signup queue</p>,
}));
vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  listSupplierServices: list,
}));
afterEach(cleanup);
it("opens the real service review queue within the Operations route", async () => {
  render(<OpsApprovals />);
  expect(await screen.findByText("No service lines")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Service lines" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(list).toHaveBeenCalledTimes(1);
});
