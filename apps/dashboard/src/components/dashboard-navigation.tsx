'use client';

import { isSupportedLocale, localeDirection } from '@lodariq/i18n';
import { useLingui } from '@lingui/react';
import * as React from 'react';
import {
  ChartNoAxesCombined,
  CircleHelp,
  CreditCard,
  FileStack,
  Boxes,
  Globe,
  LayoutDashboard,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Rocket,
  Users,
  X,
} from 'lucide-react';
import {
  DASHBOARD_PRIMARY_NAVIGATION,
  DASHBOARD_SUPPORT_NAVIGATION,
  type DashboardNavigationItem,
  type DashboardViewId,
} from '../lib/dashboard-constants';
import { DASHBOARD_NAVIGATION_MESSAGES } from '../i18n/messages';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme-toggle';
import { Button } from './ui/button';

interface WorkspaceNavigationProps {
  activeView?: DashboardViewId;
  authControls?: React.ReactNode;
  onSelect: (view: DashboardViewId) => void;
}

interface DesktopWorkspaceNavigationProps extends WorkspaceNavigationProps {
  compactAuthControls?: React.ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

const NAVIGATION_ICONS = {
  overview: LayoutDashboard,
  experiences: FileStack,
  releases: Rocket,
  analytics: ChartNoAxesCombined,
  brand: Palette,
  environments: Globe,
  applications: Boxes,
  members: Users,
  billing: CreditCard,
  support: CircleHelp,
} as const;

const DRAWER_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
const DESKTOP_NAVIGATION_MEDIA_QUERY = '(min-width: 48rem)';

export function DesktopWorkspaceNavigation({
  activeView,
  authControls,
  compactAuthControls,
  expanded,
  onExpandedChange,
  onSelect,
}: DesktopWorkspaceNavigationProps): React.ReactElement {
  const { _, i18n } = useLingui();
  const rtl = isSupportedLocale(i18n.locale) && localeDirection(i18n.locale) === 'rtl';
  const CollapseIcon = rtl ? PanelRightClose : PanelLeftClose;
  const ExpandIcon = rtl ? PanelRightOpen : PanelLeftOpen;
  const navigationToggleLabel = _(
    expanded ? DASHBOARD_NAVIGATION_MESSAGES.collapse : DASHBOARD_NAVIGATION_MESSAGES.expand,
  );
  return (
    <aside
      className="sticky top-0 hidden h-screen w-full min-w-0 flex-col border-e border-border bg-card md:flex"
      id="desktop-workspace-navigation"
    >
      <div
        className={
          expanded
            ? 'flex h-20 items-center justify-between gap-2 px-4'
            : 'flex h-20 items-center justify-center px-2'
        }
      >
        {expanded ? <DashboardBrand compact /> : null}
        <Button
          aria-controls="desktop-workspace-navigation"
          aria-expanded={expanded}
          aria-label={navigationToggleLabel}
          className="size-11 p-0"
          onClick={() => onExpandedChange(!expanded)}
          title={navigationToggleLabel}
          type="button"
          variant="ghost"
        >
          {expanded ? <CollapseIcon aria-hidden="true" /> : <ExpandIcon aria-hidden="true" />}
        </Button>
      </div>
      <DashboardNavigation
        activeView={activeView}
        collapsed={!expanded}
        items={DASHBOARD_PRIMARY_NAVIGATION}
        onSelect={onSelect}
      />
      <div className="mt-auto grid min-w-0 gap-2 pb-4">
        <DashboardNavigation
          activeView={activeView}
          collapsed={!expanded}
          items={[DASHBOARD_SUPPORT_NAVIGATION]}
          onSelect={onSelect}
        />
        <div
          className={
            expanded
              ? 'min-w-0 border-t border-border px-3 pt-3'
              : 'min-w-0 border-t border-border px-2 pt-3'
          }
        >
          {expanded && authControls ? <div className="mb-2 min-w-0">{authControls}</div> : null}
          {!expanded && compactAuthControls ? (
            <div className="mb-2 min-w-0">{compactAuthControls}</div>
          ) : null}
          {expanded ? (
            <div className="mb-3 min-w-0">
              <LanguageSwitcher />
            </div>
          ) : (
            <div className="mb-3 flex justify-center">
              <LanguageSwitcher compact />
            </div>
          )}
          <div
            className={expanded ? 'flex items-center justify-between gap-3' : 'flex justify-center'}
          >
            {expanded ? (
              <span className="text-xs font-medium text-muted-foreground">
                {_(DASHBOARD_NAVIGATION_MESSAGES.appearance)}
              </span>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileWorkspaceHeader({
  activeView,
  authControls,
  onSelect,
}: WorkspaceNavigationProps): React.ReactElement {
  const { _ } = useLingui();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const drawerRef = React.useRef<HTMLElement>(null);

  const closeDrawer = React.useCallback((restoreMenuFocus: boolean): void => {
    setDrawerOpen(false);
    if (restoreMenuFocus) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
  }, []);

  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const desktopNavigation = window.matchMedia(DESKTOP_NAVIGATION_MEDIA_QUERY);
    const closeAtDesktopBreakpoint = (): void => {
      if (desktopNavigation.matches) setDrawerOpen(false);
    };
    closeAtDesktopBreakpoint();
    desktopNavigation.addEventListener('change', closeAtDesktopBreakpoint);
    return () => desktopNavigation.removeEventListener('change', closeAtDesktopBreakpoint);
  }, []);

  React.useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const backgroundElements = [
      document.getElementById('mobile-workspace-header'),
      document.getElementById('dashboard-active-view'),
    ].filter((element): element is HTMLElement => Boolean(element));
    const backgroundState = backgroundElements.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute('aria-hidden'),
    }));
    for (const element of backgroundElements) {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    }
    const focusFrame = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>('[data-dashboard-nav-item]')?.focus();
    });
    const handleDrawerKeyboard = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer(true);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (!firstElement || !lastElement) return;

      const activeElement = document.activeElement;
      if (
        event.shiftKey &&
        (activeElement === firstElement || !drawerRef.current?.contains(activeElement))
      ) {
        event.preventDefault();
        lastElement.focus();
        return;
      }
      if (
        !event.shiftKey &&
        (activeElement === lastElement || !drawerRef.current?.contains(activeElement))
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleDrawerKeyboard);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleDrawerKeyboard);
      document.body.style.overflow = previousOverflow;
      for (const state of backgroundState) {
        state.element.inert = state.inert;
        if (state.ariaHidden === null) state.element.removeAttribute('aria-hidden');
        else state.element.setAttribute('aria-hidden', state.ariaHidden);
      }
    };
  }, [closeDrawer, drawerOpen]);

  const selectMobileView = (view: DashboardViewId): void => {
    onSelect(view);
    closeDrawer(false);
  };

  return (
    <>
      <header
        className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur md:hidden"
        id="mobile-workspace-header"
      >
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <DashboardBrand compact />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              aria-controls="mobile-workspace-navigation"
              aria-expanded={drawerOpen}
              aria-label={_(DASHBOARD_NAVIGATION_MESSAGES.open)}
              className="size-11 p-0"
              onClick={() => setDrawerOpen(true)}
              ref={menuButtonRef}
              type="button"
              variant="ghost"
            >
              <Menu aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 size-full bg-[rgba(20,22,28,.38)] backdrop-blur-[2px]"
            onClick={() => closeDrawer(true)}
          />
          <aside
            aria-label={_(DASHBOARD_NAVIGATION_MESSAGES.workspace)}
            aria-modal="true"
            className="relative z-10 flex h-dvh max-h-dvh w-[min(320px,calc(100vw-48px))] flex-col overflow-y-auto overscroll-contain border-e border-border bg-card shadow-[0_18px_60px_rgba(20,22,28,.2)] ltr:me-auto rtl:ms-auto"
            id="mobile-workspace-navigation"
            ref={drawerRef}
            role="dialog"
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <DashboardBrand compact />
              <Button
                aria-label={_(DASHBOARD_NAVIGATION_MESSAGES.close)}
                className="size-11 p-0"
                onClick={() => closeDrawer(true)}
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <div className="grid gap-4 py-4">
              <DashboardNavigation
                activeView={activeView}
                items={DASHBOARD_PRIMARY_NAVIGATION}
                onSelect={selectMobileView}
              />
            </div>
            <div className="mt-auto grid gap-3 border-t border-border py-4">
              <DashboardNavigation
                activeView={activeView}
                items={[DASHBOARD_SUPPORT_NAVIGATION]}
                onSelect={selectMobileView}
              />
              <div className="grid min-w-0 gap-3 border-t border-border px-3 pt-4">
                {authControls ? <div className="min-w-0">{authControls}</div> : null}
                <LanguageSwitcher />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {_(DASHBOARD_NAVIGATION_MESSAGES.appearance)}
                  </span>
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function DashboardNavigation({
  activeView,
  collapsed = false,
  items,
  onSelect,
}: {
  activeView?: DashboardViewId;
  collapsed?: boolean;
  items: readonly DashboardNavigationItem[];
  onSelect: (view: DashboardViewId) => void;
}): React.ReactElement {
  const { _ } = useLingui();
  return (
    <nav
      aria-label={_(
        items.length === 1
          ? DASHBOARD_NAVIGATION_MESSAGES.supportLabel
          : DASHBOARD_NAVIGATION_MESSAGES.workspace,
      )}
      className={collapsed ? 'grid gap-1 px-2' : 'grid gap-1 px-3'}
    >
      {items.map((item) => {
        const Icon = NAVIGATION_ICONS[item.icon];
        const label = _(item.label);
        const active = activeView === item.id;
        const layoutClassName = collapsed ? 'justify-center px-0' : 'gap-3 px-3';
        const stateClassName = active
          ? 'bg-[var(--nav-active)] font-semibold text-primary'
          : 'font-medium text-muted-foreground hover:bg-[var(--nav-hover)] hover:text-foreground';
        return (
          <div className="group relative" key={item.id}>
            <button
              aria-current={active ? 'page' : undefined}
              aria-controls="dashboard-active-view"
              className={`flex min-h-11 w-full items-center rounded-lg text-start text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${layoutClassName} ${stateClassName}`}
              data-dashboard-nav-item
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <Icon aria-hidden="true" className="size-[18px] shrink-0" />
              <span className={collapsed ? 'sr-only' : undefined}>{label}</span>
            </button>
            {collapsed ? (
              <span
                className="pointer-events-none absolute start-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-semibold text-popover-foreground opacity-0 shadow-lg transition duration-100 ltr:translate-x-1 rtl:-translate-x-1 group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                role="tooltip"
              >
                {label}
              </span>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function DashboardBrand({ compact = false }: { compact?: boolean }): React.ReactElement {
  return (
    <div className={compact ? 'flex items-center' : 'flex h-20 items-center px-5'}>
      <span className="text-xl font-bold tracking-[-0.035em]">Lodariq</span>
    </div>
  );
}
