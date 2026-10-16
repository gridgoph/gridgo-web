// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getFile = vi.hoisted(() => vi.fn());
const getFileDownloadUrl = vi.hoisted(() => vi.fn());

vi.stubGlobal("React", React);
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getFile: (...args: unknown[]) => getFile(...args),
  getFileDownloadUrl: (...args: unknown[]) => getFileDownloadUrl(...args),
}));

import { ArtworkAttachments } from "@/components/orders/ArtworkAttachments";
import { JobFilesDialog } from "@/components/orders/JobFilesDialog";
import { OrderMeta } from "@/components/orders/OrderMeta";
import { ApiError } from "@/lib/api/client";
import type { Order, ProductionItem, StoredFile } from "@/lib/api/types";

const CANVA = "https://www.canva.com/design/DAG-demo/view";
const LATER = "2099-01-01T00:00:00.000Z";

function stored(fileId: string, originalFilename: string, type: string, size: number): StoredFile {
  return {
    fileId,
    purpose: "artwork",
    originalFilename,
    declaredContentType: type,
    detectedContentType: type,
    size,
    ownerId: "client",
    state: "ready",
    createdAt: "2026-10-05T00:00:00.000Z",
    readyAt: "2026-10-05T00:00:01.000Z",
    deleteRequestedAt: null,
    deletedAt: null,
    references: [],
  };
}

const FILES: Record<string, StoredFile> = {
  front: stored("front", "front.png", "image/png", 43893),
  back: stored("back", "back.png", "image/png", 31546),
  logo: stored("logo", "logo.pdf", "application/pdf", 795834),
  tote: stored("tote", "tote.png", "image/png", 23537),
  flyer: stored("flyer", "flyer.png", "image/png", 43169),
};

function line(partial: Partial<ProductionItem> & Pick<ProductionItem, "id" | "itemName">): ProductionItem {
  return { quantity: 10, measurement: null, artworkLinks: [], ...partial };
}

const SHIRT = line({
  id: "shirt",
  itemName: "Printed T-shirt",
  artworkFileId: "front",
  artworkLinks: [{ formatCode: "canva_link", url: CANVA, label: "Logo design" }],
  artworkAttachments: [
    { kind: "file", fileId: "front", label: "Front", downloadUrl: "https://signed.test/front?order", downloadUrlExpiresAt: LATER },
    { kind: "file", fileId: "back", label: "Back" },
    { kind: "link", formatCode: "canva_link", url: CANVA, label: "Logo design" },
    { kind: "file", fileId: "logo", label: "Logo PDF" },
  ],
});
const TOTE = line({ id: "tote", itemName: "Tote bag", artworkFileId: "tote", artworkAttachments: [{ kind: "file", fileId: "tote" }] });

