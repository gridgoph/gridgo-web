"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { User } from "@/lib/api/types";
import { roleLabel } from "@/lib/routes";

type Props = {
  users: readonly User[] | null;
  onPick: (user: User) => void;
  label?: string;
};

const MAX_RESULTS = 8;

/** Name, email or account ID; plain text match, best first. */
export function matchUsers(users: readonly User[], query: string): User[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { user: User; score: number }[] = [];
  for (const user of users) {
    const fields = [user.name, user.email, user.id, user.supplierName, user.orgName]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    let score = -1;
    for (const field of fields) {
      if (field === q) score = Math.max(score, 3);
      else if (field.startsWith(q)) score = Math.max(score, 2);
      else if (field.includes(q)) score = Math.max(score, 1);
    }
    if (score >= 0) scored.push({ user, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || (a.user.name || "").localeCompare(b.user.name || ""))
    .slice(0, MAX_RESULTS)
    .map((row) => row.user);
}

/** Find one account by name, email or ID. */
export function PersonFinder({ users, onPick, label = "Find a person" }: Props) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => (users ? matchUsers(users, query) : []), [users, query]);
  const searching = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-2">
      <Field>
        <FieldLabel htmlFor="person-finder">{label}</FieldLabel>
        <div className="relative">
          <Search
            aria-hidden
            className="text-text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="person-finder"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, email or account ID"
            className="pl-9"
            autoComplete="off"
            disabled={!users}
            aria-describedby="person-finder-hint"
          />
        </div>
        <FieldDescription id="person-finder-hint">
          {users ? `${users.length.toLocaleString("en-PH")} accounts to search.` : "Loading accounts…"}
        </FieldDescription>
      </Field>
      {searching ? (
        results.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Matching accounts">
            {results.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    onPick(user);
                  }}
                  className="hover:bg-surface-variant flex min-h-11 w-full flex-col items-start rounded-field border border-outline-subtle px-3 py-2 text-left"
                >
                  <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                    {user.name || user.email || user.id}
                  </span>
                  <span className="text-caption text-text-muted break-all">
                    {roleLabel(user.role)}
                    {user.email ? `, ${user.email}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-text-muted m-0" role="status">
            No account matches “{query.trim()}”.
          </p>
        )
      ) : null}
    </div>
  );
}
