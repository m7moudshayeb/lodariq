import { proxyOwnedAuthRequest } from '../../../../../../../../lib/auth-proxy';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; requestId: string }> },
): Promise<Response> {
  const { workspaceId, requestId } = await context.params;
  return proxyOwnedAuthRequest(
    request,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/break-glass/${encodeURIComponent(requestId)}/approve`,
  );
}

