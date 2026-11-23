// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FLYERS, LinkStub, catalogue, stubDom, templateProduct } from "./fixtures";

const mocks = vi.hoisted(() => ({
  createProductSetupRequest: vi.fn(),
  listMyProductSetupRequests: vi.fn(),
  uploadProductSetupFile: vi.fn(),
  listMyProductTemplates: vi.fn(),
  getTemplateProduct: vi.fn(),
}));

stubDom();

vi.mock("next/link", () => ({ default: LinkStub }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => undefined }));
vi.mock("@/lib/api/product-templates", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/product-templates")>(
    "@/lib/api/product-templates",
  );
  return { ...actual, ...mocks };
});

import AskTemplatePage from "@/app/supplier/catalogue/ask/page";
import CheckProductsPage from "@/app/supplier/catalogue/check/page";
import SetupHelpPage from "@/app/supplier/catalogue/setup/page";
import { CheckProductsCard } from "@/components/product-templates/supplier/CheckProductsCard";
import { useCheckProducts, useTemplateSummary } from "@/components/product-templates/supplier/useCheckProducts";

function CardHarness() {
  const { summary } = useTemplateSummary();
  const { check } = useCheckProducts(summary);
  return <CheckProductsCard check={check} />;
}

beforeEach(() => {
  mocks.listMyProductSetupRequests.mockResolvedValue({ requests: [] });
  mocks.createProductSetupRequest.mockResolvedValue({ request: { id: "psr_1" } });
  mocks.uploadProductSetupFile.mockImplementation(async (file: File) => ({
    fileId: `file_${file.name}`,
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Ask GRIDGO to add a product", () => {
  it("asks for a name and a message, then sends both", async () => {
    const user = userEvent.setup();
    render(<AskTemplatePage />);
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(screen.getByText("Name the product, the way a client would ask for it.")).toBeVisible();
    expect(mocks.createProductSetupRequest).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "Product" }), "Acrylic keychains");
    await user.type(screen.getByRole("textbox", { name: "About it" }), "5 cm, both sides");
    await user.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() =>
      expect(mocks.createProductSetupRequest).toHaveBeenCalledWith({
        kind: "template",
        requestedName: "Acrylic keychains",
        message: "5 cm, both sides",
      }),
    );
    expect(await screen.findByTestId("request-sent")).toHaveTextContent("Acrylic keychains");
  });

  it("lists the shop's own requests with the GRIDGO team's answer", async () => {
    mocks.listMyProductSetupRequests.mockResolvedValue({
      requests: [
        {
          id: "psr_9",
          kind: "template",
          requestedName: "Lanyards",
          status: "needs_revision",
          reason: "Which width?",
          createdAt: "2026-11-20T02:00:00.000Z",
          version: 2,
        },
      ],
    });
    render(<AskTemplatePage />);
    expect(await screen.findByText("Lanyards")).toBeVisible();
    expect(screen.getByText(/Which width\?/)).toBeVisible();
  });
});

describe("Let GRIDGO set it up", () => {
  it("needs a file or a message", async () => {
    const user = userEvent.setup();
    render(<SetupHelpPage />);
    await user.click(screen.getByRole("button", { name: "Send to GRIDGO" }));
    expect(screen.getByTestId("flow-foot-note")).toHaveTextContent(
      "Add a photo of your price list, a voice note, or a message.",
    );
    expect(mocks.createProductSetupRequest).not.toHaveBeenCalled();
  });

  it("uploads each file, then sends their ids with the message", async () => {
    const user = userEvent.setup();
    render(<SetupHelpPage />);
    await user.upload(screen.getByTestId("setup-files"), [
      new File(["a"], "wall.jpg", { type: "image/jpeg" }),
      new File(["b"], "note.m4a", { type: "audio/mp4" }),
    ]);
    await waitFor(() => expect(screen.getAllByText("Ready")).toHaveLength(2));
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Same day before 2 PM");
    await user.click(screen.getByRole("button", { name: "Send to GRIDGO" }));
    await waitFor(() =>
      expect(mocks.createProductSetupRequest).toHaveBeenCalledWith({
        kind: "setup",
        message: "Same day before 2 PM",
        fileIds: ["file_wall.jpg", "file_note.m4a"],
      }),
    );
    expect(await screen.findByTestId("setup-sent")).toBeVisible();
  });

  it("refuses a file over 20 MB without sending it", async () => {
    const user = userEvent.setup();
    render(<SetupHelpPage />);
    const big = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 });
    await user.upload(screen.getByTestId("setup-files"), big);
    expect(await screen.findByText(/Larger than 20 MB/)).toBeVisible();
    expect(mocks.uploadProductSetupFile).not.toHaveBeenCalled();
  });
});

describe("Check your products", () => {
  it("counts products that need a price or a confirmation, and links to the list", async () => {
    mocks.listMyProductTemplates.mockResolvedValue(
      catalogue([{ ...FLYERS, addedItemIds: ["sci_1", "sci_2", "sci_3"] }], {
        checkYourProducts: { supplierId: "u1", actions: [], manual: [], unpricedItemIds: ["sci_4"] },
      }),
    );
    mocks.getTemplateProduct.mockImplementation(async (id: string) =>
      id === "sci_1"
        ? templateProduct({ item: { id } })
        : id === "sci_4"
          ? templateProduct({ item: { id, active: false }, template: { needsPrice: true } })
          : templateProduct({ item: { id, active: false }, template: { shopConfirmed: false } }),
    );
    render(<CardHarness />);
    const card = await screen.findByTestId("check-products-card");
    expect(card).toHaveAttribute("href", "/supplier/catalogue/check");
    expect(card).toHaveTextContent("1 needs a price, 2 with prices from GRIDGO to confirm.");
  });

  it("draws nothing when nothing waits on the shop", async () => {
    mocks.listMyProductTemplates.mockResolvedValue(catalogue([{ ...FLYERS, addedItemIds: ["sci_1"] }]));
    mocks.getTemplateProduct.mockResolvedValue(templateProduct());
    render(<CardHarness />);
    await waitFor(() => expect(mocks.getTemplateProduct).toHaveBeenCalled());
    expect(screen.queryByTestId("check-products-card")).toBeNull();
  });

  it("lists each waiting product with its standing and a link to its price table", async () => {
    mocks.listMyProductTemplates.mockResolvedValue(
      catalogue([{ ...FLYERS, addedItemIds: ["sci_2"] }]),
    );
    mocks.getTemplateProduct.mockResolvedValue(
      templateProduct({ item: { id: "sci_2", active: false }, template: { shopConfirmed: false } }),
    );
    render(<CheckProductsPage />);
    const link = await screen.findByRole("link", { name: /Flyers/ });
    expect(link).toHaveAttribute("href", "/supplier/catalogue/product/sci_2");
    expect(link).toHaveTextContent("Prices to confirm");
  });
});
