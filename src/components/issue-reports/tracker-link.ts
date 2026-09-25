/**
 * The GitHub tracker issue an issue report became. The API accepts only
 * `https://github.com/gridgoph/<repo>/issues/<n>` (400 `invalid_request`
 * otherwise), so the desk checks the same shape before it sends anything.
 */

const TRACKER_ISSUE_URL = /^https:\/\/github\.com\/gridgoph\/([A-Za-z0-9._-]+)\/issues\/([1-9]\d*)$/;

export const TRACKER_URL_EXAMPLE = "https://github.com/gridgoph/gridgo-web/issues/62";

export type TrackerIssue = { url: string; repo: string; number: number };

/** A stored tracker link, read back into its repo and issue number. */
export function parseTrackerIssueUrl(url: string | null | undefined): TrackerIssue | null {
  if (!url) return null;
  const match = TRACKER_ISSUE_URL.exec(url);
  if (!match) return null;
  return { url, repo: match[1], number: Number(match[2]) };
}

/** "gridgo-web #62" — the words on the chip. Falls back to the raw link. */
export function trackerIssueLabel(url: string): string {
  const issue = parseTrackerIssueUrl(url);
  return issue ? `${issue.repo} #${issue.number}` : url;
}

export type TrackerUrlCheck = { ok: true; url: string } | { ok: false; error: string };

/**
 * Checks a pasted link. A copied GitHub address often carries a trailing
 * slash, a comment anchor or a query; those are dropped rather than refused.
 */
export function checkTrackerIssueUrl(input: string): TrackerUrlCheck {
  const pasted = input.trim();
  if (!pasted) return { ok: false, error: "Paste the GitHub issue link first." };
  const url = pasted.replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (TRACKER_ISSUE_URL.test(url)) return { ok: true, url };
  if (/^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+\/issues\/\d+$/i.test(url) && !/github\.com\/gridgoph\//.test(url)) {
    return { ok: false, error: "Only issues in the gridgoph GitHub organisation can be linked." };
  }
  return {
    ok: false,
    error: `That is not a GitHub issue link. It should look like ${TRACKER_URL_EXAMPLE}.`,
  };
}
