const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Clerk's development `__clerk_db_jwt` / `__session` cookies are host-scoped,
 * not port-scoped. `localhost:3000` therefore shares a session with leftover
 * Expo logins that once lived on `localhost:8081` (and any other localhost
 * port). The portal lives on its own `*.localhost` host so those cookies
 * stay apart. Chromium resolves `*.localhost` to loopback without a hosts file.
 */
export const GRIDGO_DEV_WEB_HOST = "portal.localhost";

type DevWebLocation = {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
};

function isTestWorker(): boolean {
  if (typeof process === "undefined") return false;
  return Boolean(
    process.env.JEST_WORKER_ID || process.env.VITEST || process.env.VITEST_WORKER_ID,
  );
}

/** Prefer the browser Host header — Next `nextUrl.hostname` stays `localhost`. */
export function hostnamePortFromHostHeader(
  hostHeader: string | null | undefined,
): { hostname: string; port: string } | null {
  if (!hostHeader?.trim()) return null;
  try {
    const parsed = new URL(`http://${hostHeader.trim()}`);
    return { hostname: parsed.hostname, port: parsed.port };
  } catch {
    return null;
  }
}

export function isolatedDevWebHref(
  location: DevWebLocation,
  isolatedHost: string,
): string | null {
  if (location.hostname === isolatedHost) return null;
  if (!LOOPBACK.has(location.hostname)) return null;
  const port = location.port ? `:${location.port}` : "";
  const protocol = location.protocol.endsWith(":")
    ? location.protocol
    : `${location.protocol}:`;
  return `${protocol}//${isolatedHost}${port}${location.pathname}${location.search}${location.hash}`;
}

/**
 * Inlined into the document in `next dev` so the tab leaves `localhost`
 * before Clerk's client bundle can write host-scoped cookies there.
 */
export const DEV_WEB_HOST_BOUNCE_SCRIPT = `(function(){var h=location.hostname;if(h!=="localhost"&&h!=="127.0.0.1"&&h!=="[::1]"&&h!=="::1")return;var p=location.port?":"+location.port:"";location.replace(location.protocol+"//${GRIDGO_DEV_WEB_HOST}"+p+location.pathname+location.search+location.hash)})();`;

/**
 * Post-hydration fallback only. Do not call during render or use the return
 * value to skip Clerk / change the React tree — that mismatches SSR.
 * Loopback is already redirected by middleware and `DEV_WEB_HOST_BOUNCE_SCRIPT`.
 */
export function bounceToIsolatedDevWebHost(isolatedHost: string): boolean {
  if (isTestWorker()) return false;
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "development") {
    return false;
  }
  if (typeof window === "undefined") return false;
  const href = isolatedDevWebHref(window.location, isolatedHost);
  if (!href) return false;
  window.location.replace(href);
  return true;
}
