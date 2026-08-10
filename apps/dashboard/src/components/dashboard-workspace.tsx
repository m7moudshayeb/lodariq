'use client';

import * as React from 'react';
import {
  ChartNoAxesCombined,
  CircleHelp,
  ExternalLink,
  FileStack,
  Globe2,
  LayoutDashboard,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  DASHBOARD_PAGE_COPY,
  DASHBOARD_PRIMARY_NAVIGATION,
  DASHBOARD_SUPPORT_NAVIGATION,
  DASHBOARD_VIEW_IDS,
  type DashboardNavigationItem,
  type DashboardViewId,
} from '../lib/dashboard-constants';
import { updateEnvironmentReleasePolicyAction } from '../app/actions';
import type { WorkspaceEnvironmentDto } from '../lib/api';
import type { DashboardViewModel } from '../lib/view-model';
import {
  AnalyticsPanel,
  type AnalyticsEnvironmentOption,
} from './analytics-panel';
import { AuthoringLaunchPanel } from './authoring-launch-panel';
import { BrandSystemPanel } from './brand-system-panel';
import { DocumentDebugPanel } from './document-debug-panel';
import { DocumentsTable } from './documents-table';
import { EnvironmentPolicyEditor } from './environment-policy-editor';
import { LaunchQueue } from './launch-queue';
import { RecentActivity } from './recent-activity';
import { ReleaseProgress } from './release-progress';
import {
  ReleaseRecoveryPanel,
  type ReleaseRecoveryEnvironmentOption,
} from './release-recovery-panel';
import { SdkSnippetPanel } from './sdk-snippet-panel';
import { ThemeToggle } from './theme-toggle';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface DashboardWorkspaceProps {
  viewModel: DashboardViewModel;
  apiError?: string;
  authControls?: React.ReactNode;
  compactAuthControls?: React.ReactNode;
}

