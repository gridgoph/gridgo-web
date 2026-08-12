import { NextRequest } from "next/server";

import { getConfiguredApiBase, isLoopbackApiBase } from "@/lib/api/client";

/**
 * Local-dev same-origin proxy to the loopback GRIDGO API.
 *
 * The API's exact-origin CORS refuses any browser Origin that is not in
 * `CORS_ALLOWED_ORIGINS` with `403 origin_not_allowed` and no
 * `Access-Control-Allow-Origin`. A Next rewrite would still forward Origin
 * and hit the same 403. This handler talks to the API without Origin, the
 * same way mobile apps and curl do.
 *
 * Production builds 404 this route and the browser calls NEXT_PUBLIC_API_URL
 * directly. The handler also refuses to forward to a non-loopback API, so it
 * cannot become an open proxy onto the hosted API.
 */
export const dynamic = "force-dynamic";

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "last-event-id",
];

function localProxyEnabled(): boolean {
  if ((process.env["NODE_ENV"] ?? "") === "production") return false;
  return isLoopbackApiBase(getConfiguredApiBase());
}

async function proxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  if (!localProxyEnabled()) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const { path } = await context.params;
  const dest = `${getConfiguredApiBase()}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(dest, init);
  } catch {
    return Response.json({ error: "upstream_unreachable" }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "transfer-encoding" || lower.startsWith("access-control-")) {
      return;
    }
    out.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
