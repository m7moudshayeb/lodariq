'use client';

import * as React from 'react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import type { DashboardViewId } from '../lib/dashboard-constants';
import { DashboardAuthControls } from './dashboard-auth-controls';
import { DesktopWorkspaceNavigation, MobileWorkspaceHeader } from './dashboard-navigation';

export function DashboardAppShell({
  activeView,
  authControls,
  children,
  compactAuthControls,
  onSelect,
}: {
  activeView?: DashboardViewId;
  authControls?: ReactNode;
  children: ReactNode;
  compactAuthControls?: ReactNode;
  onSelect: (view: DashboardViewId) => void;
}): ReactElement {
  const [desktopNavigationExpanded, setDesktopNavigationExpanded] = useState(false);
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
        onSelect={onSelect}
      />
      <div className="min-w-0 md:col-start-2">
        <MobileWorkspaceHeader
          activeView={activeView}
          authControls={authControls}
          onSelect={onSelect}
        />
        <main
          className="mx-auto min-h-screen w-full px-4 py-6 sm:px-6 md:px-8 md:py-16 lg:px-10"
          id="dashboard-active-view"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function AccountWorkspaceShell({
  children,
  session,
}: {
  children: ReactNode;
  session: AuthSessionSnapshot;
}): ReactElement {
  const router = useRouter();
  return (
    <DashboardAppShell
      authControls={<DashboardAuthControls session={session} />}
      compactAuthControls={<DashboardAuthControls compact session={session} />}
      onSelect={(view) => router.push(`/#${view}`)}
    >
      {children}
    </DashboardAppShell>
  );
}
