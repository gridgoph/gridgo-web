"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { listProductTypeRequests } from "@/lib/api/client";
import {
  isTemplatesAbsent,
  listStaffProductSetupRequests,
  listStaffProductTemplates,
} from "@/lib/api/product-templates";
import { normalizeProductTypeRequests } from "@/lib/listing-review";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  normalizeCatalogue,
  normalizeSetupRequests,
  type ProductTemplate,
  type SetupRequest,
} from "@/lib/product-templates";

import { RequestsTab } from "./RequestsTab";
import { ShopsTab } from "./ShopsTab";
import { TemplatesTab } from "./TemplatesTab";
import { readShops, type ShopRef, type Tree } from "./team-data";

type Tab = "requests" | "templates" | "shops";

function tabOf(value: string | null): Tab {
  return value === "templates" || value === "shops" ? value : "requests";
}

type State =
  | { kind: "loading" }
  | { kind: "absent" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; requests: SetupRequest[]; templates: ProductTemplate[] };

/**
 * Product setup (gridgo-supplier#268): the GRIDGO team's side of product
 * templates. Requests from shops, GRIDGO's template list, and per-shop work
 * (prepared products and matching existing ones). Mounted at
 * `/ops/product-setup` and `/admin/product-setup`.
 */
export function ProductSetupDesk({ tree }: { tree: Tree }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = tabOf(searchParams.get("tab"));
  const [state, setState] = useState<State>({ kind: "loading" });
  const [shops, setShops] = useState<ShopRef[] | null>(null);
  const [typeWaiting, setTypeWaiting] = useState<Map<string, number>>(new Map());
  const [notice, setNotice] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      try {
        const [requests, catalogue] = await Promise.all([
          listStaffProductSetupRequests(),
          listStaffProductTemplates(),
        ]);
        setState({
          kind: "ready",
          requests: normalizeSetupRequests(requests),
          templates: normalizeCatalogue(catalogue).templates,
        });
      } catch (err) {
        if (isTemplatesAbsent(err)) setState({ kind: "absent" });
        else
          setState({
            kind: "failed",
            message: opsErrorMessage(err, "Could not load product setup. Check your connection and try again."),
          });
      }
    }, []),
  );

  useLiveReload("catalog", load);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void readShops().then(setShops);
    void listProductTypeRequests("pending")
      .then((body) => {
        const counts = new Map<string, number>();
        for (const r of normalizeProductTypeRequests(body).requests)
          counts.set(r.categoryCode, (counts.get(r.categoryCode) ?? 0) + 1);
        setTypeWaiting(counts);
      })
      .catch(() => undefined);
  }, []);

  function switchTab(next: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "requests") params.delete("tab");
    else params.set("tab", next);
    const search = params.toString();
    router.replace(`${pathname}${search ? `?${search}` : ""}`, { scroll: false });
  }

  const ready = state.kind === "ready" ? state : null;
  const waiting = useMemo(
    () => ready?.requests.filter((r) => r.status === "pending").length ?? 0,
    [ready],
  );

  if (state.kind === "absent") {
    return (
      <EmptyState
        title="Product templates are not on this server yet"
        body="This GRIDGO API has no product templates. Shops keep the full product builder until it is released."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-2xl">
        Shops add GRIDGO&rsquo;s templates with their own full prices. Answer what they ask for, keep the template list
        right, and set up products for a shop that sent its price list.
      </p>
      {notice ? (
        <p role="status" className="text-body text-text-primary m-0">
          {notice}
        </p>
      ) : null}
      {state.kind === "failed" ? (
        <ErrorState
          title="Product setup could not load"
          body={state.message}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      ) : null}
      <Tabs value={tab} onValueChange={(value) => switchTab(tabOf(String(value)))}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="requests">Requests{ready ? ` (${waiting} waiting)` : ""}</TabsTrigger>
          <TabsTrigger value="templates">Templates{ready ? ` (${ready.templates.length})` : ""}</TabsTrigger>
          <TabsTrigger value="shops">Shops</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-4">
          <RequestsTab
            tree={tree}
            requests={ready?.requests ?? null}
            shops={shops}
            templates={ready?.templates ?? null}
            onDecided={async (message) => {
              setNotice(message);
              await load();
            }}
          />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab tree={tree} templates={ready?.templates ?? null} waitingByCategory={typeWaiting} />
        </TabsContent>
        <TabsContent value="shops" className="mt-4">
          <ShopsTab tree={tree} shops={shops} requests={ready?.requests ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
