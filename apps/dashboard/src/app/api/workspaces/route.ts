import { proxyOwnedAuthRequest } from '../../../lib/auth-proxy';

export function GET(request: Request): Promise<Response> {
  return proxyOwnedAuthRequest(request, '/v1/workspaces');
}

export function POST(request: Request): Promise<Response> {
  return proxyOwnedAuthRequest(request, '/v1/workspaces');
}
