"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { SamplePhoto } from "@/app/supplier/_components/SamplePhoto";
import { loadShopServiceLines } from "@/app/supplier/_lib/listings-api";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/loading";
import { StatusMark } from "@/components/ui/StatusChip";
import { getSupplierReadiness, listCatalogItems } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLiveReload } from "@/lib/live/useLiveReload";
import {
  boardContextFor,
  boardStanding,
  normalizeBoardPage,
  normalizeListingReadiness,
  normalizeServiceLines,
  priceLine,
  type BoardStanding,
  type Listing,
} from "@/lib/listings";

/** How many products My shop shows before "See all": two rows of four on a desktop. */
export const MY_SHOP_PRODUCT_LIMIT = 8;
/** On a phone, two rows of two, so the status and team stay within reach. */
export const MY_SHOP_PRODUCT_LIMIT_PHONE = 4;

type Tile = { listing: Listing; standing: BoardStanding };

type State =
  | { kind: "loading" }
  | { kind: "ready"; tiles: Tile[]; total: number }
  | { kind: "failed" };

/**
 * The first products on the shop's board, each with its photo, price and
 * standing, an Add, and See all to the whole board. Owners and Managers only:
 * a product carries its price, which Staff never see.
 */
export function ShopProducts({ limit = MY_SHOP_PRODUCT_LIMIT }: { limit?: number } = {}) {
  const { user } = useAuth();
  const shopApproved = user?.verificationStatus === "approved";
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const [page, servicesBody, ready] = await Promise.all([
        listCatalogItems({ limit: MY_SHOP_PRODUCT_LIMIT }),
        loadShopServiceLines().catch(() => ({ services: [] })),
        getSupplierReadiness().then(normalizeListingReadiness, () => null),
      ]);
      const board = normalizeBoardPage(page);
      const services = normalizeServiceLines(servicesBody);
      setState({
        kind: "ready",
        total: board.total,
        tiles: board.listings.map((listing) => ({
          listing,
          standing: boardStanding(
            listing,
            boardContextFor(listing, services),
            shopApproved,
            ready?.get(listing.id) ?? null,
          ),
        })),
      });
    } catch {
      setState({ kind: "failed" });
    }
  }, [shopApproved]);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload(["catalog", "services"], load);

  const live = state.kind === "ready" ? state.tiles.filter((t) => t.standing.kind === "live").length : 0;
  const shown = state.kind === "ready" ? state.tiles.slice(0, limit) : [];
  const total = state.kind === "ready" ? state.total : 0;
  const more = total > shown.length;

  return (
    <section aria-labelledby="my-shop-products" className="flex flex-col gap-3" data-testid="shop-products">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="my-shop-products" className="text-h3 text-text-primary m-0 flex-1 whitespace-nowrap">
          Products
          {state.kind === "ready" && state.tiles.length ? (
            <span className="text-text-muted">{` · ${live} live`}</span>
          ) : null}
        </h2>
        <Button variant="ghost" nativeButton={false} render={<Link href="/supplier/catalogue" />}>
          See all
        </Button>
        <Button variant="primary" nativeButton={false} render={<Link href="/supplier/catalogue/new" />}>
          <Plus aria-hidden />
          Add a product
        </Button>
      </div>

      {state.kind === "loading" ? <SkeletonLines lines={3} /> : null}
      {state.kind === "failed" ? (
        <p className="text-body text-text-secondary m-0" role="alert">
          Could not read your products.{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : null}
      {state.kind === "ready" && !state.tiles.length ? (
        <p className="text-body text-text-secondary m-0">
          No products yet. Add the first thing clients can order from you.
        </p>
      ) : null}

      {state.kind === "ready" && state.tiles.length ? (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 min-[1280px]:grid-cols-4">
          {shown.map(({ listing, standing }) => (
            <li key={listing.id}>
              <Link
                href={`/supplier/catalogue/${listing.id}`}
                data-testid="shop-product"
                className="flex h-full flex-col gap-2 rounded-card border border-outline bg-surface p-2 no-underline hover:bg-overlay-hover"
              >
                <SamplePhoto
                  fileId={listing.photos[0]?.fileId}
                  alt={listing.photos[0]?.altText ?? listing.name}
                  enlarge={false}
                  emptyLabel="No photo yet"
                />
                <span className="flex min-w-0 flex-col gap-0.5 px-1 pb-1">
                  <span
                    className="text-body text-text-primary truncate"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {listing.name || "Untitled product"}
                  </span>
                  <span className="text-caption text-text-secondary truncate">{priceLine(listing)}</span>
                  <span className="text-caption text-text-secondary">
                    <StatusMark tone={standing.tone} icon={standing.icon} label={standing.label} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {more ? (
        <p className="text-caption text-text-muted m-0">
          Showing {shown.length} of {total}.{" "}
          <Link href="/supplier/catalogue" className="underline">
            See all products
          </Link>
        </p>
      ) : null}
    </section>
  );
}
