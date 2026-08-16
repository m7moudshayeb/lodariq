'use client';

import { useEffect, type ReactElement } from 'react';
import { statusToast } from '../ui/toaster';

export function BrandFeedbackBanner({
  error,
  message,
}: {
  error: string;
  message: string;
}): ReactElement | null {
  useEffect(() => {
    if (error) statusToast('error', error);
    else if (message) statusToast('success', message);
  }, [error, message]);
  return null;
}
