import { proxyOwnedAuthRequest } from '../../../../../../lib/auth-proxy';

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await context.params;
  if (provider !== 'google' && provider !== 'microsoft') {
    return Response.json(
      { error: 'provider_unavailable', message: 'Identity provider is unavailable' },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }
  return proxyOwnedAuthRequest(request, `/v1/auth/oidc/${provider}/begin`);
}
