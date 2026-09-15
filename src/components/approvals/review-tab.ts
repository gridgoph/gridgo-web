/** Inbox deep-links use `?tab=services`; anything else is the sign-up queue. */
export function reviewQueueTab(search: {
  get: (key: string) => string | null;
}): "signups" | "services" {
  return search.get("tab") === "services" ? "services" : "signups";
}