function order(partial: Partial<Order> = {}): Order {
  return {
    id: "order1",
    clientId: "client",
    supplierId: "shop",
    riderId: null,
    state: "production",
    title: "Printed T-shirts",
    quantity: 20,
    deadline: null,
    address: "Dropoff",
    totalMinor: 12000,
    deliveryFeeMinor: 1000,
    paymentMethod: "qr_manual",
    paymentStatus: "initial_payment_confirmed",
    promisedDate: null,
    artworkName: null,
    artworkFileIds: ["front", "back", "logo", "tote"],
    mockupFileIds: [],
    productionItems: [SHIRT, TOTE],
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

describe("artwork attachments", () => {
  let issued: string[];
  let saved: string[];

  beforeEach(() => {
    issued = [];
    saved = [];
    getFile.mockImplementation(async (id: string) => {
      const file = FILES[id];
      if (!file) throw new Error(`missing ${id}`);
      return file;
    });
    getFileDownloadUrl.mockImplementation(async (id: string) => {
      issued.push(id);
      return `https://signed.test/${id}?n=${issued.length}`;
    });
    vi.stubGlobal("React", React);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["bytes"]))));
    URL.createObjectURL = vi.fn(() => "blob:saved");
    URL.revokeObjectURL = vi.fn(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function save(this: HTMLAnchorElement) {
      if (this.download) saved.push(this.download);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    getFile.mockReset();
    getFileDownloadUrl.mockReset();
  });

  it("lists every file and link per item, in the client's order, with label, name, type and size", async () => {
    render(<ArtworkAttachments order={order()} audience="shop" />);
    const shirt = screen.getByRole("list", { name: "Artwork for Printed T-shirt" });
    expect(screen.getByText("3 files · 1 design link")).toBeInTheDocument();
    expect(screen.getByText("1 file")).toBeInTheDocument();
    await within(shirt).findByText("PDF · 777 KB");
    const rows = within(shirt).getAllByRole("listitem").map((row) => row.textContent);
    expect(rows[0]).toMatch(/Front.*Main file.*front\.png.*PNG · 43 KB/);
    expect(rows[1]).toMatch(/Back.*back\.png.*PNG · 31 KB/);
    expect(rows[2]).toMatch(/Logo design.*Canva link/);
    expect(rows[3]).toMatch(/Logo PDF.*logo\.pdf.*PDF · 777 KB/);
    expect(screen.getAllByTestId("main-file-mark")).toHaveLength(1);
    expect(screen.getByText(/ask the GRIDGO Team/)).toBeInTheDocument();
  });

  it("previews the main file from the order's signed link without asking again", async () => {
    render(<ArtworkAttachments order={order({ productionItems: [SHIRT] })} audience="shop" />);
    const preview = await screen.findByTestId("attachment-preview-image");
    expect(preview).toHaveAttribute("src", "https://signed.test/front?order");
    expect(getFileDownloadUrl).not.toHaveBeenCalled();
  });

  it("opens and downloads each file through a fresh signed link", async () => {
    const user = userEvent.setup();
    render(<ArtworkAttachments order={order()} audience="shop" />);
    await user.click(await screen.findByRole("button", { name: "Open Back, back.png" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      (await within(dialog).findByRole("img", { name: "back.png" })).getAttribute("src"),
    ).toMatch(/^https:\/\/signed\.test\/back\?n=\d+$/);
    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: "Download Logo PDF, logo.pdf" }));
    await waitFor(() => expect(saved).toEqual(["logo.pdf"]));
    // The tote's preview had no signed link with the order, so it asked once too.
    expect(issued.filter((id) => id !== "tote")).toEqual(["back", "logo"]);
  });

  it("opens a design link at its host, and copies it", async () => {
    render(<ArtworkAttachments order={order()} audience="shop" />);
    const link = screen.getByRole("link", { name: /Logo design/ });
    expect(link).toHaveAttribute("href", CANVA);
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: "Copy Logo design link" })).toBeInTheDocument();
  });

  it("fails one file on its own row and retries it alone", async () => {
    const user = userEvent.setup();
    let failBack = true;
    getFile.mockImplementation(async (id: string) => {
      if (id === "back" && failBack) throw new Error("offline");
      return FILES[id];
    });
    render(<ArtworkAttachments order={order()} audience="shop" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This file could not load.");
    expect(await screen.findByRole("button", { name: "Download Logo PDF, logo.pdf" })).toBeEnabled();
    failBack = false;
    await user.click(screen.getByRole("button", { name: "Retry Back" }));
    expect(await screen.findByRole("button", { name: "Download Back, back.png" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says a deleted file is gone instead of offering a retry", async () => {
    getFile.mockImplementation(async (id: string) => {
      if (id === "back") throw new ApiError(404, { error: "not_found" });
      return FILES[id];
    });
    render(<ArtworkAttachments order={order()} audience="shop" />);
    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
  });

  it("counts what the GRIDGO Team has opened during the file check", async () => {
    const user = userEvent.setup();
    render(<ArtworkAttachments order={order()} audience="staff" review />);
    expect(screen.getByText("0 of 5 opened.")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Download Back, back.png" }));
    await user.click(screen.getByRole("link", { name: /Logo design/ }));
    expect(await screen.findByText("2 of 5 opened.")).toBeInTheDocument();
    expect(screen.getAllByText("Opened")).toHaveLength(2);
    expect(screen.getByText(/Send the order back so the client can share it openly/)).toBeInTheDocument();
  });

  it("puts the list on the shop's spec and every file in Download files", async () => {
    const user = userEvent.setup();
    render(
      <>
        <OrderMeta order={order()} showMoney={false} />
        <JobFilesDialog order={order()} />
      </>,
    );
    expect(screen.getByTestId("artwork-attachments")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download files" }));
    const dialog = await screen.findByRole("dialog");
    const choices = within(within(dialog).getByRole("group", { name: "Choose a file" })).getAllByRole("button");
    expect(choices.map((choice) => choice.textContent)).toEqual([
      "Front · Printed T-shirt",
      "Back · Printed T-shirt",
      "Logo PDF · Printed T-shirt",
      "Artwork · Tote bag",
    ]);
  });

  it("leaves an older one-file job as it was", async () => {
    const legacy = order({
      artworkFileIds: ["flyer"],
      productionItems: [line({ id: "flyers", itemName: "Standard flyer", artworkFileId: "flyer" })],
    });
    render(<OrderMeta order={legacy} showMoney={false} />);
    expect(screen.queryByTestId("artwork-attachments")).not.toBeInTheDocument();
    expect(screen.getByText("Artwork · Standard flyer")).toBeInTheDocument();
    expect(screen.queryByTestId("main-file-mark")).not.toBeInTheDocument();
  });
});
