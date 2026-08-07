/**
 * Typed GRIDGO demo API client.
 *
 * All network calls go through this module — pages never call `fetch` directly.
 * Base URL comes from NEXT_PUBLIC_API_URL (default http://127.0.0.1:8787).
 */

import type {
  CatalogItem,
  CreditBalance,
  Notification,
  Order,
  User,
} from "@/lib/api/types";

const DEFAULT_API_BASE = "http://127.0.0.1:8787";

export function getApiBase(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "")
      : undefined;
  return fromEnv || DEFAULT_API_BASE;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(
      typeof body === "object" && body && "error" in body
        ? String((body as { error: string }).error)
        : `HTTP ${status}`,
    );
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  get code(): string {
    if (typeof this.body === "object" && this.body && "error" in this.body) {
      return String((this.body as { error: string }).error);
    }
    return `http_${this.status}`;
  }
}

type TokenProvider = () => string | null;

let tokenProvider: TokenProvider = () => null;

/** Wire the client to the session store (called once from AuthProvider). */
export function setTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: User }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  try {
    await request("/auth/logout", { method: "POST" });
  } catch {
    // Session may already be gone; local clear still happens in AuthProvider.
  }
}

export async function me(): Promise<User> {
  const result = await request<{ user: User }>("/auth/me");
  return result.user;
}

export async function listOrders(): Promise<Order[]> {
  const result = await request<{ orders: Order[] }>("/orders");
  return result.orders;
}

/** Supplier job inbox — 403 for non-supplier roles. */
export async function listJobs(): Promise<Order[]> {
  const result = await request<{ jobs: Order[] }>("/jobs");
  return result.jobs;
}

export async function getOrder(orderId: string): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}`);
  return result.order;
}

export async function transitionOrder(
  orderId: string,
  state: string,
  extra: Record<string, unknown> = {},
): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}/transition`, {
    method: "POST",
    body: JSON.stringify({ state, ...extra }),
  });
  return result.order;
}

export async function listNotifications(): Promise<Notification[]> {
  const result = await request<{ notifications: Notification[] }>("/notifications");
  return result.notifications;
}

export async function creditBalance(clientId?: string): Promise<CreditBalance> {
  const q = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return request(`/credits/balance${q}`);
}

export async function listCatalog(): Promise<CatalogItem[]> {
  const result = await request<{ catalog: CatalogItem[] }>("/catalog");
  return result.catalog;
}

export async function health(): Promise<{ ok: boolean; service?: string }> {
  return request("/health");
}
