import { describe, expect, it } from 'vitest';
import { renderPublicSdkInstallationSnippet } from '../../../../apps/api/src/snippets';

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
