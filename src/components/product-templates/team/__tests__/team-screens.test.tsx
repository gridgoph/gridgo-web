// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getFile: vi.fn(),
  getFileDownloadUrl: vi.fn(),
  getTaxonomy: vi.fn(),
  listAcceptedFileFormats: vi.fn(),
  listProductTypeRequests: vi.fn(),
  listStaffCatalogItems: vi.fn(),
  listUsers: vi.fn(),
}));

const templatesApi = vi.hoisted(() => ({
  decideProductSetupRequest: vi.fn(),
  listStaffProductTemplates: vi.fn(),
  saveProductTemplate: vi.fn(),
  resolveRequestsWithTemplate: vi.fn(),
  prepareShopTemplateProduct: vi.fn(),
  reviseShopTemplateProduct: vi.fn(),
  previewShopMigration: vi.fn(),
  applyShopMigration: vi.fn(),
}));

vi.stubGlobal("React", React);

class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/ops/product-setup",
}));

vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

vi.mock("@/lib/api/product-templates", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/product-templates")>(
    "@/lib/api/product-templates",
  );
  return { ...actual, ...templatesApi };
});

import { MigrationSection } from "@/components/product-templates/team/MigrationSection";
import { PrepareSheet } from "@/components/product-templates/team/PrepareSheet";
import { RequestsTab } from "@/components/product-templates/team/RequestsTab";
import { TemplateEditor } from "@/components/product-templates/team/TemplateEditor";
import {
  normalizeTemplate,
  type ProductTemplate,
  type SetupRequest,
} from "@/lib/product-templates";

const rawTemplate = {
  id: "tpl_flyers",
  version: 3,
  active: true,
  name: "Flyers",
  description: "Single sheet flyers.",
  categoryCode: "paper",
  subcategoryCode: "flyers",
  group: "paper_prints",
  unit: "piece",
  options: [
    { key: "standard", label: "A4" },
    { key: "variant_1", label: "A5" },
  ],
  optionLists: [{ name: "Size", options: ["A4", "A5"] }],
  fileTypes: ["pdf"],
  clientTips: ["Send a PDF."],
  express: false,
  machinesNeeded: ["document_printer"],
  stockPhotos: [{ url: "/product-template-photos/flyers.jpg", altText: "Flyers" }],
  priceRange: { minMinor: 500, maxMinor: 5000 },
};
const template = normalizeTemplate(rawTemplate) as ProductTemplate;

function setupRequest(overrides: Partial<SetupRequest> = {}): SetupRequest {
  return {
    id: "psr_1",
    supplierId: "usr_shop_a",
    kind: "template",
    requestedName: "Flyers",
    message: "We print flyers.",
    fileIds: [],
    status: "pending",
    reason: null,
    templateId: null,
    version: 5,
    createdAt: "2026-11-20T00:00:00Z",
    updatedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  api.listStaffCatalogItems.mockResolvedValue({
    items: [],
    shops: [{ supplierId: "usr_shop_a", shopName: "Shop A" }],
  });
  api.listUsers.mockResolvedValue([]);
  api.getTaxonomy.mockResolvedValue({
    categories: [
      {
        id: "c",
        code: "paper",
        name: "Paper prints",
        active: true,
        productFamilyIds: [],
      },
    ],
    subcategories: [
      { id: "s", code: "flyers", categoryCode: "paper", name: "Flyers", active: true },
    ],
    materials: [],
    finishes: [],
  });
  api.listAcceptedFileFormats.mockResolvedValue([
    { code: "pdf", displayName: "PDF", inputKind: "file" },
  ]);
  api.listProductTypeRequests.mockResolvedValue({
    requests: [
      {
        id: "ptr_a3",
        supplierId: "usr_shop_a",
        categoryCode: "paper",
        name: "A3 flyers",
        description: "Bigger flyers.",
        status: "pending",
        version: 4,
        createdAt: "2026-11-19T00:00:00Z",
      },
      {
        id: "ptr_shirts",
        supplierId: "usr_shop_a",
        categoryCode: "apparel",
        name: "Shirts",
        description: "",
        status: "pending",
        version: 1,
      },
    ],
  });
  templatesApi.listStaffProductTemplates.mockResolvedValue({
    templates: [rawTemplate],
    readyTimes: [],
  });
  templatesApi.saveProductTemplate.mockResolvedValue({
    template: { ...rawTemplate, version: 4 },
  });
  templatesApi.resolveRequestsWithTemplate.mockResolvedValue({ requests: [] });
  templatesApi.decideProductSetupRequest.mockResolvedValue({ request: {} });
  templatesApi.prepareShopTemplateProduct.mockResolvedValue({ item: {} });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Requests tab", () => {
  it("completes a template request with the chosen template and the words the shop reads", async () => {
    const user = userEvent.setup();
    const onDecided = vi.fn();
    render(
      <RequestsTab
        tree="ops"
        requests={[
          setupRequest(),
          setupRequest({ id: "psr_old", status: "completed", requestedName: "Old ask" }),
        ]}
        shops={[{ supplierId: "usr_shop_a", name: "Shop A" }]}
        templates={[template]}
        onDecided={onDecided}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: /Flyers/ })[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("We print flyers.")).toBeVisible();
    const reason = within(dialog).getByRole("textbox", { name: "Shop A reads" });
    expect(reason).toHaveValue(
      "Flyers is now in the list. Open Products, Add a product, and tick it.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Mark done and tell the shop" }),
    );
    await waitFor(() =>
      expect(templatesApi.decideProductSetupRequest).toHaveBeenCalledWith("psr_1", 5, {
        status: "completed",
        reason: "Flyers is now in the list. Open Products, Add a product, and tick it.",
        templateId: "tpl_flyers",
      }),
    );
    expect(onDecided).toHaveBeenCalledWith("Marked done. Shop A has your note.");
  });

  it("asks a shop for more without a template, and links a setup request to its shop", async () => {
    const user = userEvent.setup();
    render(
      <RequestsTab
        tree="admin"
        requests={[
          setupRequest({
            kind: "setup",
            requestedName: null,
            message: "Our price list.",
          }),
        ]}
        shops={[{ supplierId: "usr_shop_a", name: "Shop A" }]}
        templates={[template]}
        onDecided={vi.fn()}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: /Set up products/ })[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Prepare products for this shop" }),
    ).toHaveAttribute("href", "/admin/product-setup/shops/usr_shop_a?request=psr_1");
    await user.click(within(dialog).getByRole("button", { name: "Ask for more" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Ask the shop for more" }),
    );
    await waitFor(() =>
      expect(templatesApi.decideProductSetupRequest).toHaveBeenCalledWith("psr_1", 5, {
        status: "needs_revision",
        reason: expect.stringContaining("price list"),
      }),
    );
  });
});

