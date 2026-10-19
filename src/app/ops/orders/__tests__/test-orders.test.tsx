// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { groupOrder } from "@/test/baskets";
import { TestOperationsProvider } from "@/lib/auth/test-operations";
import { SHOW_TEST_ORDERS_STORAGE_KEY } from "@/lib/review-data";

vi.stubGlobal("React", React);
// Base UI's switch dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
const listOrders = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  listOrders,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("stage=payment"),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const { default: OpsOrdersPage } = await import("@/app/ops/orders/page");

const table = async () =>
  within(await screen.findByRole("table", { name: "Orders at Payment" }));

const real = groupOrder({ id: "ord_real", title: "Stickers", basketId: null });
const test = groupOrder({
  id: "ord_test",
  title: "Sample flyers",
  basketId: null,
  reviewData: true,
});

beforeEach(() => {
  window.localStorage.clear();
  listOrders.mockImplementation(async (options?: { includeReviewData?: boolean }) =>
    options?.includeReviewData ? [real, test] : [real],
  );
});

afterEach(() => {
  cleanup();
  listOrders.mockReset();
});

it("leaves test orders out until Show test orders is switched on, and remembers it", async () => {
  render(<OpsOrdersPage />);
  expect((await table()).getByText("Stickers")).toBeInTheDocument();
  expect(listOrders).toHaveBeenLastCalledWith({ includeReviewData: false });
  expect(screen.queryByText("Sample flyers")).not.toBeInTheDocument();

  const toggle = screen.getByRole("switch", { name: "Show test orders" });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);

  const rows = await table();
  const row = (await rows.findByText("Sample flyers")).closest("tr")!;
  expect(within(row).getByText("Test")).toBeInTheDocument();
  expect(
    within(rows.getByText("Stickers").closest("tr")!).queryByText("Test"),
  ).toBeNull();
  expect(listOrders).toHaveBeenLastCalledWith({ includeReviewData: true });
  expect(window.localStorage.getItem(SHOW_TEST_ORDERS_STORAGE_KEY)).toBe("true");
});

it("starts on in a browser that left it on", async () => {
  window.localStorage.setItem(SHOW_TEST_ORDERS_STORAGE_KEY, "true");
  render(<OpsOrdersPage />);
  await (await table()).findByText("Sample flyers");
  expect(screen.getByRole("switch", { name: "Show test orders" })).toBeChecked();
});

it("always reads test orders for a test operations login, with no switch", async () => {
  render(
    <TestOperationsProvider value>
      <OpsOrdersPage />
    </TestOperationsProvider>,
  );
  await (await table()).findByText("Sample flyers");
  await waitFor(() =>
    expect(listOrders).toHaveBeenLastCalledWith({ includeReviewData: true }),
  );
  expect(screen.queryByRole("switch", { name: "Show test orders" })).toBeNull();
});
