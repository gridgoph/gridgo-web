type Props = {
  /** Compact mark for the rail; full wordmark when false. */
  compact?: boolean;
};

/** GRIDGO wordmark with brand-logo yellow dot. Dot colour is brand-logo only. */
export function Logo({ compact = false }: Props) {
  return (
    <div className="flex items-center gap-2" aria-label="GRIDGO">
      <span
        className="inline-block size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: "var(--color-brand-logo)" }}
        aria-hidden
      />
      {!compact ? (
        <span
          className="text-body-lg tracking-tight"
          style={{ fontFamily: "var(--font-black)" }}
        >
          GRIDGO
        </span>
      ) : null}
    </div>
  );
}
