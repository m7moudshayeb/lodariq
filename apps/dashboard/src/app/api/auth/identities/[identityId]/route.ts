import { proxyOwnedAuthRequest } from '../../../../../lib/auth-proxy';

interface RouteContext {
  params: Promise<{ identityId: string }>;
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { identityId } = await context.params;
  return proxyOwnedAuthRequest(
    request,
    `/v1/auth/identities/${encodeURIComponent(identityId)}`,
  );
}
