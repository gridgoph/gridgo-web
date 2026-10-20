"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  createProductTypeRequest,
  getTaxonomy,
  listMyProductTypeRequests,
  listMyProductTypes,
  type ProductTypeRequest,
  type PublishedProductType,
} from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";

const VERDICT: Record<string, string> = {
  pending: "With Operations",
  approved: "Added",
  needs_revision: "Sent back",
};

export default function ProductTypesPage() {
  const [types, setTypes] = useState<PublishedProductType[]>([]);
  const [requests, setRequests] = useState<ProductTypeRequest[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [categoryCode, setCategoryCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async (q: string) => {
    setError(null);
    try {
      const [published, history, tree] = await Promise.all([
        listMyProductTypes(q),
        listMyProductTypeRequests(),
        getTaxonomy(),
      ]);
      setTypes(published);
      setRequests(history);
      setTaxonomy(tree);
      setUnavailable(false);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        setUnavailable(true);
      } else {
        setError("Could not load product types.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return types;
    return types.filter((type) =>
      `${type.name} ${type.code} ${(type.examples ?? []).join(" ")}`.toLowerCase().includes(q),
    );
  }, [types, query]);

  async function requestType() {
    if (!categoryCode || !name.trim() || !description.trim()) {
      setError("Choose a category and describe the type.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const created = await createProductTypeRequest({
        categoryCode,
        name: name.trim(),
        description: description.trim(),
      });
      setRequests((current) => [created, ...current]);
      setName("");
      setDescription("");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        setUnavailable(true);
      } else {
        setError("GRIDGO did not take that request.");
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (unavailable) {
    return (
      <ErrorState body="Product type requests are not open yet. There is nothing to submit." />
    );
  }
  if (error && types.length === 0 && requests.length === 0) {
    return <ErrorState body={error} action={<Button onClick={() => void load(query)}>Retry</Button>} />;
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-h2 text-text-primary m-0">Product types</h2>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          The same published types the shop app lists. Requesting a type does not grant a service line.
        </p>
      </header>
      {error ? <p className="text-body text-error m-0" role="alert">{error}</p> : null}
      <label className="flex flex-col gap-1">
        <span className="text-caption text-text-muted">Search by name or example</span>
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            void load(event.target.value);
          }}
        />
      </label>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {shown.map((type) => (
          <li key={type.code} className="border-outline-subtle rounded-field border px-3 py-2">
            <p className="text-body text-text-primary m-0">{type.name}</p>
            {type.examples?.length ? (
              <p className="text-caption text-text-muted m-0">{type.examples.join(", ")}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="gg-card flex flex-col gap-3 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void requestType();
        }}
      >
        <h3 className="text-h3 text-text-primary m-0">Ask for a type</h3>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-text-muted">Category</span>
          <select
            className="border-input bg-card h-12 rounded-[var(--radius-field)] border px-3"
            value={categoryCode}
            onChange={(event) => setCategoryCode(event.target.value)}
          >
            <option value="">Choose a category</option>
            {(taxonomy?.categories ?? [])
              .filter((category) => category.active !== false)
              .map((category) => (
                <option key={category.code} value={category.code}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>
        <Input value={name} placeholder="Name" onChange={(event) => setName(event.target.value)} />
        <textarea
          className="border-input bg-card min-h-24 rounded-[var(--radius-field)] border px-3 py-2"
          value={description}
          placeholder="What it is, and an example"
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button type="submit" disabled={sending || unavailable}>
          {sending ? "Sending…" : "Request this type"}
        </Button>
      </form>
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-text-primary m-0">Your requests</h3>
        {requests.length === 0 ? (
          <p className="text-body text-text-secondary m-0">No requests yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {requests.map((request) => (
              <li key={request.id} className="border-outline-subtle rounded-field border px-3 py-2">
                <p className="text-body text-text-primary m-0">{request.name}</p>
                <p className="text-caption text-text-muted m-0">
                  {VERDICT[request.status] ?? request.status}
                  {request.reason ? ` — ${request.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
