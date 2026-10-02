// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getFile = vi.hoisted(() => vi.fn());
const getFileDownloadUrl = vi.hoisted(() => vi.fn());

vi.stubGlobal("React", React);
vi.mock("@/lib/api/client", () => ({
  getFile: (...args: unknown[]) => getFile(...args),
  getFileDownloadUrl: (...args: unknown[]) => getFileDownloadUrl(...args),
}));

import { OrderMeta } from "@/components/orders/OrderMeta";
import type { ArtworkLink, Order, StoredFile } from "@/lib/api/types";

const CANVA: ArtworkLink = {
  formatCode: "canva_link",
  url: "https://www.canva.com/design/DAGflyer123/view",
};

function stored(partial: Partial<StoredFile> & Pick<StoredFile, "fileId" | "originalFilename">): StoredFile {
  return {
    purpose: "artwork",
    declaredContentType: "image/jpeg",
    detectedContentType: "image/jpeg",
    size: 1200,
    ownerId: "user_client",
    state: "ready",
    createdAt: "2026-09-15T10:00:00.000Z",
    readyAt: "2026-09-15T10:00:01.000Z",
    deleteRequestedAt: null,
    deletedAt: null,
    references: [],
    ...partial,
  };
}

function order(partial: Partial<Order> = {}): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: "production",
    title: "Flyers",
    quantity: 500,
    deadline: null,
    address: "Davao",
    totalMinor: 10000,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "initial_payment_confirmed",
    promisedDate: null,
    artworkName: null,
    artworkFileIds: [],
    mockupFileIds: [],
    productionItems: [],
    createdAt: "2026-09-27T06:00:00.000Z",
    updatedAt: "2026-09-27T06:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

const FILES: Record<string, StoredFile> = {
  file_front: stored({ fileId: "file_front", originalFilename: "front.jpg" }),
  file_back: stored({
    fileId: "file_back",
    originalFilename: "back.pdf",
    purpose: "artwork",
    declaredContentType: "application/pdf",
    detectedContentType: "application/pdf",
  }),
  file_mock: stored({
    fileId: "file_mock",
    originalFilename: "mock.png",
    purpose: "mockup",
    declaredContentType: "image/png",
    detectedContentType: "image/png",
  }),
};

function plate(label: string): HTMLElement {
  const node = screen.getByText(label).parentElement;
  if (!node) throw new Error(`No plate for ${label}`);
  return node;
}

describe("supplier spec file download", () => {
  let issued: string[];
  let fetchMock: ReturnType<typeof vi.fn>;
  let saved: { name: string; href: string }[];

  beforeEach(() => {
    issued = [];
    saved = [];
    getFile.mockImplementation(async (id: string) => {
      const file = FILES[id];
      if (!file) throw new Error(`missing ${id}`);
      return file;
    });
    getFileDownloadUrl.mockImplementation(async (id: string) => {
      const url = `https://files.test/${id}?n=${issued.length + 1}`;
      issued.push(url);
      return url;
    });
    fetchMock = vi.fn(async () => new Response(new Blob(["print-bytes"])));
    vi.stubGlobal("React", React);
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = vi.fn(() => "blob:saved-print");
    URL.revokeObjectURL = vi.fn(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function saveClick(
      this: HTMLAnchorElement,
    ) {
      saved.push({ name: this.download, href: this.href });
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    getFile.mockReset();
    getFileDownloadUrl.mockReset();
  });

  it("saves one artwork file under its original name", async () => {
    const user = userEvent.setup();
    render(
      <OrderMeta order={order({ artworkFileIds: ["file_front"] })} showMoney={false} />,
    );

    const img = await screen.findByRole("img", { name: "front.jpg" });
    const preview = img.getAttribute("src");
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const fetched = String(fetchMock.mock.calls[0][0]);
    expect(fetched).toContain("file_front");
    expect(fetched).not.toBe(preview);
    expect(saved).toEqual([{ name: "front.jpg", href: expect.stringContaining("blob:saved-print") }]);
    expect(img).toHaveAttribute("src", preview);
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("lists every artwork and mockup file, each with its own download", async () => {
    const user = userEvent.setup();
    render(
      <OrderMeta
        order={order({
          artworkFileIds: ["file_front", "file_back"],
          mockupFileIds: ["file_mock"],
        })}
        showMoney={false}
      />,
    );

    expect(await screen.findByRole("img", { name: "front.jpg" })).toBeInTheDocument();
    const pdf = await screen.findByRole("link", { name: "back.pdf" });
    expect(pdf).toHaveTextContent("back.pdf");
    expect(within(pdf.parentElement!).getByText(/open the file/)).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "mock.png" })).toBeInTheDocument();
    expect(screen.getByText("Artwork 1")).toBeInTheDocument();
    expect(screen.getByText("Artwork 2")).toBeInTheDocument();
    expect(screen.getByText("Mockup")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(3);

    const preview = pdf.getAttribute("href");
    await user.click(within(plate("Artwork 2")).getByRole("button", { name: "Download" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toBe("back.pdf");
    const fetched = String(fetchMock.mock.calls[0][0]);
    expect(fetched).toContain("file_back");
    expect(fetched).not.toBe(preview);
    expect(pdf).toHaveAttribute("href", preview);
    expect(screen.getByRole("img", { name: "front.jpg" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "mock.png" })).toBeInTheDocument();
  });

  it("keeps the preview when the download fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error("network"));
    render(
      <OrderMeta order={order({ artworkFileIds: ["file_front"] })} showMoney={false} />,
    );

    const img = await screen.findByRole("img", { name: "front.jpg" });
    const preview = img.getAttribute("src");
    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not download this file. Try again.",
    );
    expect(screen.getByRole("img", { name: "front.jpg" })).toHaveAttribute("src", preview);
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    expect(saved).toEqual([]);
    const fetched = String(fetchMock.mock.calls[0][0]);
    expect(fetched).not.toBe(preview);
    expect(getFileDownloadUrl.mock.calls.map((call) => call[0])).toEqual([
      "file_front",
      "file_front",
    ]);
  });

  it("leaves a design link as a link, with no download", () => {
    render(
      <OrderMeta
        order={order({
          productionItems: [
            {
              id: "line1",
              itemName: "Flyers",
              quantity: 500,
              measurement: null,
              artworkFileId: null,
              artworkLinks: [CANVA],
            },
          ],
        })}
        showMoney={false}
      />,
    );

    expect(screen.getByRole("link", { name: /Canva/ })).toHaveAttribute("href", CANVA.url);
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
    expect(screen.queryByText("None on file")).not.toBeInTheDocument();
  });

  it("shows the empty plates without a download button", () => {
    render(<OrderMeta order={order()} showMoney={false} />);
    expect(screen.getByText("None on file")).toBeInTheDocument();
    expect(screen.getByText("No mockup on file")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  });
});
