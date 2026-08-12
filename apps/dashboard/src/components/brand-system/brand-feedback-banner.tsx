export function BrandFeedbackBanner({
  error,
  message,
}: {
  error: string;
  message: string;
}): React.ReactElement | null {
  if (!error && !message) return null;
  return (
    <div
      aria-live="polite"
      className={
        error
          ? 'rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm font-medium text-[var(--danger-fg)]'
          : 'rounded-lg border border-[var(--success-border)] bg-[var(--success-bg)] px-4 py-3 text-sm font-medium text-[var(--success-fg)]'
      }
      role={error ? 'alert' : 'status'}
    >
      {error || message}
    </div>
  );
}
