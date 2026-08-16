'use client';

import * as React from 'react';
import { DASHBOARD_VIEW_IDS, type DashboardViewId } from '../lib/dashboard-constants';
import type { DashboardViewModel } from '../lib/view-model';
import { DesktopWorkspaceNavigation, MobileWorkspaceHeader } from './dashboard-navigation';
import { AnalyticsView, ExperiencesView, OverviewView } from './dashboard-primary-views';
import { ReleasesView } from './dashboard-release-view';
import { BrandSystemView, EnvironmentsView, SupportView } from './dashboard-settings-views';
import { StatusBanner } from './ui/status-banner';
import { WorkspaceMembersView } from './workspace-members-view';

interface DashboardWorkspaceProps {
  viewModel: DashboardViewModel;
  workspaceId: string;
  apiError?: string;
  authControls?: React.ReactNode;
  compactAuthControls?: React.ReactNode;
}

export function DashboardWorkspace({
  viewModel,
  workspaceId,
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

  const openReleaseDetails = (documentId: string): void => {
    setReleaseDocumentId(documentId);
    selectView('releases');
  };

  return (
    <div
      className={`min-h-screen bg-background text-foreground transition-[grid-template-columns] duration-200 motion-reduce:transition-none md:grid ${
        desktopNavigationExpanded
          ? 'md:grid-cols-[208px_minmax(0,1fr)]'
          : 'md:grid-cols-[72px_minmax(0,1fr)]'
      }`}
    >
      <DesktopWorkspaceNavigation
        activeView={activeView}
        authControls={authControls}
        compactAuthControls={compactAuthControls}
        expanded={desktopNavigationExpanded}
        onExpandedChange={setDesktopNavigationExpanded}
        onSelect={selectView}
      />

      <div className="min-w-0 md:col-start-2">
        <MobileWorkspaceHeader
          activeView={activeView}
          authControls={authControls}
          onSelect={selectView}
        />
        <main
          className="mx-auto min-h-screen w-full px-4 py-6 sm:px-6 md:px-8 md:py-16 lg:px-10"
          id="dashboard-active-view"
        >
          {apiError ? <DashboardError message={apiError} /> : null}
          <ActiveDashboardView
            activeView={activeView}
            releaseDocumentId={releaseDocumentId}
            viewModel={viewModel}
            workspaceId={workspaceId}
            onReviewRelease={openReleaseDetails}
            onSelectView={selectView}
          />
        </main>
      </div>
    </div>
  );
}

function ActiveDashboardView({
  activeView,
  releaseDocumentId,
  viewModel,
  workspaceId,
  onReviewRelease,
  onSelectView,
}: {
  activeView: DashboardViewId;
  releaseDocumentId: string;
  viewModel: DashboardViewModel;
  workspaceId: string;
  onReviewRelease: (documentId: string) => void;
  onSelectView: (view: DashboardViewId) => void;
}): React.ReactElement | null {
  if (activeView === 'overview') {
    return (
      <OverviewView
        viewModel={viewModel}
        onReviewRelease={onReviewRelease}
        onViewAll={() => onSelectView('experiences')}
      />
    );
  }
  if (activeView === 'experiences') return <ExperiencesView viewModel={viewModel} />;
  if (activeView === 'releases') {
    return (
      <ReleasesView
        selectedDocumentId={releaseDocumentId}
        viewModel={viewModel}
        workspaceId={workspaceId}
      />
    );
  }
  if (activeView === 'analytics') {
    return <AnalyticsView viewModel={viewModel} workspaceId={workspaceId} />;
  }
  if (activeView === 'brand-system') {
    return <BrandSystemView viewModel={viewModel} workspaceId={workspaceId} />;
  }
  if (activeView === 'environments') {
    return <EnvironmentsView viewModel={viewModel} workspaceId={workspaceId} />;
  }
  if (activeView === 'members') {
    return (
      <WorkspaceMembersView
        currentRole={viewModel.currentRole}
        currentUserId={viewModel.currentUserId}
        workspaceId={workspaceId}
      />
    );
  }
  if (activeView === 'support') {
    return <SupportView viewModel={viewModel} workspaceId={workspaceId} />;
  }
  return null;
}

function DashboardError({ message }: { message: string }): React.ReactElement {
  return <StatusBanner className="mb-6" kind="error" title={message} />;
}

function dashboardViewFromHash(hash: string): DashboardViewId | null {
  const value = hash.replace(/^#/, '');
  return DASHBOARD_VIEW_IDS.includes(value as DashboardViewId) ? (value as DashboardViewId) : null;
}
