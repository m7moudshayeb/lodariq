import { describe, expect, it } from 'vitest';
import {
  renderPublicSdkCspGuidance,
  renderPublicSdkInstallationSnippet,
} from '../../../../apps/api/src/snippets';

describe('public SDK installation snippet', () => {
  it('uses the permanent public bootstrap entry by default', () => {
    const snippet = renderPublicSdkInstallationSnippet({
      installationId: 'ins_pub_application_1234',
    });

    expect(snippet).toContain('src="https://cdn.lodariq.io/sdk/lodariq-public-bootstrap.js"');
    expect(snippet).not.toContain('data-lodariq-environment');
  });

  it('contains only the revocable public installation identity', () => {
    const snippet = renderPublicSdkInstallationSnippet({
      installationId: 'ins_pub_workspace',
      loaderSrc: 'https://cdn.lodariq.io/loader/v1/lodariq-loader.js',
    });

    expect(snippet).toContain('data-installation="ins_pub_workspace"');
    expect(snippet).toContain('src="https://cdn.lodariq.io/loader/v1/lodariq-loader.js"');
    expect(snippet).not.toContain('data-lodariq-environment');
    expect(snippet).not.toContain('data-lodariq-token');
    expect(snippet).not.toContain('data-lodariq-authoring-session');
    expect(snippet).not.toContain('lodariq-creator.js');
  });

  it('escapes public configuration before writing HTML attributes', () => {
    const snippet = renderPublicSdkInstallationSnippet({
      installationId: 'ins_pub_" onload="alert(1)',
    });

    expect(snippet).toContain('ins_pub_&quot; onload=&quot;alert(1)');
    expect(snippet).not.toContain('ins_pub_" onload="alert(1)');
  });
});

describe('install snippet performance and security hints', () => {
  it('preconnects to both origins the loader will immediately use', () => {
    const snippet = renderPublicSdkInstallationSnippet({
      installationId: 'ins_pub_application_1234',
    });

    // The loader is fetched from the CDN and then talks to the API; without
    // these the eligibility check pays a cold DNS + TLS handshake.
    expect(snippet).toContain('<link rel="preconnect" href="https://cdn.lodariq.io" crossorigin>');
    expect(snippet).toContain('<link rel="preconnect" href="https://api.lodariq.io" crossorigin>');
  });

  it('omits integrity unless the deployment pins a digest', () => {
    const snippet = renderPublicSdkInstallationSnippet({
      installationId: 'ins_pub_application_1234',
    });

    expect(snippet).not.toContain('integrity=');
  });

  it('pins integrity when given a supported digest, and refuses anything else', () => {
    const pinned = renderPublicSdkInstallationSnippet({
      installationId: 'ins_pub_application_1234',
      loaderIntegrity: 'sha384-abc123+/def456==',
    });
    expect(pinned).toContain('integrity="sha384-abc123+/def456=="');

    const rejected = renderPublicSdkInstallationSnippet({
      installationId: 'ins_pub_application_1234',
      loaderIntegrity: 'md5-nope" onload="alert(1)',
    });
    expect(rejected).not.toContain('integrity=');
  });

  it('states the CSP directives an installation needs and nothing looser', () => {
    const csp = renderPublicSdkCspGuidance();

    expect(csp).toContain('script-src https://cdn.lodariq.io;');
    expect(csp).toContain('connect-src https://api.lodariq.io https://cdn.lodariq.io;');
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });
});
