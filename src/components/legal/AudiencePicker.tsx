"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { LegalAudience } from "@/lib/api/types";
import { LEGAL_AUDIENCES, audienceApp, audienceLabel } from "@/lib/legal";

const HINT: Record<LegalAudience, string> = {
  all: "Everyone signed in, in every app, and on the website",
  client: "People who order prints",
  supplier: "Print shops",
  rider: "Riders",
  staff: "Hub staff in the GRIDGO Admin App",
};

type Props = {
  labelledBy: string;
  value: LegalAudience | null;
  onChange: (value: LegalAudience) => void;
  disabled?: boolean;
};

/** Who a document binds, with the app it shows in. */
export function AudiencePicker({ labelledBy, value, onChange, disabled }: Props) {
  return (
    <RadioGroup
      aria-labelledby={labelledBy}
      value={value ?? ""}
      disabled={disabled}
      onValueChange={(next) => {
        const audience = LEGAL_AUDIENCES.find((option) => option === next);
        if (audience) onChange(audience);
      }}
      className="grid gap-2 sm:grid-cols-2"
    >
      {LEGAL_AUDIENCES.map((audience) => (
        <label
          key={audience}
          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline-subtle px-3 py-2.5 has-[[data-checked]]:border-text-primary"
        >
          <RadioGroupItem value={audience} className="mt-1" />
          <span className="min-w-0">
            <span className="text-body text-text-primary block" style={{ fontFamily: "var(--font-medium)" }}>
              {audienceLabel(audience)}
            </span>
            <span className="text-caption text-text-muted block">
              {HINT[audience]}
              {audience === "all" ? "" : `, in ${audienceApp(audience)}`}
            </span>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
