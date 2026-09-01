import {
  listingsFromPublicShop,
  type PublicShopListings,
} from "@/app/admin/_lib/shop-floor";
import { ApiError, getCatalogShop, listAllCatalogShops } from "@/lib/api/client";

export async function loadPublicShopListings(
  categoryCode: string,
  subcategoryCode?: string,
): Promise<PublicShopListings[]> {
  const summaries = await listAllCatalogShops(categoryCode);
  return Promise.all(
    summaries.map(async (summary) => {
      try {
        const shop = await getCatalogShop(summary.supplierId);
        return {
          supplierId: summary.supplierId,
          shopName: summary.shopName,
          listings: listingsFromPublicShop(shop, subcategoryCode),
        };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return {
            supplierId: summary.supplierId,
            shopName: summary.shopName,
            listings: [],
          };
        }
        throw err;
      }
    }),
  );
}
