"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * "Find a job" in the shop's header (gridgoph/gridgo-web#327): Enter opens All
 * jobs filtered to what was typed (order reference, title, size or material).
 * Tablet and up only: on a phone the header has no room, and All jobs has
 * its own search.
 */
export function HeaderJobSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const go = () => {
    const q = query.trim();
    router.push(q ? `/supplier/jobs?q=${encodeURIComponent(q)}` : "/supplier/jobs");
  };
  return (
      <form
        role="search"
        className="relative hidden md:block"
        onSubmit={(event) => {
          event.preventDefault();
          go();
        }}
      >
        <Search
          className="text-text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a job"
          aria-label="Find a job"
          className="h-11 w-48 rounded-full pl-9 lg:w-64"
        />
      </form>
  );
}
