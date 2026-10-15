/**
 * Pricing feedback for Super Admin (gridgo-client#243, contract
 * `gridgo-api/docs/PRICING_FEEDBACK_API.md`): the three pricing questions in
 * the post-order survey, the one-tap checkout exit question, and the filters
 * both share with the survey responses list. Pure, so it is tested without a
 * browser.
 *
 * Answer words are the client app's own (`gridgo-client/lib/survey.ts` and
 * `lib/checkoutExit.ts`), so an answer reads here exactly as the client chose
 * it. The API sends codes; a code this build has never seen reads as words.
 */

import { isApiError } from "@/lib/api/client";
import type {
  CheckoutExitAnswer,
  CheckoutExitStatus,
  ClientAccountType,
  OrderSizeBracket,
  PricingQuestionKey,
  PricingQuestionTally,
} from "@/lib/api/types";

// ---------------------------------------------------------------------------
// The questions, as the client read them
// ---------------------------------------------------------------------------

export const DIRECT_SHOP_QUESTION =
  "Compared with ordering directly from a print shop, GRIDGO was…";
export const PRICE_WORTH_QUESTION = "What made the price worth it?";
export const ORDER_AGAIN_QUESTION = "Would you order again at this price?";
export const CHECKOUT_EXIT_QUESTION = "What stopped you from ordering?";

/** The one worth-it answer that says the opposite of every other; the client sends it alone. */
export const NOT_WORTH_IT = "not_worth_it";

const DIRECT_SHOP_LABEL: Record<string, string> = {
  much_cheaper: "Much cheaper",
  cheaper: "Cheaper",
  about_the_same: "About the same",
  more_expensive: "More expensive",
  much_more_expensive: "Much more expensive",
  not_sure: "Not sure",
};

const PRICE_WORTH_LABEL: Record<string, string> = {
  print_quality: "Print quality",
  on_time: "Ready on time",
  door_delivery: "Delivered to my door",
  no_shop_visits: "No trips to print shops",
  quality_check: "Artwork checked before printing",
  easy_ordering: "Easy ordering",
  clear_upfront_price: "Clear price up front",
  helpful_support: "Helpful support",
  other: "Something else",
  not_worth_it: "It was not worth it",
};

const ORDER_AGAIN_LABEL: Record<string, string> = {
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
};

/** The price scale by the codes this report uses (the survey row stores 1 to 5). */
const PRICE_FEELING_CODE: Record<string, string> = {
  very_cheap: "Very cheap",
  cheap: "Cheap",
  fair: "Fair",
  expensive: "Expensive",
  very_expensive: "Very expensive",
};

/**
 * The expected price against what the order came to. The client typed a peso
 * figure; GRIDGO places it in one of four bands of the order total.
 */
const EXPECTED_PRICE_LABEL: Record<string, string> = {
  much_lower: "Much less, under 80% of the total",
  lower: "A little less, 80% to 95%",
  about_the_same: "About what it cost, 95% to 105%",
  higher: "More than it cost, over 105%",
};

const EXIT_REASON_LABEL: Record<string, string> = {
  price_too_high: "The price was too high",
  delivery_cost_or_time: "Delivery cost or time",
  still_deciding: "Still deciding",
  payment_problem: "Trouble paying",
  found_another_option: "Found another option",
  just_browsing: "Just looking around",
  other: "Other",
};

/** GRIDGO's exit answers, in the order the client sees them. */
export const EXIT_REASONS = Object.keys(EXIT_REASON_LABEL);

/** A code this build has never seen reads as words, never as a code. */
export function codeWords(code: string): string {
  const words = code.replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : code;
}

function wordsFor(labels: Record<string, string>, code: string): string {
  return labels[code] ?? codeWords(code);
}

export const directShopLabel = (code: string) => wordsFor(DIRECT_SHOP_LABEL, code);
export const priceWorthLabel = (code: string) => wordsFor(PRICE_WORTH_LABEL, code);
export const orderAgainLabel = (code: string) => wordsFor(ORDER_AGAIN_LABEL, code);
export const exitReasonLabel = (code: string) => wordsFor(EXIT_REASON_LABEL, code);

export type PricingQuestion = {
  key: PricingQuestionKey;
  /** The question as the client read it. */
  title: string;
  /** One line under the title: what the figures mean. */
  note?: string;
  label: (code: string) => string;
  /** Codes drawn below a rule, apart from the scale (not sure, not worth it). */
  apart?: readonly string[];
  /** Choose any: each share is of the clients who answered, so they add past 100%. */
  chooseAny?: boolean;
};

/** The survey's pricing questions, in the order the client answers them. */
export const PRICING_QUESTIONS: readonly PricingQuestion[] = [
  {
    key: "priceFeeling",
    title: "How did the price feel?",
    label: (code) => wordsFor(PRICE_FEELING_CODE, code),
  },
  {
    key: "expectedPrice",
    title: "What price would have felt right?",
    note: "The price the client typed, against what the order cost. Only answers that gave a price count.",
    label: (code) => wordsFor(EXPECTED_PRICE_LABEL, code),
  },
  {
    key: "directShopComparison",
    title: DIRECT_SHOP_QUESTION,
    label: directShopLabel,
    apart: ["not_sure"],
  },
  {
    key: "orderAgainAtPrice",
    title: ORDER_AGAIN_QUESTION,
    label: orderAgainLabel,
  },
  {
    key: "priceWorthTags",
    title: PRICE_WORTH_QUESTION,
    note: "Clients choose any, so the shares add up to more than 100%.",
    label: priceWorthLabel,
    apart: [NOT_WORTH_IT],
    chooseAny: true,
  },
];

