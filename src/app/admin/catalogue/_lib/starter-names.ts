import { listListingStarters } from "@/lib/api/client";
import { normalizeStarters } from "@/lib/listings";

/** First GRIDGO starter name per print job, if the seed has one. */
export async function starterNamesForJobs(
  codes: string[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    codes.map(async (code) => {
      try {
        const starters = normalizeStarters(await listListingStarters(code));
        const name = starters[0]?.name;
        return name ? ([code, name] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  const names: Record<string, string> = {};
  for (const entry of entries) {
    if (entry) names[entry[0]] = entry[1];
  }
  return names;
}
