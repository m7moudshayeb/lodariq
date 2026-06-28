// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { defaultManifestUrl, readConfigFromScript } from '@talmeh/sdk-runtime/loader';

describe('loader config (PRD §6.2, §9.2)', () => {
  it('derives the default CDN manifest URL from workspace and environment', () => {
    const script = document.createElement('script');
    script.dataset['workspace'] = 'wk_live_xxx';
    script.dataset['env'] = 'production';

    expect(readConfigFromScript(script)).toEqual({
      workspaceId: 'wk_live_xxx',
      environment: 'production',
      manifestUrl: 'https://cdn.talmeh.io/workspaces/wk_live_xxx/production/manifest.json',
    });
  });

  it('keeps explicit local fixture manifest URLs', () => {
    const script = document.createElement('script');
    script.dataset['workspace'] = 'wk_local_dev';
    script.dataset['env'] = 'development';
    script.dataset['manifest'] = '/fixtures/manifest.json';

    expect(readConfigFromScript(script)?.manifestUrl).toBe('/fixtures/manifest.json');
  });

  it('rejects unknown environments instead of deriving bad manifest URLs', () => {
    const script = document.createElement('script');
    script.dataset['workspace'] = 'wk_live_xxx';
    script.dataset['env'] = 'prod';

    expect(readConfigFromScript(script)).toBeNull();
  });

  it('encodes workspace IDs in derived URLs', () => {
    expect(defaultManifestUrl('wk live/xxx', 'staging')).toBe(
      'https://cdn.talmeh.io/workspaces/wk%20live%2Fxxx/staging/manifest.json',
    );
  });
});
