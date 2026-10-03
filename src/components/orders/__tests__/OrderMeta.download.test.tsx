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
import type { ArtworkLink, Order, ProductionItem, StoredFile } from "@/lib/api/types";

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
  file_other_art: stored({ fileId: "file_other_art", originalFilename: "other-shop-poster.jpg" }),
  file_other_mock: stored({
    fileId: "file_other_mock",
    originalFilename: "other-shop-mock.png",
    purpose: "mockup",
    declaredContentType: "image/png",
    detectedContentType: "image/png",
  }),
};

function line(partial: Partial<ProductionItem> & Pick<ProductionItem, "id" | "itemName">): ProductionItem {
  return { quantity: 100, measurement: null, artworkLinks: [], ...partial };
}

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
    await user.click(screen.getByRole("button", { name: "Download front.jpg" }));

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
    expect(screen.getAllByRole("button", { name: /^Download / })).toHaveLength(3);
    for (const name of ["front.jpg", "back.pdf", "mock.png"]) {
      const button = screen.getByRole("button", { name: `Download ${name}` });
      expect(button).toHaveTextContent(/^Download$/);
    }

    const preview = pdf.getAttribute("href");
    await user.click(within(plate("Artwork 2")).getByRole("button", { name: "Download back.pdf" }));

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
    await user.click(screen.getByRole("button", { name: "Download front.jpg" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not download this file. Try again.",
    );
    expect(screen.getByRole("img", { name: "front.jpg" })).toHaveAttribute("src", preview);
    expect(screen.getByRole("button", { name: "Download front.jpg" })).toBeEnabled();
    expect(saved).toEqual([]);
    const fetched = String(fetchMock.mock.calls[0][0]);
    expect(fetched).not.toBe(preview);
    expect(getFileDownloadUrl.mock.calls.map((call) => call[0])).toEqual([
      "file_front",
      "file_front",
    ]);
  });

  it("shows a shop only its own lines' files on a two-shop order", async () => {
    // The API sends the order-wide ids for both shops' lines, but this shop's
    // productionItems hold only its own job line.
    render(
      <OrderMeta
        order={order({
          artworkFileIds: ["file_front", "file_other_art"],
          mockupFileIds: ["file_mock", "file_other_mock"],
          artworkName: "other-shop-poster.jpg",
          productionItems: [
            line({
              id: "line_a",
              itemName: "Flyers A5",
              artworkFileId: "file_front",
              mockupFileId: "file_mock",
            }),
          ],
        })}
        showMoney={false}
      />,
    );

    expect(await screen.findByRole("img", { name: "front.jpg" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "mock.png" })).toBeInTheDocument();
    expect(screen.getByText("Artwork · Flyers A5")).toBeInTheDocument();
    expect(screen.getByText("Mockup · Flyers A5")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Download / })).toHaveLength(2);
    expect(screen.queryByText(/other-shop/)).not.toBeInTheDocument();
    const asked = [...getFile.mock.calls, ...getFileDownloadUrl.mock.calls].map((call) => call[0]);
    expect(asked).not.toContain("file_other_art");
    expect(asked).not.toContain("file_other_mock");
  });

  it("names each plate by its line when the job has several", async () => {
    render(
      <OrderMeta
        order={order({
          artworkFileIds: ["file_front", "file_back"],
          mockupFileIds: ["file_mock"],
          productionItems: [
            line({ id: "line_a", itemName: "Flyers A5", artworkFileId: "file_front", mockupFileId: "file_mock" }),
            line({ id: "line_b", itemName: "Posters A3", artworkFileId: "file_back" }),
          ],
        })}
        showMoney={false}
      />,
    );

    expect(await screen.findByRole("img", { name: "front.jpg" })).toBeInTheDocument();
    expect(screen.getByText("Artwork · Flyers A5")).toBeInTheDocument();
    expect(screen.getByText("Artwork · Posters A3")).toBeInTheDocument();
    expect(screen.getByText("Mockup · Flyers A5")).toBeInTheDocument();
    expect(
      within(plate("Artwork · Posters A3")).getByRole("button", { name: "Download back.pdf" }),
    ).toBeInTheDocument();
  });

  it("says Downloading… while the file is on its way", async () => {
    const user = userEvent.setup();
    let finish: (response: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (finish = resolve)),
    );
    render(
      <OrderMeta order={order({ artworkFileIds: ["file_front"] })} showMoney={false} />,
    );

    await screen.findByRole("img", { name: "front.jpg" });
    await user.click(screen.getByRole("button", { name: "Download front.jpg" }));

    const busy = await screen.findByRole("button", { name: "Downloading front.jpg" });
    expect(busy).toHaveTextContent("Downloading…");
    expect(busy).toBeDisabled();

    finish(new Response(new Blob(["print-bytes"])));
    const idle = await screen.findByRole("button", { name: "Download front.jpg" });
    expect(idle).toHaveTextContent(/^Download$/);
    expect(idle).toBeEnabled();
    expect(saved).toHaveLength(1);
  });

  it("revokes the saved file's URL only after the save has started", async () => {
    const user = userEvent.setup();
    const timers: Array<{ run: () => void; ms: number | undefined }> = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      run: () => void,
      ms?: number,
    ) => {
      if (ms === 10_000) {
        timers.push({ run, ms });
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return realSetTimeout(run, ms);
    }) as typeof setTimeout);
    render(
      <OrderMeta order={order({ artworkFileIds: ["file_front"] })} showMoney={false} />,
    );

    await screen.findByRole("img", { name: "front.jpg" });
    await user.click(screen.getByRole("button", { name: "Download front.jpg" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(timers).toHaveLength(1);
    timers[0].run();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:saved-print");
  });

  it("offers a retry when the signed link is refused", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response("expired", { status: 403 }));
    render(
      <OrderMeta order={order({ artworkFileIds: ["file_front"] })} showMoney={false} />,
    );

    await screen.findByRole("img", { name: "front.jpg" });
    await user.click(screen.getByRole("button", { name: "Download front.jpg" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not download this file. Try again.",
    );
    expect(saved).toEqual([]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Download front.jpg" })).toBeEnabled();
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
    expect(screen.queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
    expect(screen.queryByText("None on file")).not.toBeInTheDocument();
  });

  it("shows the empty plates without a download button", () => {
    render(<OrderMeta order={order()} showMoney={false} />);
    expect(screen.getByText("None on file")).toBeInTheDocument();
    expect(screen.getByText("No mockup on file")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
  });
});
