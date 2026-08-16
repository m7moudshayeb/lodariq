import type { ReactElement } from 'react';
import { StatusBanner } from '../ui/status-banner';

export function BrandFeedbackBanner({
  error,
  message,
}: {
  error: string;
  message: string;
}): ReactElement | null {
  if (!error && !message) return null;
  return <StatusBanner kind={error ? 'error' : 'success'} title={error || message} />;
}
