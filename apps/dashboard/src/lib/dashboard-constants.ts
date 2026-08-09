export const DASHBOARD_VIEW_IDS = [
  'overview',
  'experiences',
  'releases',
  'brand-system',
  'environments',
  'support',
] as const;

export type DashboardViewId = (typeof DASHBOARD_VIEW_IDS)[number];

export interface DashboardNavigationItem {
  id: DashboardViewId;
  label: string;
  icon: 'overview' | 'experiences' | 'releases' | 'brand' | 'environments' | 'support';
}

export const DASHBOARD_PRIMARY_NAVIGATION = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'experiences', label: 'Experiences', icon: 'experiences' },
  { id: 'releases', label: 'Releases', icon: 'releases' },
  { id: 'brand-system', label: 'Brand system', icon: 'brand' },
  { id: 'environments', label: 'Environments', icon: 'environments' },
] as const satisfies readonly DashboardNavigationItem[];

export const DASHBOARD_SUPPORT_NAVIGATION = {
  id: 'support',
  label: 'Help & support',
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
    title: 'Launch queue',
    description: 'Follow the progress of experiences from draft to production.',
  },
  experiences: {
    title: 'Experiences',
    description: 'Find every saved experience and inspect its current publishing state.',
  },
  releases: {
    title: 'Release details',
    description: 'Review the environment state Lodariq can currently prove for each experience.',
  },
  'brand-system': {
    title: 'Brand system',
    description: 'Shape the customer experience with safe tokens, then approve each version.',
  },
  environments: {
    title: 'Environments',
    description: 'Manage trusted product origins and each environment runtime installation.',
  },
  support: {
    title: 'Help & support',
    description: 'Use fallback authoring and diagnostic tools only when the in-product path fails.',
  },
} as const satisfies Record<DashboardViewId, { title: string; description: string }>;