// ---------------------------------------------------------------------------
// Reading a tally
// ---------------------------------------------------------------------------

/** "38.5%", "100%", or a dash when nobody answered (null is never zero). */
export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

/** The codes with the most answers; empty when nobody answered. Ties all lead. */
export function leadingCodes(tally: PricingQuestionTally | null | undefined): string[] {
  if (!tally?.answered) return [];
  const top = Math.max(...tally.options.map((option) => option.count));
  return top > 0
    ? tally.options.filter((option) => option.count === top).map((option) => option.code)
    : [];
}

/** "12 of 13 answered", or why the figure is empty. */
export function answeredLine(answered: number, of: number): string {
  if (!of) return "No responses match";
  if (!answered) return "Nobody answered this yet";
  if (answered === of) return `All ${of.toLocaleString("en-PH")} answered`;
  return `${answered.toLocaleString("en-PH")} of ${of.toLocaleString("en-PH")} answered`;
}

// ---------------------------------------------------------------------------
// Checkout exit answers
// ---------------------------------------------------------------------------

export const EXIT_STATUS_LABEL: Record<CheckoutExitStatus, string> = {
  answered: "Answered",
  skipped: "Skipped",
  unanswered: "Closed without answering",
};

/** What the client did with the question, in one phrase. */
export function exitAnswerLabel(
  row: Pick<CheckoutExitAnswer, "status" | "reason">,
): string {
  if (row.status === "answered" && row.reason) return exitReasonLabel(row.reason);
  return EXIT_STATUS_LABEL[row.status] ?? "Closed without answering";
}

// ---------------------------------------------------------------------------
// The shared filters: order size and account type
// ---------------------------------------------------------------------------

export const ORDER_SIZES: readonly { code: OrderSizeBracket; label: string }[] = [
  { code: "under_500", label: "Under ₱500" },
  { code: "500_to_1999", label: "₱500 to ₱1,999" },
  { code: "2000_to_4999", label: "₱2,000 to ₱4,999" },
  { code: "5000_to_19999", label: "₱5,000 to ₱19,999" },
  { code: "20000_and_up", label: "₱20,000 and up" },
];

export function orderSizeLabel(code: string | null | undefined): string {
  if (!code) return "No price";
  return ORDER_SIZES.find((size) => size.code === code)?.label ?? codeWords(code);
}

export function isOrderSize(value: string | null | undefined): value is OrderSizeBracket {
  return ORDER_SIZES.some((size) => size.code === value);
}

export const ACCOUNT_TYPES: readonly { code: ClientAccountType; label: string }[] = [
  { code: "individual", label: "Individual" },
  { code: "business", label: "Business" },
  { code: "organization", label: "Organization" },
];

export function accountTypeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return ACCOUNT_TYPES.find((type) => type.code === code)?.label ?? codeWords(code);
}

export function isAccountType(
  value: string | null | undefined,
): value is ClientAccountType {
  return ACCOUNT_TYPES.some((type) => type.code === value);
}

/** A category's name from the taxonomy, or its code as words when this build has no name. */
export function categoryLabel(code: string, names: ReadonlyMap<string, string>): string {
  return names.get(code) ?? codeWords(code);
}

// ---------------------------------------------------------------------------
// The desk's view and the exit list's own filters, held in the URL
// ---------------------------------------------------------------------------

export type SurveyDeskView = "responses" | "pricing" | "exits";

export function deskView(value: string | null): SurveyDeskView {
  return value === "pricing" || value === "exits" ? value : "responses";
}

export type ExitFilterState = {
  status: "" | CheckoutExitStatus;
  reason: string;
};

export function exitFiltersFromParams(params: URLSearchParams): ExitFilterState {
  const status = params.get("exitStatus");
  const reason = params.get("exitReason") ?? "";
  return {
    status:
      status === "answered" || status === "skipped" || status === "unanswered"
        ? status
        : "",
    reason: EXIT_REASONS.includes(reason) ? reason : "",
  };
}

export function writeExitFilterParams(
  params: URLSearchParams,
  filters: ExitFilterState,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (filters.status) next.set("exitStatus", filters.status);
  else next.delete("exitStatus");
  if (filters.reason) next.set("exitReason", filters.reason);
  else next.delete("exitReason");
  return next;
}

export function pricingErrorMessage(err: unknown, fallback: string): string {
  if (!isApiError(err)) return fallback;
  if (err.kind === "forbidden") return "Only Super Admin can read pricing feedback.";
  if (err.code === "invalid_survey_filter") {
    return "One of the filters is not one GRIDGO accepts. Clear the filters and try again.";
  }
  if (err.code === "invalid_pagination")
    return "That page of answers does not exist. Reload the list.";
  if (err.status === 404) return "This GRIDGO server does not have pricing feedback yet.";
  if (err.kind === "server")
    return "GRIDGO could not read the pricing feedback just now. Try again.";
  return fallback;
}
