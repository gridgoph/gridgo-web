import type { ReactNode } from "react";

import type { Presentation } from "@/app/admin/_lib/present";
import { StatusChip } from "@/components/ui/StatusChip";
import type { CategoryRank } from "@/lib/api/types";

export function ApplicantHeader({
  title,
  caption,
  status,
}: {
  title: string;
  caption?: string;
  status: Presentation;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {title}
        </p>
        {caption ? (
          <p className="text-caption text-text-muted m-0 mt-0.5">{caption}</p>
        ) : null}
      </div>
      <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
    </div>
  );
}

export function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted m-0">{label}</dt>
      <dd className="text-body text-text-primary m-0 mt-0.5 break-words">{value}</dd>
    </div>
  );
}

export function SupplierCategoryRanks({
  ranks,
  categoryNames,
  empty,
}: {
  ranks: CategoryRank[] | undefined;
  categoryNames: Record<string, string>;
  empty?: ReactNode;
}) {
  const sorted = [...(ranks ?? [])].sort((a, b) => a.rank - b.rank);
  return (
    <div>
      <p className="text-caption text-text-muted m-0">What they say they do best</p>
      {sorted.length ? (
        <ol className="text-body text-text-primary m-0 mt-1 list-decimal pl-5">
          {sorted.map((rank) => (
            <li key={rank.categoryCode}>
              {categoryNames[rank.categoryCode] ?? rank.categoryCode.replace(/_/g, " ")}
            </li>
          ))}
        </ol>
      ) : (
        (empty ?? null)
      )}
    </div>
  );
}
