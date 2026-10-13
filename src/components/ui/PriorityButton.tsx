"use client";

import { Pin } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A shared implementation priority, never a personal favorite or workflow status. */
export function PriorityButton({
  priority,
  name,
  disabled,
  onClick,
}: {
  priority: boolean;
  name: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={priority ? "secondary" : "ghost"}
      aria-label={priority ? `Unpin ${name}` : `Pin ${name} as priority`}
      aria-pressed={priority}
      disabled={disabled}
      onClick={onClick}
    >
      <Pin
        aria-hidden
        data-icon="inline-start"
        fill={priority ? "currentColor" : "none"}
      />
      {priority ? "Pinned" : "Pin priority"}
    </Button>
  );
}
