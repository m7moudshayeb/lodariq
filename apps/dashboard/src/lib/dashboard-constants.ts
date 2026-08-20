import type { MessageDescriptor } from '@lingui/core';
import { DASHBOARD_NAVIGATION_MESSAGES, DASHBOARD_PAGE_MESSAGES } from '../i18n/messages';

export const DASHBOARD_VIEW_IDS = [
  'overview',
  'experiences',
  'releases',
  'analytics',
  'brand-system',
  'environments',
  'applications',
  'members',
  'support',
] as const;

export const DASHBOARD_ANALYTICS_AGGREGATE_LIMIT = 1_000;

export type DashboardViewId = (typeof DASHBOARD_VIEW_IDS)[number];

export interface DashboardNavigationItem {
  id: DashboardViewId;
  label: MessageDescriptor;
  icon:
    | 'overview'
    | 'experiences'
    | 'releases'
    | 'analytics'
    | 'brand'
    | 'environments'
    | 'applications'
    | 'members'
    | 'support';
}

export const DASHBOARD_PRIMARY_NAVIGATION = [
  { id: 'overview', label: DASHBOARD_NAVIGATION_MESSAGES.overview, icon: 'overview' },
  { id: 'experiences', label: DASHBOARD_NAVIGATION_MESSAGES.experiences, icon: 'experiences' },
  { id: 'releases', label: DASHBOARD_NAVIGATION_MESSAGES.releases, icon: 'releases' },
  { id: 'analytics', label: DASHBOARD_NAVIGATION_MESSAGES.analytics, icon: 'analytics' },
  { id: 'brand-system', label: DASHBOARD_NAVIGATION_MESSAGES.brandSystem, icon: 'brand' },
  { id: 'environments', label: DASHBOARD_NAVIGATION_MESSAGES.environments, icon: 'environments' },
  { id: 'applications', label: DASHBOARD_NAVIGATION_MESSAGES.applications, icon: 'applications' },
  { id: 'members', label: DASHBOARD_NAVIGATION_MESSAGES.members, icon: 'members' },
] as const satisfies readonly DashboardNavigationItem[];

export const DASHBOARD_SUPPORT_NAVIGATION = {
  id: 'support',
  label: DASHBOARD_NAVIGATION_MESSAGES.support,
  icon: 'support',
} as const satisfies DashboardNavigationItem;

export const RELEASE_STAGE_LABELS = {
  draft: 'Draft',
  staging: 'Staging',
  production: 'Production',
} as const;

export const RELEASE_QUEUE_ACTION_LABEL = 'Review release';

export const DASHBOARD_PAGE_COPY = {
  overview: {
    title: DASHBOARD_PAGE_MESSAGES.overviewTitle,
    description: DASHBOARD_PAGE_MESSAGES.overviewDescription,
  },
  experiences: {
    title: DASHBOARD_PAGE_MESSAGES.experiencesTitle,
    description: DASHBOARD_PAGE_MESSAGES.experiencesDescription,
  },
  releases: {
    title: DASHBOARD_PAGE_MESSAGES.releasesTitle,
    description: DASHBOARD_PAGE_MESSAGES.releasesDescription,
  },
  analytics: {
    title: DASHBOARD_PAGE_MESSAGES.analyticsTitle,
    description: DASHBOARD_PAGE_MESSAGES.analyticsDescription,
  },
  'brand-system': {
    title: DASHBOARD_PAGE_MESSAGES.brandSystemTitle,
    description: DASHBOARD_PAGE_MESSAGES.brandSystemDescription,
  },
  environments: {
    title: DASHBOARD_PAGE_MESSAGES.environmentsTitle,
    description: DASHBOARD_PAGE_MESSAGES.environmentsDescription,
  },
  applications: {
    title: DASHBOARD_PAGE_MESSAGES.applicationsTitle,
    description: DASHBOARD_PAGE_MESSAGES.applicationsDescription,
  },
  members: {
    title: DASHBOARD_PAGE_MESSAGES.membersTitle,
    description: DASHBOARD_PAGE_MESSAGES.membersDescription,
  },
  support: {
    title: DASHBOARD_PAGE_MESSAGES.supportTitle,
    description: DASHBOARD_PAGE_MESSAGES.supportDescription,
  },
} as const satisfies Record<
  DashboardViewId,
  { title: MessageDescriptor; description: MessageDescriptor }
>;
