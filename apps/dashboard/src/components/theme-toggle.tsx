'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useLingui } from '@lingui/react';
import { useTheme } from 'next-themes';
import { DASHBOARD_THEME_MESSAGES } from '../i18n/messages';
import { Button } from './ui/button';

export function ThemeToggle(): React.ReactElement {
  const { _ } = useLingui();
  const [mounted, setMounted] = React.useState(false);
  const { resolvedTheme, setTheme, theme } = useTheme();

  React.useEffect(() => setMounted(true), []);

  const activeTheme = theme ?? resolvedTheme;
  const isDark = !mounted || activeTheme === 'dark';
  const toggleLabel = _(
    isDark ? DASHBOARD_THEME_MESSAGES.switchToLight : DASHBOARD_THEME_MESSAGES.switchToDark,
  );

  return (
    <Button
      className="size-11 sm:size-9"
      type="button"
      variant="outline"
      size="icon"
      aria-label={toggleLabel}
      aria-pressed={isDark}
      title={toggleLabel}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
