/**
 * Post-order survey responses for Super Admin (report 81CA4493, contract
 * `gridgo-api/docs/SURVEY_API.md`). Words, filters and the figures the desk
 * draws from the API's aggregates. Pure, so it is tested without a browser.
 *
 * Tag and price words are the client app's own (`gridgo-client/lib/survey.ts`),
 * so a response reads here exactly as the client chose it.
 */

import { isApiError } from "@/lib/api/client";
import type {
  SurveyFulfillmentKind,
  SurveyResponse,
  SurveyResponsesFilter,
  SurveyRewardStatus,
  SurveyScoreKey,
} from "@/lib/api/types";
import { manilaDayEnd, manilaDayStart } from "@/lib/vouchers";

export const DELIVERY_TAGS = [
  "on_time",
  "late",
  "friendly_rider",
  "clear_updates",
  "hard_to_contact",
  "careful_handling",
  "damaged_package",
  "other",
] as const;

export const PICKUP_TAGS = [
  "easy_to_find",
  "ready_on_time",
  "long_wait",
  "helpful_staff",
  "clear_instructions",
  "inconvenient_hours",
  "damaged_package",
  "other",
] as const;

export const EASE_TAGS = [
  "easy_to_find_product",
  "clear_options",
  "easy_checkout",
  "upload_difficulty",
  "confusing_steps",
  "payment_difficulty",
  "slow_app",
  "other",
] as const;

const TAG_LABEL: Record<string, string> = {
  on_time: "Arrived on time",
  late: "Arrived late",
  friendly_rider: "Friendly rider",
  clear_updates: "Clear updates",
  hard_to_contact: "Hard to reach the rider",
  careful_handling: "Handled with care",
  damaged_package: "Package damaged",
  easy_to_find: "Easy to find",
  ready_on_time: "Ready on time",
  long_wait: "Long wait",
  helpful_staff: "Helpful staff",
  clear_instructions: "Clear instructions",
  inconvenient_hours: "Hours did not suit me",
  easy_to_find_product: "Found what I needed",
  clear_options: "Clear options",
  easy_checkout: "Easy checkout",
  upload_difficulty: "Uploading was hard",
  confusing_steps: "Confusing steps",
  payment_difficulty: "Paying was hard",
  slow_app: "App felt slow",
  other: "Something else",
};

/**
 * Tags a client picks when something went wrong. They read as a complaint
 * on screen; every other tag is praise or neutral.
 */
const NEGATIVE_TAGS = new Set([
  "late",
  "hard_to_contact",
  "damaged_package",
  "long_wait",
  "inconvenient_hours",
  "upload_difficulty",
  "confusing_steps",
  "payment_difficulty",
  "slow_app",
]);

/** A tag's words; a code this build has never seen reads as words, never as a code. */
export function tagLabel(code: string): string {
  const known = TAG_LABEL[code];
  if (known) return known;
  const words = code.replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : code;
}

export function tagIsNegative(code: string): boolean {
  return NEGATIVE_TAGS.has(code);
}

/**
 * The tag filter's menu, each code once. The API matches a tag in either
 * answer, so the two codes both questions share sit in their own group.
 */
const SHARED_TAGS: readonly string[] = ["damaged_package", "other"];
export const TAG_GROUPS: readonly { label: string; tags: readonly string[] }[] = [
  { label: "Delivery", tags: DELIVERY_TAGS.filter((tag) => !SHARED_TAGS.includes(tag)) },
  { label: "Pick-up", tags: PICKUP_TAGS.filter((tag) => !SHARED_TAGS.includes(tag)) },
  { label: "Ordering", tags: EASE_TAGS.filter((tag) => !SHARED_TAGS.includes(tag)) },
  { label: "Any question", tags: SHARED_TAGS },
];

/** The price scale, cheapest first: what GRIDGO stores as 1 to 5. */
export const PRICE_FEELINGS = ["Very cheap", "Cheap", "Fair", "Expensive", "Very expensive"] as const;

export function priceFeelingLabel(value: number | null | undefined): string {
  if (value == null) return "Not answered";
  return PRICE_FEELINGS[value - 1] ?? "Not answered";
}

/** The word for an average on the price scale (2.6 reads "Fair"). */
export function priceFeelingNear(average: number | null): string | null {
  if (average == null) return null;
  const index = Math.min(5, Math.max(1, Math.round(average)));
  return PRICE_FEELINGS[index - 1];
}

