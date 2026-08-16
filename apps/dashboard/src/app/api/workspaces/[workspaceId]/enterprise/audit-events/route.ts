import { proxyOwnedAuthRequest } from '../../../../../../lib/auth-proxy';

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
  const { workspaceId } = await context.params;
  return proxyOwnedAuthRequest(
    request,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/audit-events`,
  );
}

