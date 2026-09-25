import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleX,
  Clock,
  GitMerge,
  GitPullRequest,
  SquarePen,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { StatusIconName, StatusTone } from "@/lib/order-state";

/** One glyph per status icon name, shared with the order Timeline. */
export const STATUS_ICONS: Record<StatusIconName, LucideIcon> = {
  "circle-check": CircleCheck,
  "triangle-alert": TriangleAlert,
  "circle-x": CircleX,
  clock: Clock,
  "square-pen": SquarePen,
  "circle-dashed": CircleDashed,
  "git-pull-request": GitPullRequest,
  "git-merge": GitMerge,
  "circle-help": CircleHelp,
  ban: Ban,
};

const TONE: Record<
  StatusTone,
  { border: string; text: string; icon: string }
> = {
  success: {
    border: "border-success",
    text: "text-success",
    icon: "var(--color-success)",
  },
  warning: {
    border: "border-warning",
    text: "text-warning",
    icon: "var(--color-warning)",
  },
  error: {
    border: "border-error",
    text: "text-error",
    icon: "var(--color-error)",
  },
  info: {
    border: "border-info",
    text: "text-info",
    icon: "var(--color-info)",
  },
  neutral: {
    border: "border-outline",
    text: "text-text-secondary",
    icon: "var(--color-text-secondary)",
  },
};

type Props = {
  tone: StatusTone;
  label: string;
  icon: StatusIconName;
};

/**
 * The chip's icon and label without the pill, for places a chip cannot sit
 * (a select trigger, a list option). Still icon + label, never colour alone.
 */
export function StatusMark({ tone, label, icon }: Props) {
  const style = TONE[tone];
  const Icon = STATUS_ICONS[icon];
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon size={14} strokeWidth={2} aria-hidden style={{ color: style.icon }} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * Colour never carries meaning alone. Status is always icon + label + colour.
 */
export function StatusChip({ tone, label, icon }: Props) {
  const style = TONE[tone];
  const Icon = STATUS_ICONS[icon];

  return (
    <span className={`gg-chip ${style.border}`} role="status">
      <Icon
        size={13}
        strokeWidth={2}
        aria-hidden
        style={{ color: style.icon }}
      />
      <span className={`text-caption ${style.text}`}>{label}</span>
    </span>
  );
}
