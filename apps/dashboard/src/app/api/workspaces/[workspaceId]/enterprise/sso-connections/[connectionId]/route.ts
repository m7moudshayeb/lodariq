import { proxyOwnedAuthRequest } from '../../../../../../../lib/auth-proxy';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ workspaceId: string; connectionId: string }> },
): Promise<Response> {
  const { workspaceId, connectionId } = await context.params;
  return proxyOwnedAuthRequest(
    request,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/sso-connections/${encodeURIComponent(connectionId)}`,
  );
}
