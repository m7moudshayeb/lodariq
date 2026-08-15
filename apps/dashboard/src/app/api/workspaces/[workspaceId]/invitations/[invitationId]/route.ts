import { proxyOwnedAuthRequest } from '../../../../../../lib/auth-proxy';

interface RouteContext {
  params: Promise<{ workspaceId: string; invitationId: string }>;
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { workspaceId, invitationId } = await context.params;
  return proxyOwnedAuthRequest(
    request,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations/${encodeURIComponent(invitationId)}`,
  );
}
