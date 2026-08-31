"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  id?: string;
  examples: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function ExamplesChips({ id, examples, onChange, disabled }: Props) {
  const [draft, setDraft] = useState("");

  function add() {
    const next = draft.trim();
    if (!next || disabled) return;
    if (examples.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...examples, next]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      {examples.length ? (
        <ul className="m-0 flex flex-wrap gap-2 p-0" aria-label="Examples">
          {examples.map((item) => (
            <li key={item} className="m-0 list-none p-0">
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${item}`}
                onClick={() => onChange(examples.filter((entry) => entry !== item))}
                className="border-outline bg-surface-variant text-caption text-text-primary hover:bg-muted inline-flex min-h-11 items-center gap-2 rounded-field border px-3"
              >
                {item}
                <X className="size-4 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          value={draft}
          disabled={disabled}
          placeholder="A5, acrylic letters…"
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" disabled={disabled || !draft.trim()} onClick={add}>
          Add example
        </Button>
      </div>
    </div>
  );
}
