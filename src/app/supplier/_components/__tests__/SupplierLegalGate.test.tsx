// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  path: "/supplier/jobs",
  userId: "shop",
  replace: vi.fn(),
  pending: vi.fn(),
  accept: vi.fn(),
}));
vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({
  usePathname: () => m.path,
  useRouter: () => ({ replace: m.replace }),
}));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: { id: m.userId } }) }));
vi.mock("@/lib/api/supplier-self", () => ({
  getSupplierLegalPending: m.pending,
  acceptSupplierLegal: m.accept,
}));
import { SupplierLegalGate, useSupplierLegal } from "../SupplierLegalGate";
const doc = {
  id: "v1",
  documentId: "supplier-agreement",
  version: 1,
  title: "Shop terms",
  text: "Text",
  effectiveAt: "2026-01-01",
};
const blocked = { blocking: true, pending: [doc], notices: [] };
const clear = { blocking: false, pending: [], notices: [] };
function Work() {
  React.useEffect(() => {
    m.accept("work-mounted");
  }, []);
  return <div>Ordinary work</div>;
}
function Agreement() {
  const gate = useSupplierLegal();
  return (
    <>
      <span>{gate.pending.map((d) => d.id).join(",")}</span>
      <button onClick={() => void gate.accept(gate.pending.map((d) => d.id))}>
        Accept these
      </button>
    </>
  );
}
beforeEach(() => {
  m.path = "/supplier/jobs";
  m.userId = "shop";
  m.replace.mockReset();
  m.pending.mockReset().mockResolvedValue(clear);
  m.accept.mockReset().mockResolvedValue(clear);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("never mounts work while a blocking response is being redirected", async () => {
  m.pending.mockResolvedValue(blocked);
  render(
    <SupplierLegalGate>
      <Work />
    </SupplierLegalGate>,
  );
  await waitFor(() => expect(m.replace).toHaveBeenCalledWith("/supplier/legal/review"));
  expect(screen.queryByText("Ordinary work")).not.toBeInTheDocument();
  expect(m.accept).not.toHaveBeenCalled();
});
it("does not treat a slow required read as clearance after five seconds", async () => {
  vi.useFakeTimers();
  m.pending.mockReturnValue(new Promise(() => {}));
  render(
    <SupplierLegalGate>
      <Work />
    </SupplierLegalGate>,
  );
  await act(async () => vi.advanceTimersByTime(6000));
  expect(screen.queryByText("Ordinary work")).not.toBeInTheDocument();
});
it("keeps failed verification closed and lets the shop retry", async () => {
  m.pending.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(clear);
  render(
    <SupplierLegalGate>
      <Work />
    </SupplierLegalGate>,
  );
  await screen.findByRole("alert");
  expect(screen.queryByText("Ordinary work")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Ordinary work");
});
it("rechecks on focus and removes work when new consent becomes required", async () => {
  m.pending.mockResolvedValueOnce(clear).mockResolvedValue(blocked);
  render(
    <SupplierLegalGate>
      <div>Ordinary work</div>
    </SupplierLegalGate>,
  );
  await screen.findByText("Ordinary work");
  fireEvent.focus(window);
  await waitFor(() => expect(m.replace).toHaveBeenCalled());
  expect(screen.queryByText("Ordinary work")).not.toBeInTheDocument();
});
it("shows editorial notices without requiring another checkbox", async () => {
  m.pending.mockResolvedValue({
    ...clear,
    notices: [{ ...doc, id: "editorial", title: "Updated privacy notice" }],
  });
  render(
    <SupplierLegalGate>
      <div>Ordinary work</div>
    </SupplierLegalGate>,
  );
  await screen.findByText("Ordinary work");
  expect(screen.getByRole("link", { name: "Updated privacy notice" })).toHaveAttribute(
    "href",
    "/supplier/legal/editorial",
  );
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
it("keeps the legal and privacy pages available during a pending check", async () => {
  m.path = "/supplier/privacy";
  m.pending.mockReturnValue(new Promise(() => {}));
  render(
    <SupplierLegalGate>
      <div>Your data request</div>
    </SupplierLegalGate>,
  );
  expect(screen.getByText("Your data request")).toBeVisible();
});
it("refetches a changed version before another acceptance", async () => {
  m.path = "/supplier/legal/review";
  m.pending
    .mockResolvedValueOnce(blocked)
    .mockResolvedValue({ ...blocked, pending: [{ ...doc, id: "v2" }] });
  const { ApiError } = await import("@/lib/api/client");
  m.accept.mockRejectedValueOnce(new ApiError(409, { error: "legal_version_changed" }));
  render(
    <SupplierLegalGate>
      <Agreement />
    </SupplierLegalGate>,
  );
  await screen.findByText("v1");
  fireEvent.click(screen.getByRole("button", { name: "Accept these" }));
  await screen.findByText("v2");
  expect(m.accept).toHaveBeenCalledWith(
    ["v1"],
    expect.objectContaining({ app: "gridgo-web/supplier" }),
  );
});

it("does not discard a successful acceptance when focus triggers another read", async () => {
  m.path = "/supplier/legal/review";
  m.pending.mockResolvedValue(blocked);
  let finish!: (value: typeof clear) => void;
  m.accept.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  function Submit() {
    const gate = useSupplierLegal();
    const [result, setResult] = React.useState<boolean | null>(null);
    return (
      <>
        <span>{gate.pending[0]?.id}</span>
        <button onClick={() => void gate.accept(["v1"]).then(setResult)}>
          Send acceptance
        </button>
        {result === true
          ? "Acceptance succeeded"
          : result === false
            ? "Acceptance discarded"
            : null}
      </>
    );
  }
  render(
    <SupplierLegalGate>
      <Submit />
    </SupplierLegalGate>,
  );
  await screen.findByText("v1");
  fireEvent.click(screen.getByRole("button", { name: "Send acceptance" }));
  fireEvent.focus(window);
  await act(async () => {
    await Promise.resolve();
  });
  m.pending.mockResolvedValue(clear);
  await act(async () => finish(clear));
  await screen.findByText("Acceptance succeeded");
});
