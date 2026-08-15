import { proxyOwnedAuthRequest } from '../../../../../lib/auth-proxy';

export async function POST(request: Request): Promise<Response> {
  return proxyOwnedAuthRequest(request, '/v1/auth/sso/discover');
}

