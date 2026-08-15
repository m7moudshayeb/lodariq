import { proxyOwnedAuthRequest } from '../../../../lib/auth-proxy';

export function DELETE(request: Request): Promise<Response> {
  return proxyOwnedAuthRequest(request, '/v1/auth/account');
}
