import { proxyOwnedAuthRequest } from '../../../../../../lib/auth-proxy';

export async function PUT(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
  const { workspaceId } = await context.params;
  return proxyOwnedAuthRequest(
    request,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/auth-policy`,
  );
}