const navigationIcons = {
  overview: LayoutDashboard,
  experiences: FileStack,
  releases: Rocket,
  analytics: ChartNoAxesCombined,
  brand: Palette,
  environments: Globe2,
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

export function DashboardWorkspace({
  viewModel,
  apiError,
  authControls,
  compactAuthControls,
}: DashboardWorkspaceProps): React.ReactElement {
  const [activeView, setActiveView] = React.useState<DashboardViewId>('overview');
  const [desktopNavigationExpanded, setDesktopNavigationExpanded] = React.useState(false);
  const [releaseDocumentId, setReleaseDocumentId] = React.useState('');
  const shouldFocusHeading = React.useRef(false);

  const selectView = React.useCallback((view: DashboardViewId, updateHistory = true): void => {
    shouldFocusHeading.current = true;
    setActiveView(view);
    if (updateHistory && window.location.hash !== `#${view}`) {
      window.history.pushState(null, '', `#${view}`);
    }
  }, []);

  React.useEffect(() => {
    const syncViewFromLocation = (focusHeading: boolean): void => {
      const view = dashboardViewFromHash(window.location.hash) ?? 'overview';
      shouldFocusHeading.current = focusHeading;
      setActiveView(view);
    };
    const syncAndFocusView = (): void => syncViewFromLocation(true);
    syncViewFromLocation(false);
    window.addEventListener('hashchange', syncAndFocusView);
    window.addEventListener('popstate', syncAndFocusView);
    return () => {
      window.removeEventListener('hashchange', syncAndFocusView);
      window.removeEventListener('popstate', syncAndFocusView);
    };
  }, []);

  React.useEffect(() => {
    if (!shouldFocusHeading.current) return;
    shouldFocusHeading.current = false;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-dashboard-view-heading]')?.focus();
    });
  }, [activeView]);

  function openReleaseDetails(documentId: string): void {
    setReleaseDocumentId(documentId);
    selectView('releases');
  }

  return (
    <div
      className={`min-h-screen bg-background text-foreground transition-[grid-template-columns] duration-200 motion-reduce:transition-none md:grid ${
        desktopNavigationExpanded
          ? 'md:grid-cols-[208px_minmax(0,1fr)]'
          : 'md:grid-cols-[72px_minmax(0,1fr)]'
      }`}
    >
      <aside
        className="sticky top-0 hidden h-screen flex-col border-r border-border bg-card md:flex"
        id="desktop-workspace-navigation"
      >
        <div
          className={
            desktopNavigationExpanded
              ? 'flex h-20 items-center justify-between gap-2 px-4'
              : 'flex h-20 items-center justify-center px-2'
          }
        >
          {desktopNavigationExpanded ? <DashboardBrand compact /> : null}
          <Button
            aria-controls="desktop-workspace-navigation"
            aria-expanded={desktopNavigationExpanded}
            aria-label={
              desktopNavigationExpanded
                ? 'Collapse workspace navigation'
                : 'Expand workspace navigation'
            }
            className="size-11 p-0"
            onClick={() => setDesktopNavigationExpanded((expanded) => !expanded)}
            title={
              desktopNavigationExpanded
                ? 'Collapse workspace navigation'
                : 'Expand workspace navigation'
            }
            type="button"
            variant="ghost"
          >
            {desktopNavigationExpanded ? (
              <PanelLeftClose aria-hidden="true" />
            ) : (
              <PanelLeftOpen aria-hidden="true" />
            )}
          </Button>
        </div>
        <DashboardNavigation
          activeView={activeView}
          collapsed={!desktopNavigationExpanded}
          items={DASHBOARD_PRIMARY_NAVIGATION}
          onSelect={selectView}
        />
        <div className="mt-auto grid gap-2 pb-4">
          <DashboardNavigation
            activeView={activeView}
            collapsed={!desktopNavigationExpanded}
            items={[DASHBOARD_SUPPORT_NAVIGATION]}
            onSelect={selectView}
          />
          <div
            className={
              desktopNavigationExpanded
                ? 'mx-4 border-t border-border pt-3'
                : 'mx-2 border-t border-border pt-3'
            }
          >
            {desktopNavigationExpanded && authControls ? (
              <div className="mb-2 min-w-0">{authControls}</div>
            ) : null}
            {!desktopNavigationExpanded && compactAuthControls ? (
              <div className="mb-2 min-w-0">{compactAuthControls}</div>
            ) : null}
            <div
              className={
                desktopNavigationExpanded
                  ? 'flex items-center justify-between gap-3 px-2'
                  : 'flex justify-center'
              }
            >
              {desktopNavigationExpanded ? (
                <span className="text-xs font-medium text-muted-foreground">Appearance</span>
              ) : null}
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 md:col-start-2">
        <MobileWorkspaceHeader
          activeView={activeView}
          authControls={authControls}
          onSelect={selectView}
        />
        <main
          className="mx-auto min-h-screen w-full max-w-[1120px] px-4 py-6 sm:px-6 md:px-8 md:py-16 lg:px-10"
          id="dashboard-active-view"
        >
          {apiError ? (
            <div
              className="mb-6 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-sm font-medium text-[var(--danger-fg)]"
              role="alert"
            >
              {apiError}
            </div>
          ) : null}

          {activeView === 'overview' ? (
            <OverviewView
              viewModel={viewModel}
              onReviewRelease={openReleaseDetails}
              onViewAll={() => selectView('experiences')}
            />
          ) : null}
          {activeView === 'experiences' ? <ExperiencesView viewModel={viewModel} /> : null}
          {activeView === 'releases' ? (
            <ReleasesView viewModel={viewModel} selectedDocumentId={releaseDocumentId} />
          ) : null}
          {activeView === 'analytics' ? <AnalyticsView viewModel={viewModel} /> : null}
          {activeView === 'brand-system' ? <BrandSystemView viewModel={viewModel} /> : null}
          {activeView === 'environments' ? <EnvironmentsView viewModel={viewModel} /> : null}
          {activeView === 'support' ? <SupportView viewModel={viewModel} /> : null}
        </main>
      </div>
    </div>
  );
}

function DashboardBrand({ compact = false }: { compact?: boolean }): React.ReactElement {
  return (
    <div className={compact ? 'flex items-center' : 'flex h-20 items-center px-5'}>
      <span className="text-xl font-bold tracking-[-0.035em]">Lodariq</span>
    </div>
  );
}

