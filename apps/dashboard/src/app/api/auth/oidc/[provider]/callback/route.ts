import { proxyOidcCallback } from '../../../../../../lib/auth-proxy';

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await context.params;
  return proxyOidcCallback(request, provider);
}
