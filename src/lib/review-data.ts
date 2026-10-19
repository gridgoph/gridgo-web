/**
 * Review data (test accounts) on the staff side. Contract: "Operations and
 * reporting" in `gridgo-api/docs/REVIEW_DATA_API.md`.
 *
 * Test client, shop and rider accounts place simulated orders that ordinary
 * staff lists leave out unless the reader sends `includeReviewData=1`. Two
 * readers send it:
 *
 * - a test operations login (`testOperations: true` on `/auth/me/ops`), on
 *   every list read below, because the API shows it test data only;
 * - ordinary Operations and Super Admin, only while "Show test orders" is on
 *   for this browser (Orders queue and Finished work).
 *
 * The flag never grants access to a route; it only widens a list the reader
 * could already open.
 */

export const REVIEW_DATA_PARAM = "includeReviewData";

/** Collection reads that honour the flag (exact paths, query allowed). */
const REVIEW_DATA_COLLECTIONS = new Set([
  "/orders",
  "/jobs",
  "/baskets",
  "/claims",
  "/issues",
  "/escalations",
  "/refund-requests",
  "/ops/riders/locations",
  "/ops/colour-price-checks",
  "/ops/shop-failures",
  "/ops/shops/performance",
  "/admin/shop-rankings",
  "/audit",
]);

/** Reads under these paths honour it too (`/ops/hub/*`, one shop's performance, an order's audit). */
const REVIEW_DATA_PATTERNS = [
  /^\/ops\/hub\/.+$/,
  /^\/ops\/shops\/[^/]+\/performance$/,
  /^\/orders\/[^/]+\/audit$/,
  /^\/audit\/.+$/,
];

/** Whether a read of `path` (with or without a query) accepts the flag. */
export function acceptsReviewData(path: string): boolean {
  const bare = path.split("?")[0] ?? path;
  return (
    REVIEW_DATA_COLLECTIONS.has(bare) ||
    REVIEW_DATA_PATTERNS.some((pattern) => pattern.test(bare))
  );
}

/** `path` with `includeReviewData=1` added once. */
export function withReviewData(path: string): string {
  const [bare, query = ""] = path.split("?", 2) as [string, string?];
  const params = new URLSearchParams(query);
  params.set(REVIEW_DATA_PARAM, "1");
  return `${bare}?${params.toString()}`;
}

/** The API's answer when a test operations login reaches past its allowlist. */
export const TEST_OPERATIONS_FORBIDDEN = "test_operations_forbidden";

export const TEST_OPERATIONS_BANNER = "Test operations. You only see test data.";

export const TEST_OPERATIONS_UNAVAILABLE = {
  title: "Not available for test operations",
  body: "This page works with real customers, shops or riders, so a test operations login cannot open it. Use the pages on the left to run a test order.",
  partial: "Part of this page is not available for test operations.",
} as const;

/** Per-browser "Show test orders" choice for ordinary staff. Off by default. */
export const SHOW_TEST_ORDERS_STORAGE_KEY = "gridgo-show-test-orders";

export function readShowTestOrders(): boolean {
  try {
    return window.localStorage.getItem(SHOW_TEST_ORDERS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeShowTestOrders(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(SHOW_TEST_ORDERS_STORAGE_KEY, "true");
    else window.localStorage.removeItem(SHOW_TEST_ORDERS_STORAGE_KEY);
  } catch {
    /* Blocked storage: the switch still applies to this page. */
  }
}

/** A test order, from the API's projection mark. */
export function isTestOrder(order: { reviewData?: boolean | null }): boolean {
  return order.reviewData === true;
}