describe("Template editor", () => {
  it("saves the full definition with the version it read, after a confirmation", async () => {
    const user = userEvent.setup();
    render(<TemplateEditor tree="ops" templateId="tpl_flyers" />);
    const name = await screen.findByRole("textbox", { name: "Name clients see" });
    await user.clear(name);
    await user.type(name, "Flyers and leaflets");
    await user.click(screen.getByRole("button", { name: "Save template" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Save Flyers and leaflets?");
    await user.click(within(confirm).getByRole("button", { name: "Save template" }));
    await waitFor(() =>
      expect(templatesApi.saveProductTemplate).toHaveBeenCalledTimes(1),
    );
    const [id, body, version] = templatesApi.saveProductTemplate.mock.calls[0]!;
    expect(id).toBe("tpl_flyers");
    expect(version).toBe(3);
    expect(body).toMatchObject({
      name: "Flyers and leaflets",
      options: [
        { key: "standard", label: "A4", specBinding: null },
        { key: "variant_1", label: "A5", specBinding: null },
      ],
      fileTypes: ["pdf"],
      stockPhotos: [{ url: "/product-template-photos/flyers.jpg", altText: "Flyers" }],
      priceRange: { minMinor: 500, maxMinor: 5000 },
    });
  });

  it("will not save with a repeated option and says which", async () => {
    const user = userEvent.setup();
    render(<TemplateEditor tree="ops" templateId="tpl_flyers" />);
    const second = await screen.findByRole("textbox", { name: "Option 2 name" });
    await user.clear(second);
    await user.type(second, "A4");
    await user.click(screen.getByRole("button", { name: "Save template" }));
    expect(await screen.findByText(/“A4” repeats/)).toBeVisible();
    expect(templatesApi.saveProductTemplate).not.toHaveBeenCalled();
  });

  it("closes waiting product-type requests in its category with their versions", async () => {
    const user = userEvent.setup();
    render(<TemplateEditor tree="ops" templateId="tpl_flyers" />);
    const section = await screen.findByRole("region", {
      name: /Waiting product-type requests/,
    });
    expect(within(section).queryByText("Shirts")).not.toBeInTheDocument();
    await user.click(within(section).getByRole("checkbox"));
    await user.click(
      within(section).getByRole("button", { name: /Close 1 with Flyers/ }),
    );
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("A3 flyers");
    await user.click(
      within(confirm).getByRole("button", { name: "Close and tell the shops" }),
    );
    await waitFor(() =>
      expect(templatesApi.resolveRequestsWithTemplate).toHaveBeenCalledWith(
        "tpl_flyers",
        [{ id: "ptr_a3", expectedVersion: 4 }],
      ),
    );
  });
});

describe("Prepare a product", () => {
  it("prepares the ticked prices under the shop's service line, hidden until the shop confirms", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <PrepareSheet
        open
        onOpenChange={vi.fn()}
        target={{ kind: "new" }}
        supplierId="usr_shop_a"
        shopName="Shop A"
        templates={[template]}
        addedTemplateIds={new Set()}
        services={[{ id: "svc_paper", categoryCode: "paper", state: "verified" }]}
        resolveCategory={(code) => code}
        readyTimes={[{ code: "next_day", label: "Next day" }]}
        onDone={onDone}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Template" }));
    await user.click(await screen.findByRole("option", { name: "Flyers" }));
    await user.type(screen.getByRole("textbox", { name: "Full price for A4" }), "12");
    await user.click(screen.getByRole("button", { name: "Next day" }));
    await user.click(screen.getByRole("button", { name: "Prepare for the shop" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Prepare Flyers for Shop A?");
    expect(confirm).toHaveTextContent("stays hidden until Shop A confirms");
    await user.click(within(confirm).getByRole("button", { name: "Prepare" }));
    await waitFor(() =>
      expect(templatesApi.prepareShopTemplateProduct).toHaveBeenCalledWith("usr_shop_a", {
        templateId: "tpl_flyers",
        supplierServiceId: "svc_paper",
        readyTime: "next_day",
        prices: [{ optionKey: "standard", priceMinor: 1200 }],
      }),
    );
    expect(onDone).toHaveBeenCalledWith(
      expect.stringContaining("stays hidden until Shop A confirms"),
    );
  });
});

describe("Match existing products", () => {
  const products = [
    { id: "sci_a", name: "Flyer A4" },
    { id: "sci_b", name: "Flyer rush" },
    { id: "sci_c", name: "Mystery print" },
  ];

  it("previews first, lists open-order skips apart, and applies only the changes with their versions", async () => {
    const user = userEvent.setup();
    const plan = {
      dryRun: true,
      actions: [
        {
          action: "attach_template",
          itemId: "sci_a",
          expectedVersion: 2,
          templateId: "tpl_flyers",
        },
      ],
      manual: [
        { itemId: "sci_b", reason: "open_orders" },
        { itemId: "sci_c", reason: "ambiguous_template", templateIds: ["tpl_flyers"] },
      ],
    };
    templatesApi.previewShopMigration.mockResolvedValue(plan);
    templatesApi.applyShopMigration.mockResolvedValue({ ...plan, dryRun: false });
    const onApplied = vi.fn();
    render(
      <MigrationSection
        supplierId="usr_shop_a"
        shopName="Shop A"
        products={products}
        templates={[template]}
        onApplied={onApplied}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Apply/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview changes" }));
    expect(templatesApi.previewShopMigration).toHaveBeenCalledWith("usr_shop_a", {});
    expect(
      await screen.findByRole("heading", { name: "Skipped: open orders (1)" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Needs a person (1)" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Apply 1 change" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Apply 1 change to Shop A?");
    expect(within(confirm).getByRole("list")).toHaveTextContent("Flyer A4");
    expect(within(confirm).getByRole("list")).not.toHaveTextContent("Flyer rush");
    expect(confirm).toHaveTextContent("Not changed, open orders: Flyer rush.");
    await user.click(within(confirm).getByRole("button", { name: "Apply changes" }));
    await waitFor(() =>
      expect(templatesApi.applyShopMigration).toHaveBeenCalledWith(
        "usr_shop_a",
        {},
        { sci_a: 2 },
      ),
    );
    const versions = templatesApi.applyShopMigration.mock.calls[0]![2] as Record<
      string,
      number
    >;
    expect(Object.keys(versions)).not.toContain("sci_b");
    expect(onApplied).toHaveBeenCalledWith(
      expect.stringContaining("Applied 1 change to Shop A"),
    );
  });

  it("asks for a fresh preview after a template is chosen for an ambiguous product", async () => {
    const user = userEvent.setup();
    templatesApi.previewShopMigration.mockResolvedValue({
      actions: [],
      manual: [
        { itemId: "sci_c", reason: "ambiguous_template", templateIds: ["tpl_flyers"] },
      ],
    });
    render(
      <MigrationSection
        supplierId="usr_shop_a"
        shopName="Shop A"
        products={products}
        templates={[template]}
        onApplied={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Preview changes" }));
    await user.click(
      await screen.findByRole("combobox", { name: "Template for Mystery print" }),
    );
    await user.click(await screen.findByRole("option", { name: "Flyers" }));
    expect(
      await screen.findByText("Your choices changed. Preview again to apply."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Apply/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview again" }));
    expect(templatesApi.previewShopMigration).toHaveBeenLastCalledWith("usr_shop_a", {
      templateMatches: { sci_c: "tpl_flyers" },
    });
  });
});
