export const PUBLIC_DEMO_PAGE_ROUTE = '/d/:demoId' as const;
export const PUBLIC_DEMO_API_PATH_PREFIX = '/v1/demos' as const;
export const PUBLIC_DEMO_API_ROUTE = `${PUBLIC_DEMO_API_PATH_PREFIX}/:demoId` as const;
export const PUBLIC_DEMO_ARTIFACT_ROUTE = `${PUBLIC_DEMO_API_ROUTE}/artifact` as const;
export const PUBLIC_DEMO_EVENTS_ROUTE = `${PUBLIC_DEMO_API_ROUTE}/events` as const;

const PUBLIC_DEMO_PAGE_PATH_PATTERN = /^\/d\/(demo_[A-Za-z0-9_-]{20,})\/?$/u;

export type PublicDemoApiResource = 'artifact' | 'events';

/** Resolve a versioned API URI from the unversioned public HTML navigation path. */
export function publicDemoApiPath(publicPagePath: string, resource: PublicDemoApiResource): string {
  const match = PUBLIC_DEMO_PAGE_PATH_PATTERN.exec(publicPagePath);
  if (!match?.[1]) throw new Error('The public demo page URI is invalid.');
  return `${PUBLIC_DEMO_API_PATH_PREFIX}/${encodeURIComponent(match[1])}/${resource}`;
}