export function fulfillmentLabel(kind: SurveyFulfillmentKind): string {
  return kind === "pickup" ? "Pick-up" : "Delivery";
}

/** The question each score answers, as the client read it. */
export function questionLabel(key: SurveyScoreKey, kind?: SurveyFulfillmentKind): string {
  switch (key) {
    case "fulfillmentStars":
      return kind === "pickup" ? "How was picking it up?" : kind === "delivery" ? "How was the delivery?" : "Handover";
    case "easeStars":
      return "How easy was ordering?";
    case "priceFeeling":
      return "How did the price feel?";
    case "qualityStars":
      return "How was the print quality?";
    case "recommendScore":
      return "How likely to recommend GRIDGO?";
  }
}

export type NpsGroup = "promoter" | "passive" | "detractor";

export function npsGroup(score: number | null | undefined): NpsGroup | null {
  if (score == null) return null;
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export const NPS_GROUP_LABEL: Record<NpsGroup, string> = {
  promoter: "Promoter",
  passive: "Passive",
  detractor: "Detractor",
};

/** One decimal, or a dash for an empty average (null is never zero). */
export function formatAverage(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

/** NPS as a signed whole number: "+32", "−8", "0"; a dash when nobody answered. */
export function formatNps(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `−${Math.abs(rounded)}`;
  return "0";
}

/** Share of a whole as a whole percent; 0 when the whole is empty. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function isLowStars(value: number | null | undefined): boolean {
  return value != null && value <= 2;
}

/**
 * Why the API flagged a response, in the order the client answered. The flag
 * itself is the API's: a star score of 2 or less, or a recommend score of 0–6.
 * Price feeling never flags ("cheap" is not a complaint).
 */
export function followUpReasons(row: SurveyResponse): string[] {
  const reasons: string[] = [];
  if (isLowStars(row.fulfillmentStars)) {
    reasons.push(`${fulfillmentLabel(row.fulfillmentKind)} rated ${row.fulfillmentStars} of 5`);
  }
  if (isLowStars(row.easeStars)) reasons.push(`Ordering rated ${row.easeStars} of 5`);
  if (isLowStars(row.qualityStars)) reasons.push(`Print quality rated ${row.qualityStars} of 5`);
  if (npsGroup(row.recommendScore) === "detractor") {
    reasons.push(`Recommend score ${row.recommendScore} of 10`);
  }
  return reasons;
}

export function rewardLabel(status: SurveyRewardStatus | null): string {
  if (status === "issued") return "Voucher issued";
  if (status === "cooldown") return "No voucher, had one this week";
  return "—";
}

// ---------------------------------------------------------------------------
// Filters, held in the URL so a notice or a shared link opens the same view
// ---------------------------------------------------------------------------

export type SurveyFilterState = {
  followUp: "" | "true" | "false";
  kind: "" | SurveyFulfillmentKind;
  reward: "" | SurveyRewardStatus;
  tag: string;
  /** Manila calendar days, YYYY-MM-DD. */
  from: string;
  to: string;
  clientId: string;
  orderId: string;
  fulfillmentStars: string;
  easeStars: string;
  priceFeeling: string;
  qualityStars: string;
  recommendScore: string;
};

export const EMPTY_SURVEY_FILTERS: SurveyFilterState = {
  followUp: "",
  kind: "",
  reward: "",
  tag: "",
  from: "",
  to: "",
  clientId: "",
  orderId: "",
  fulfillmentStars: "",
  easeStars: "",
  priceFeeling: "",
  qualityStars: "",
  recommendScore: "",
};

/** URL key for each filter. Score keys keep the API's names. */
const PARAM: Record<keyof SurveyFilterState, string> = {
  followUp: "followUp",
  kind: "kind",
  reward: "reward",
  tag: "tag",
  from: "from",
  to: "to",
  clientId: "client",
  orderId: "order",
  fulfillmentStars: "fulfillmentStars",
  easeStars: "easeStars",
  priceFeeling: "priceFeeling",
  qualityStars: "qualityStars",
  recommendScore: "recommendScore",
};

export const SCORE_FILTERS: readonly {
  key: SurveyScoreKey;
  label: string;
  options: readonly { value: string; label: string }[];
}[] = [
  { key: "fulfillmentStars", label: "Handover", options: stars() },
  { key: "easeStars", label: "Ordering", options: stars() },
  { key: "qualityStars", label: "Quality", options: stars() },
  {
    key: "priceFeeling",
    label: "Price",
    options: PRICE_FEELINGS.map((label, index) => ({ value: String(index + 1), label })),
  },
  {
    key: "recommendScore",
    label: "Recommend",
    options: Array.from({ length: 11 }, (_, index) => ({
      value: String(10 - index),
      label: `${10 - index} of 10`,
    })),
  },
];

function stars() {
  return [5, 4, 3, 2, 1].map((value) => ({
    value: String(value),
    label: `${value} ${value === 1 ? "star" : "stars"}`,
  }));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function scoreParam(value: string | null, min: number, max: number): string {
  if (!value || !/^\d+$/.test(value)) return "";
  const number = Number(value);
  return number >= min && number <= max ? String(number) : "";
}

/** What the URL asks for; anything malformed is dropped rather than sent. */
export function filtersFromParams(params: URLSearchParams): SurveyFilterState {
  const get = (key: keyof SurveyFilterState) => params.get(PARAM[key]);
  const followUp = get("followUp");
  const kind = get("kind");
  const reward = get("reward");
  const from = get("from") ?? "";
  const to = get("to") ?? "";
  return {
    followUp: followUp === "true" || followUp === "false" ? followUp : "",
    kind: kind === "delivery" || kind === "pickup" ? kind : "",
    reward: reward === "issued" || reward === "cooldown" ? reward : "",
    tag: (get("tag") ?? "").trim(),
    from: DAY.test(from) ? from : "",
    to: DAY.test(to) ? to : "",
    clientId: (get("clientId") ?? "").trim(),
    orderId: (get("orderId") ?? "").trim(),
    fulfillmentStars: scoreParam(get("fulfillmentStars"), 1, 5),
    easeStars: scoreParam(get("easeStars"), 1, 5),
    qualityStars: scoreParam(get("qualityStars"), 1, 5),
    priceFeeling: scoreParam(get("priceFeeling"), 1, 5),
    recommendScore: scoreParam(get("recommendScore"), 0, 10),
  };
}

/** The same filters written back onto `params`, other keys left alone. */
export function writeFilterParams(
  params: URLSearchParams,
  filters: SurveyFilterState,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  for (const key of Object.keys(PARAM) as (keyof SurveyFilterState)[]) {
    const value = filters[key];
    if (value) next.set(PARAM[key], value);
    else next.delete(PARAM[key]);
  }
  return next;
}

export function datesBackwards(filters: SurveyFilterState): boolean {
  return Boolean(filters.from && filters.to && filters.from > filters.to);
}

/** The API query for these filters. Dates are whole Manila days, both included. */
export function surveyQuery(filters: SurveyFilterState): SurveyResponsesFilter {
  const score = (value: string) => (value === "" ? undefined : Number(value));
  return {
    needsFollowUp: filters.followUp === "" ? undefined : filters.followUp === "true",
    fulfillmentKind: filters.kind || undefined,
    rewardStatus: filters.reward || undefined,
    tag: filters.tag || undefined,
    from: manilaDayStart(filters.from),
    to: manilaDayEnd(filters.to),
    clientId: filters.clientId || undefined,
    orderId: filters.orderId || undefined,
    fulfillmentStars: score(filters.fulfillmentStars),
    easeStars: score(filters.easeStars),
    qualityStars: score(filters.qualityStars),
    priceFeeling: score(filters.priceFeeling),
    recommendScore: score(filters.recommendScore),
  };
}

export function scoreFilterCount(filters: SurveyFilterState): number {
  return SCORE_FILTERS.filter(({ key }) => filters[key] !== "").length;
}

/** Any narrowing besides the follow-up switch, which has its own control. */
export function hasNarrowing(filters: SurveyFilterState): boolean {
  return (Object.keys(PARAM) as (keyof SurveyFilterState)[]).some(
    (key) => key !== "followUp" && filters[key] !== "",
  );
}

export function surveyErrorMessage(err: unknown, fallback: string): string {
  if (!isApiError(err)) return fallback;
  if (err.kind === "forbidden") return "Only Super Admin can read survey responses.";
  if (err.code === "invalid_survey_filter") {
    return "One of the filters is not one GRIDGO accepts. Clear the filters and try again.";
  }
  if (err.code === "invalid_pagination") return "That page of responses does not exist. Reload the list.";
  if (err.status === 404) return "This GRIDGO server does not have survey responses yet.";
  if (err.kind === "server") return "GRIDGO could not read the responses just now. Try again.";
  return fallback;
}
