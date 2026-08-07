export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="gg-card text-body text-text-secondary"
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
}
