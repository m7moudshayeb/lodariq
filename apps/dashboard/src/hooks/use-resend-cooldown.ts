'use client';

import { useCallback, useEffect, useState } from 'react';

export const AUTH_RESEND_COOLDOWN_SECONDS = 30;

export function useResendCooldown(durationSeconds = AUTH_RESEND_COOLDOWN_SECONDS): {
  remainingSeconds: number;
  restart: () => void;
} {
  const [deadline, setDeadline] = useState(() => Date.now() + durationSeconds * 1_000);
  const [remainingSeconds, setRemainingSeconds] = useState(durationSeconds);

  const restart = useCallback(() => {
    const nextDeadline = Date.now() + durationSeconds * 1_000;
    setDeadline(nextDeadline);
    setRemainingSeconds(durationSeconds);
  }, [durationSeconds]);

  useEffect(() => {
    function updateRemaining(): void {
      setRemainingSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1_000)));
    }

    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1_000);
    return () => window.clearInterval(interval);
  }, [deadline]);

  return { remainingSeconds, restart };
}
