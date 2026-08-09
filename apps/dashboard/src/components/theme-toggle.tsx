'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from './ui/button';

export function ThemeToggle(): React.ReactElement {
  const [mounted, setMounted] = React.useState(false);
  const { resolvedTheme, setTheme, theme } = useTheme();

  React.useEffect(() => setMounted(true), []);

  const activeTheme = theme ?? resolvedTheme;
  const isDark = !mounted || activeTheme === 'dark';

  return (
    <Button
      className="size-11 sm:size-9"
      type="button"
      variant="outline"
      size="icon"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