function DashboardNavigation({
  activeView,
  collapsed = false,
  items,
  onSelect,
}: {
  activeView: DashboardViewId;
  collapsed?: boolean;
  items: readonly DashboardNavigationItem[];
  onSelect: (view: DashboardViewId) => void;
}): React.ReactElement {
  return (
    <nav
      aria-label={items.length === 1 ? 'Support' : 'Workspace'}
      className={collapsed ? 'grid gap-1 px-2' : 'grid gap-1 px-3'}
    >
      {items.map((item) => {
        const Icon = navigationIcons[item.icon];
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
              className={`flex min-h-11 w-full items-center rounded-lg text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${layoutClassName} ${stateClassName}`}
              data-dashboard-nav-item
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <Icon aria-hidden="true" className="size-[18px] shrink-0" />
              <span className={collapsed ? 'sr-only' : undefined}>{item.label}</span>
            </button>
            {collapsed ? (
              <span
                className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-semibold text-popover-foreground opacity-0 shadow-lg transition duration-100 group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                role="tooltip"
              >
                {item.label}
              </span>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function MobileWorkspaceHeader({
  activeView,
  authControls,
  onSelect,
}: {
  activeView: DashboardViewId;
  authControls?: React.ReactNode;
  onSelect: (view: DashboardViewId) => void;
}): React.ReactElement {
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
              aria-label="Open workspace navigation"
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
            className="absolute inset-0 size-full bg-[rgba(12,33,28,.38)] backdrop-blur-[2px]"
            onClick={() => closeDrawer(true)}
          />
          <aside
            aria-label="Workspace navigation"
            aria-modal="true"
            className="relative z-10 flex h-dvh max-h-dvh w-[min(320px,calc(100vw-48px))] flex-col overflow-y-auto overscroll-contain border-r border-border bg-card shadow-[18px_0_60px_rgba(12,33,28,.2)]"
            id="mobile-workspace-navigation"
            ref={drawerRef}
            role="dialog"
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <DashboardBrand compact />
              <Button
                aria-label="Close workspace navigation"
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
              <div className="mx-4 grid gap-3 border-t border-border pt-4">
                {authControls ? <div className="min-w-0">{authControls}</div> : null}
                <div className="flex items-center justify-between gap-3 px-2">
                  <span className="text-xs font-medium text-muted-foreground">Appearance</span>
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

function OverviewView({
  viewModel,
  onReviewRelease,
  onViewAll,
}: {
  viewModel: DashboardViewModel;
  onReviewRelease: (documentId: string) => void;
  onViewAll: () => void;
}): React.ReactElement {
  return (
    <>
      <PageHeader
        view="overview"
        action={<OpenInProductAction url={viewModel.openInProductUrl} />}
        editorial
      />
      <LaunchQueue rows={viewModel.documentRows} onReviewRelease={onReviewRelease} />
      <RecentActivity activities={viewModel.recentActivity} onViewAll={onViewAll} />
    </>
  );
}

function ExperiencesView({ viewModel }: { viewModel: DashboardViewModel }): React.ReactElement {
  return (
    <>
      <PageHeader view="experiences" />
      <Card className="shadow-none">
        <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
          <DocumentsTable rows={viewModel.documentRows} />
        </CardContent>
      </Card>
    </>
  );
}

function AnalyticsView({ viewModel }: { viewModel: DashboardViewModel }): React.ReactElement {
  return (
    <>
      <PageHeader view="analytics" />
      <AnalyticsPanel environments={analyticsEnvironmentOptions(viewModel.environmentOptions)} />
    </>
  );
}

function analyticsEnvironmentOptions(
  environments: DashboardViewModel['environmentOptions'],
): AnalyticsEnvironmentOption[] {
  const options: AnalyticsEnvironmentOption[] = [];
  for (const environment of environments) {
    if (environment.kind !== 'staging' && environment.kind !== 'production') continue;
    options.push({
      id: environment.id,
      kind: environment.kind,
      name: environment.name,
      enabled: environment.enabled ?? true,
    });
  }
  return options;
}

function ReleasesView({
  viewModel,
  selectedDocumentId,
}: {
  viewModel: DashboardViewModel;
  selectedDocumentId: string;
}): React.ReactElement {
  const orderedRows = orderSelectedRelease(viewModel.documentRows, selectedDocumentId);
  const recoveryEnvironments = releaseRecoveryEnvironmentOptions(viewModel.environmentOptions);
  return (
    <>
      <PageHeader
        view="releases"
        action={<OpenInProductAction url={viewModel.openInProductUrl} />}
      />
      <div className="grid gap-4">
        {orderedRows.length ? (
          orderedRows.map((row) => (
            <article
              className={
                row.id === selectedDocumentId
                  ? 'rounded-xl border border-primary/30 bg-card p-5 shadow-[0_0_0_3px_rgba(11,102,85,.06)]'
                  : 'rounded-xl border border-border bg-card p-5'
              }
              key={row.id}
            >
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{row.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {row.releaseSummary}
                  </p>
                </div>
                <Badge className="w-fit shrink-0" variant={row.queueStatusVariant}>
                  {row.queueStatusLabel}
                </Badge>
              </div>
              <ReleaseProgress compact stages={row.releaseStages} />
              <dl className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2 xl:grid-cols-4">
                {row.releaseEvidence.map((evidence) => (
                  <div
                    className="grid content-start gap-1 rounded-lg border border-border bg-[var(--surface-subtle)] p-3"
                    key={evidence.id}
                  >
                    <dt className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                      {evidence.label}
                      <Badge variant={evidence.tone}>{evidence.value}</Badge>
                    </dt>
                    <dd className="text-xs leading-5 text-muted-foreground">{evidence.detail}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="grid gap-0.5">
                  <p className="text-sm font-semibold text-foreground">Exact-artifact promotion</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Production promotion must reuse the verified staging artifact with no rebuild,
                    automatic theme mutation, or environment copy.
                  </p>
                </div>
              </div>
              <ReleaseRecoveryPanel
                documentId={row.id}
                documentTitle={row.title}
                environments={recoveryEnvironments}
              />
            </article>
          ))
        ) : (
          <EmptyView
            icon={<Rocket aria-hidden="true" />}
            title="No releases to review"
            description="Saved experiences will appear here with the publication records the current API can prove."
          />
        )}
      </div>
    </>
  );
}

function releaseRecoveryEnvironmentOptions(
  environments: DashboardViewModel['environmentOptions'],
): ReleaseRecoveryEnvironmentOption[] {
  const options: ReleaseRecoveryEnvironmentOption[] = [];
  for (const environment of environments) {
    if (environment.kind !== 'staging' && environment.kind !== 'production') continue;
    options.push({
      id: environment.id,
      kind: environment.kind,
      name: environment.name,
      enabled: environment.enabled ?? true,
    });
  }
  return options;
}

function BrandSystemView({ viewModel }: { viewModel: DashboardViewModel }): React.ReactElement {
  return (
    <>
      <PageHeader view="brand-system" />
      <BrandSystemPanel
        authoringUrl={viewModel.openInProductUrl}
        sourceSummary={viewModel.brandSourceSummary}
        canApprove={viewModel.canApproveBrandSystem}
        canEdit={viewModel.canEditBrandSystem}
        themes={viewModel.brandThemes}
      />
    </>
  );
}

function EnvironmentsView({ viewModel }: { viewModel: DashboardViewModel }): React.ReactElement {
  return (
    <>
      <PageHeader view="environments" />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.8fr)]">
        <Card className="shadow-none">
          <CardHeader>
            <p className="text-xs font-semibold text-muted-foreground">Trusted origins</p>
            <CardTitle>Product environments</CardTitle>
            <CardDescription>
              Exact customer origins where Lodariq may load runtime or authoring capabilities.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {viewModel.environmentOptions.length ? (
              viewModel.environmentOptions.map((environment) =>
                environment.kind === 'production' ? (
                  <ProductionApprovalPolicy
                    canManage={viewModel.canManageSdkInstallations}
                    environment={environment}
                    environments={viewModel.environmentOptions}
                    key={environment.id}
                  />
                ) : (
                  <NonProductionEnvironmentPolicy
                    canManage={viewModel.canManageSdkInstallations}
                    environment={environment}
                    environments={viewModel.environmentOptions}
                    key={environment.id}
                  />
                ),
              )
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No product environments are configured.
              </p>
            )}
          </CardContent>
        </Card>

        <SdkSnippetPanel
          canManageSdkInstallations={viewModel.canManageSdkInstallations}
          installationRows={viewModel.installationRows}
        />
      </div>
    </>
  );
}

function NonProductionEnvironmentPolicy({
  canManage,
  environment,
  environments,
}: {
  canManage: boolean;
  environment: WorkspaceEnvironmentDto & { originLabel: string };
  environments: Array<WorkspaceEnvironmentDto & { originLabel: string }>;
}): React.ReactElement {
  const [current, setCurrent] = React.useState(environment);
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-[var(--surface-subtle)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{current.name}</p>
          <p className="truncate text-xs text-muted-foreground">{current.originLabel}</p>
        </div>
        <Badge variant="outline">{current.kind}</Badge>
      </div>
      <EnvironmentPolicyEditor
        canManage={canManage}
        environment={current}
        environments={environments}
        onUpdated={(updated) =>
          setCurrent({ ...updated, originLabel: environmentOriginLabel(updated) })
        }
      />
    </div>
  );
}

function ProductionApprovalPolicy({
  canManage,
  environment,
  environments,
}: {
  canManage: boolean;
  environment: WorkspaceEnvironmentDto & { originLabel: string };
  environments: Array<WorkspaceEnvironmentDto & { originLabel: string }>;
}): React.ReactElement {
  const [current, setCurrent] = React.useState(environment);
  const [feedback, setFeedback] = React.useState<{
    kind: 'error' | 'notice';
    message: string;
  } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const approvalRequired = current.requiredApprovalCount === 1;

  const toggleApproval = (): void => {
    if (!canManage || pending) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await updateEnvironmentReleasePolicyAction({
        environmentId: current.id,
        requiredApprovalCount: approvalRequired ? 0 : 1,
        expectedUpdatedAt: current.updatedAt,
      });
      if (result.status === 'error') {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setCurrent({ ...result.environment, originLabel: current.originLabel });
      setFeedback({ kind: 'notice', message: result.message });
    });
  };

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-[var(--surface-subtle)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{current.name}</p>
          <p className="truncate text-xs text-muted-foreground">{current.originLabel}</p>
        </div>
        <Badge variant="outline">production</Badge>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-0.5">
          <p className="text-sm font-semibold">Promotion approval</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {approvalRequired
              ? 'One explicit approval is required for the exact verified artifact.'
              : 'A releaser can promote the exact verified artifact directly.'}
          </p>
        </div>
        <Button
          className="h-10 shrink-0"
          disabled={!canManage || pending}
          onClick={toggleApproval}
          type="button"
          variant="outline"
        >
          {approvalPolicyActionLabel(pending, approvalRequired)}
        </Button>
      </div>
      {feedback ? (
        <p
          className={
            feedback.kind === 'error'
              ? 'text-xs leading-5 text-destructive'
              : 'text-xs leading-5 text-muted-foreground'
          }
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      ) : null}
      <EnvironmentPolicyEditor
        canManage={canManage}
        environment={current}
        environments={environments}
        onUpdated={(updated) =>
          setCurrent({ ...updated, originLabel: environmentOriginLabel(updated) })
        }
      />
    </div>
  );
}

function approvalPolicyActionLabel(pending: boolean, approvalRequired: boolean): string {
  if (pending) return 'Updating…';
  return approvalRequired ? 'Remove approval' : 'Require approval';
}

function environmentOriginLabel(environment: WorkspaceEnvironmentDto): string {
  return environment.originAllowlist.length
    ? environment.originAllowlist.join(', ')
    : 'No trusted origins';
}

function SupportView({ viewModel }: { viewModel: DashboardViewModel }): React.ReactElement {
  return (
    <>
      <PageHeader view="support" />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <AuthoringLaunchPanel
          authoringSiteOptions={viewModel.authoringSiteOptions}
          defaultEnvironmentId={viewModel.defaultEnvironmentId}
        />
        <DocumentDebugPanel documentRows={viewModel.documentRows} />
      </div>
    </>
  );
}

function PageHeader({
  view,
  action,
  editorial = false,
}: {
  view: DashboardViewId;
  action?: React.ReactNode;
  editorial?: boolean;
}): React.ReactElement {
  const copy = DASHBOARD_PAGE_COPY[view];
  return (
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="grid max-w-2xl gap-2">
        <h1
          data-dashboard-view-heading
          tabIndex={-1}
          className={
            editorial
              ? 'font-serif text-4xl font-medium tracking-[-0.035em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 sm:text-5xl'
              : 'text-3xl font-semibold tracking-[-0.025em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4'
          }
        >
          {copy.title}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">{copy.description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

function OpenInProductAction({ url }: { url: string }): React.ReactElement {
  if (!url) {
    return (
      <Button className="h-11" disabled type="button" variant="outline">
        Open in product
        <ExternalLink aria-hidden="true" />
      </Button>
    );
  }
  return (
    <Button asChild className="h-11" variant="outline">
      <a href={url} rel="noreferrer" target="_blank">
        Open in product
        <ExternalLink aria-hidden="true" />
      </a>
    </Button>
  );
}

function EmptyView({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}): React.ReactElement {
  return (
    <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
      <div className="grid max-w-lg justify-items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
          {icon}
        </span>
        <div className="grid gap-1">
          <p className="font-semibold">{title}</p>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function orderSelectedRelease(
  rows: DashboardViewModel['documentRows'],
  selectedDocumentId: string,
): DashboardViewModel['documentRows'] {
  if (!selectedDocumentId) return rows;
  const selected = rows.find((row) => row.id === selectedDocumentId);
  if (!selected) return rows;
  return [selected, ...rows.filter((row) => row.id !== selectedDocumentId)];
}

function dashboardViewFromHash(hash: string): DashboardViewId | null {
  const value = hash.replace(/^#/, '');
  return DASHBOARD_VIEW_IDS.includes(value as DashboardViewId) ? (value as DashboardViewId) : null;
}
