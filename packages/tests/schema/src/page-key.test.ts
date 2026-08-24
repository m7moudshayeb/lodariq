import { describe, expect, it } from 'vitest';
import { isPageKey, pageKeyFrom, pageKeyMatches } from '@lodariq/schema/page-key';

describe('page key', () => {
  it('keeps the path and drops the query', () => {
    expect(pageKeyFrom('/projects/all', '')).toBe('/projects/all');
    expect(pageKeyFrom('/projects/all/', '')).toBe('/projects/all');
    expect(pageKeyFrom('/', '')).toBe('/');
  });

  it('reads a hash route but not an in-page anchor', () => {
    expect(pageKeyFrom('/', '#/projects/all')).toBe('/#/projects/all');
    expect(pageKeyFrom('/app', '#/billing')).toBe('/app#/billing');
    // `#pricing` is a jump inside the page the visitor is already on.
    expect(pageKeyFrom('/pricing', '#plans')).toBe('/pricing');
  });

  it('ignores everything a visitor changes without leaving the page', () => {
    // Sort order, an open dialog and a session id all live past the `?`.
    expect(pageKeyFrom('/projects', '#/projects/all?sort=name')).toBe('/projects#/projects/all');
    expect(pageKeyFrom('/projects', '#/projects/all?pop=import&q=atlas')).toBe(
      '/projects#/projects/all',
    );
  });

  it('rejects a key it could not have produced', () => {
    expect(isPageKey('/projects')).toBe(true);
    expect(isPageKey('/projects#/all')).toBe(true);
    expect(isPageKey('/projects?sort=name')).toBe(false);
    expect(isPageKey('projects')).toBe(false);
    expect(isPageKey('')).toBe(false);
    expect(isPageKey(`/${'x'.repeat(600)}`)).toBe(false);
  });

  it('matches exactly by default', () => {
    expect(pageKeyMatches('/projects', undefined, '/projects')).toBe(true);
    expect(pageKeyMatches('/projects', 'exact', '/projects/123')).toBe(false);
    expect(pageKeyMatches('/projects', 'exact', '/billing')).toBe(false);
  });

  it('stops a prefix at a segment boundary', () => {
    expect(pageKeyMatches('/projects', 'prefix', '/projects/123')).toBe(true);
    expect(pageKeyMatches('/projects', 'prefix', '/projects#/detail')).toBe(true);
    // The half-word case a bare startsWith gets wrong.
    expect(pageKeyMatches('/projects', 'prefix', '/projects-archive')).toBe(false);
    expect(pageKeyMatches('/', 'prefix', '/anything')).toBe(true);
  });
});
