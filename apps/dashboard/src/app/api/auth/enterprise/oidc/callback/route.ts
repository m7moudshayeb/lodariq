import { proxyEnterpriseOidcCallback } from '../../../../../../lib/auth-proxy';

export async function GET(request: Request): Promise<Response> {
  return proxyEnterpriseOidcCallback(request);
}

