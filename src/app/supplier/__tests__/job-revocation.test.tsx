// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError, getOrder } from "@/lib/api/client";
import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";
import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";
vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "completed-job" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api/client", async () => ({ ...await vi.importActual("@/lib/api/client"), getOrder: vi.fn() }));
afterEach(cleanup);
it("removes a completed job's private details after an identity suspension hint", async () => {
  vi.mocked(getOrder).mockResolvedValueOnce({ id: "completed-job", state: "completed", title: "Private completed order", clientId: "c", supplierId: "s", totalMinor: 0, deliveryFeeMinor: 0, timeline: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" } as never);
  let listener!: Parameters<LiveContextValue["subscribe"]>[0];
  const context = { live: true, subscribe: (next: typeof listener) => { listener = next; return () => {}; } } as LiveContextValue;
  render(<LiveContext.Provider value={context}><SupplierJobDetailPage /></LiveContext.Provider>);
  await screen.findByText("Private completed order");
  vi.mocked(getOrder).mockRejectedValueOnce(new ApiError(403, { error: "supplier_not_approved" }));
  await act(async () => listener({ resource: "identity" }));
  await waitFor(() => expect(screen.queryByText("Private completed order")).toBeNull());
  await screen.findByText("Could not load this job. Retry when the API responds.");
});
