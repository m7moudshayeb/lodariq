import { proxyOwnedAuthRequest } from '../../../../../lib/auth-proxy';

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { sessionId } = await context.params;
  return proxyOwnedAuthRequest(
    request,
    `/v1/auth/sessions/${encodeURIComponent(sessionId)}`,
  );
}
