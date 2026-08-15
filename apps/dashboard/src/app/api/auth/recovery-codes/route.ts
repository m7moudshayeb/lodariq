import { proxyOwnedAuthRequest } from '../../../../lib/auth-proxy';

export function GET(request: Request): Promise<Response> {
  return proxyOwnedAuthRequest(request, '/v1/auth/recovery-codes');
}

export function POST(request: Request): Promise<Response> {
  return proxyOwnedAuthRequest(request, '/v1/auth/recovery-codes');
}

export function DELETE(request: Request): Promise<Response> {
  return proxyOwnedAuthRequest(request, '/v1/auth/recovery-codes');
}
