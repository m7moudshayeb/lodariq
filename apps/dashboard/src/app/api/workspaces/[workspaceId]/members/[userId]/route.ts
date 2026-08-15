import { proxyOwnedAuthRequest } from '../../../../../../lib/auth-proxy';

interface RouteContext {
  params: Promise<{ workspaceId: string; userId: string }>;
}

function memberPath(workspaceId: string, userId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const { workspaceId, userId } = await context.params;
  return proxyOwnedAuthRequest(request, memberPath(workspaceId, userId));
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { workspaceId, userId } = await context.params;
  return proxyOwnedAuthRequest(request, memberPath(workspaceId, userId));
}
