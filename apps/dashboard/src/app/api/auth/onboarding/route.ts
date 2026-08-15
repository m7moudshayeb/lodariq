import { proxyOwnedAuthRequest } from '../../../../lib/auth-proxy';

export async function GET(request: Request): Promise<Response> {
  return proxyOwnedAuthRequest(request, '/v1/auth/onboarding');
}
