import { proxyOwnedAuthRequest } from '../../../../lib/auth-proxy';

export function POST(request: Request): Promise<Response> {
  return proxyOwnedAuthRequest(request, '/v1/auth/change-password');
}
