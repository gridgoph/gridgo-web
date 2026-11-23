import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listStaffCatalogItems: vi.fn() }));

vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...mocks };
});

import { readShopProducts } from "@/components/product-templates/team/ShopTemplateProducts";

const row = (id: string) => ({
  item: { id, name: id, supplierId: "shop_a", subcategoryCode: "flyers", photos: [] },
  shop: { supplierId: "shop_a", shopName: "Shop A" },
});

afterEach(() => vi.clearAllMocks());

describe("one shop's products for the GRIDGO team", () => {
  it("asks 50 at a time (the API's ceiling) and follows the cursor", async () => {
    mocks.listStaffCatalogItems
      .mockResolvedValueOnce({ items: [row("a"), row("b")], nextCursor: "c1" })
      .mockResolvedValueOnce({ items: [row("c")], nextCursor: null });
    const page = await readShopProducts("shop_a");
    expect(mocks.listStaffCatalogItems).toHaveBeenNthCalledWith(1, {
      supplierId: "shop_a",
      limit: 50,
    });
    expect(mocks.listStaffCatalogItems).toHaveBeenNthCalledWith(2, {
      supplierId: "shop_a",
      limit: 50,
      cursor: "c1",
    });
    expect(page.rows.map((r) => r.listing.id)).toEqual(["a", "b", "c"]);
    expect(page.nextCursor).toBeNull();
  });
});
