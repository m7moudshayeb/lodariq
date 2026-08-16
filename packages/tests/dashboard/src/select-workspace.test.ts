import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectWorkspace } from '../../../../apps/dashboard/src/lib/client-auth-api';

describe('selectWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts an empty JSON object so Fastify does not reject the content-type', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        user: { id: 'user_1', email: 'creator@example.test', name: 'Creator' },
        activeWorkspaceId: 'wk_product',
        workspaces: [{ id: 'wk_product', name: 'Product', role: 'owner' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await selectWorkspace('wk_934d866e7f724ea0b95a836b33ec6d73');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{}');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });
});
