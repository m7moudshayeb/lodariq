import { proxyOwnedAuthRequest } from '../../../../../../../../lib/auth-proxy';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; domainId: string }> },
): Promise<Response> {
  const { workspaceId, domainId } = await context.params;
  return proxyOwnedAuthRequest(
    request,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/domains/${encodeURIComponent(domainId)}/verify`,
  );
}

