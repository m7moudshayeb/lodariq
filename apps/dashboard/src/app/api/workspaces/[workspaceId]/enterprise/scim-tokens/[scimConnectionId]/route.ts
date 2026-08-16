import { proxyOwnedAuthRequest } from '../../../../../../../lib/auth-proxy';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ workspaceId: string; scimConnectionId: string }> },
): Promise<Response> {
  const { workspaceId, scimConnectionId } = await context.params;
  return proxyOwnedAuthRequest(
    request,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/scim-tokens/${encodeURIComponent(scimConnectionId)}`,
  );
}
