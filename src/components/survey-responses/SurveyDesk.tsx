"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CheckoutExitAnswers } from "@/components/survey-responses/CheckoutExitAnswers";
import { PricingResults } from "@/components/survey-responses/PricingResults";
import { SurveyResponsesDesk } from "@/components/survey-responses/SurveyResponsesDesk";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTaxonomy } from "@/lib/api/client";
import type { TaxonomyCategory } from "@/lib/api/types";
import {
  ACCOUNT_TYPES,
  ORDER_SIZES,
  type SurveyDeskView,
  accountTypeLabel,
  categoryLabel,
  deskView,
  isAccountType,
  isOrderSize,
  orderSizeLabel,
} from "@/lib/pricing-feedback";
import {
  SHARED_FILTER_KEYS,
  type SurveyFilterState,
  datesBackwards,
  filtersFromParams,
  sharedFilterCount,
  writeFilterParams,
} from "@/lib/survey-responses";

const ANY = "__any__";

/**
 * Super Admin's survey desk: every response as clients gave it, the pricing
 * results over them (PRICING_FEEDBACK_API.md), and the answers to the
 * checkout exit question. The dates, category, order size and account type
 * sit above the tabs because the API applies them to all three; each tab
 * keeps its own narrower filters and its own CSV. Everything lives in the URL.
 */
export function SurveyDesk() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = deskView(params.get("view"));
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const categories = useCategories();
  const categoryNames = useMemo(
    () => new Map((categories ?? []).map((category) => [category.code, category.name])),
    [categories],
  );

  const replaceParams = useCallback(
    (next: URLSearchParams) => {
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const setShared = useCallback(
    (patch: Partial<SurveyFilterState>) =>
      replaceParams(writeFilterParams(params, { ...filters, ...patch })),
    [replaceParams, params, filters],
  );

  function setView(next: SurveyDeskView) {
    const search = new URLSearchParams(params.toString());
    if (next === "responses") search.delete("view");
    else search.set("view", next);
    search.delete("response");
    replaceParams(search);
  }

  const sharedCount = sharedFilterCount(filters);
  const backwards = datesBackwards(filters);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        What clients said after an order reached them, how the price felt, and why some
        left at checkout. Answers never change an order, a payout or a shop&apos;s
        standing.
      </p>

      <section
        aria-labelledby="survey-shared-filters"
        className="border-outline flex flex-col gap-3 border-y py-3"
      >
        <h2 id="survey-shared-filters" className="sr-only">
          Filters for every tab
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-[calc(50%-0.375rem)] sm:w-40">
            <FieldLabel htmlFor="survey-from">From</FieldLabel>
            <Input
              id="survey-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => setShared({ from: event.target.value })}
            />
          </Field>
          <Field className="w-[calc(50%-0.375rem)] sm:w-40">
            <FieldLabel htmlFor="survey-to">To</FieldLabel>
            <Input
              id="survey-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => setShared({ to: event.target.value })}
            />
          </Field>
          <Field className="w-full sm:w-64">
            <FieldLabel htmlFor="survey-category">Category</FieldLabel>
            <Select
              value={filters.categoryCode || ANY}
              onValueChange={(value) =>
                setShared({ categoryCode: !value || value === ANY ? "" : String(value) })
              }
            >
              <SelectTrigger id="survey-category" className="min-h-11 w-full">
                <SelectValue>
                  {(value) =>
                    !value || value === ANY
                      ? "Every category"
                      : categoryLabel(String(value), categoryNames)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Every category</SelectItem>
                {(categories ?? []).map((category) => (
                  <SelectItem key={category.code} value={category.code}>
                    {category.name}
                  </SelectItem>
                ))}
                {filters.categoryCode &&
                categories &&
                !categoryNames.has(filters.categoryCode) ? (
                  <SelectItem value={filters.categoryCode}>
                    {categoryLabel(filters.categoryCode, categoryNames)}
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </Field>
          <Field className="w-[calc(50%-0.375rem)] sm:w-48">
            <FieldLabel htmlFor="survey-size">Order size</FieldLabel>
            <Select
              value={filters.orderSize || ANY}
              onValueChange={(value) =>
                setShared({
                  orderSize: isOrderSize(String(value))
                    ? (value as SurveyFilterState["orderSize"])
                    : "",
                })
              }
            >
              <SelectTrigger id="survey-size" className="min-h-11 w-full">
                <SelectValue>
                  {(value) =>
                    isOrderSize(String(value))
                      ? orderSizeLabel(String(value))
                      : "Any size"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any size</SelectItem>
                {ORDER_SIZES.map((size) => (
                  <SelectItem key={size.code} value={size.code}>
                    {size.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="w-[calc(50%-0.375rem)] sm:w-44">
            <FieldLabel htmlFor="survey-account">Account type</FieldLabel>
            <Select
              value={filters.accountType || ANY}
              onValueChange={(value) =>
                setShared({
                  accountType: isAccountType(String(value))
                    ? (value as SurveyFilterState["accountType"])
                    : "",
                })
              }
            >
              <SelectTrigger id="survey-account" className="min-h-11 w-full">
                <SelectValue>
                  {(value) =>
                    isAccountType(String(value))
                      ? accountTypeLabel(String(value))
                      : "Any account"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any account</SelectItem>
                {ACCOUNT_TYPES.map((type) => (
                  <SelectItem key={type.code} value={type.code}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {sharedCount ? (
            <Button
              variant="ghost"
              onClick={() =>
                setShared(
                  Object.fromEntries(
                    SHARED_FILTER_KEYS.map((key) => [key, ""]),
                  ) as Partial<SurveyFilterState>,
                )
              }
            >
              Clear {sharedCount === 1 ? "filter" : `${sharedCount} filters`}
            </Button>
          ) : null}
        </div>
        <p className="text-caption text-text-muted m-0 max-w-prose">
          These apply to every tab and its CSV. Dates are Philippine time and include both
          days; a response counts on the day it was sent, a checkout answer on the day it
          was asked. Order size is the order total, or the basket total at checkout.
          Account type is the client&apos;s type today.
        </p>
        {backwards ? (
          <p className="text-body text-error m-0" role="alert">
            The From date is after the To date.
          </p>
        ) : null}
      </section>

      <Tabs value={view} onValueChange={(value) => setView(deskView(String(value)))}>
        <TabsList>
          <TabsTrigger value="responses">Responses</TabsTrigger>
          <TabsTrigger value="pricing">Pricing results</TabsTrigger>
          <TabsTrigger value="exits">Checkout exits</TabsTrigger>
        </TabsList>
        <TabsContent value="responses" className="mt-4">
          {view === "responses" ? (
            <SurveyResponsesDesk categoryNames={categoryNames} />
          ) : null}
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          {view === "pricing" ? (
            <PricingResults filters={filters} onShowExits={() => setView("exits")} />
          ) : null}
        </TabsContent>
        <TabsContent value="exits" className="mt-4">
          {view === "exits" ? (
            <CheckoutExitAnswers categoryNames={categoryNames} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** The taxonomy's categories, for the filter and for naming codes. A courtesy: codes still read without it. */
function useCategories(): TaxonomyCategory[] | null {
  const [categories, setCategories] = useState<TaxonomyCategory[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getTaxonomy()
      .then((taxonomy) => {
        if (cancelled) return;
        setCategories(
          [...taxonomy.categories].sort(
            (a, b) =>
              (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return categories;
}
