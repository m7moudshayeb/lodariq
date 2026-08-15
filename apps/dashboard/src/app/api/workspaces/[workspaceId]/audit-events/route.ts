import { proxyOwnedAuthRequest } from '../../../../../lib/auth-proxy';

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { workspaceId } = await context.params;
  return proxyOwnedAuthRequest(
    request,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/audit-events`,
  );
}
