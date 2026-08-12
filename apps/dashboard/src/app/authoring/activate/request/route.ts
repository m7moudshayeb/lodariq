import {
  approveAuthoringAuthorization,
  DashboardApiError,
  loadPendingAuthoringAuthorization,
} from '../../../../lib/api';
import { rejectUnsafeMutation } from '../../../../lib/auth-proxy';

interface ActivationProxyRequest {
  action: 'inspect' | 'approve';
  requestId: string;
  state?: string;
}

export async function POST(request: Request): Promise<Response> {
  const rejectedRequest = await rejectUnsafeMutation(request);
  if (rejectedRequest) return rejectedRequest;

  const body = await readActivationProxyRequest(request);
  if (!body) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const result =
      body.action === 'inspect'
        ? await loadPendingAuthoringAuthorization(body.requestId)
        : await approveAuthoringAuthorization(body.requestId, body.state!);
    return Response.json(result, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const status = error instanceof DashboardApiError ? error.statusCode : 503;
    return Response.json(
      { error: status === 503 ? 'activation_service_unavailable' : 'activation_request_rejected' },
      { status, headers: { 'cache-control': 'no-store' } },
    );
  }
}

async function readActivationProxyRequest(
  request: Request,
): Promise<ActivationProxyRequest | null> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const body = value as Partial<ActivationProxyRequest>;
  const allowedKeys =
    body.action === 'approve' ? ['action', 'requestId', 'state'] : ['action', 'requestId'];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return null;
  if (
    (body.action !== 'inspect' && body.action !== 'approve') ||
    typeof body.requestId !== 'string' ||
    body.requestId.length < 1 ||
    body.requestId.length > 256
  ) {
    return null;
  }
  if (
    body.action === 'approve' &&
    (typeof body.state !== 'string' || body.state.length < 32 || body.state.length > 2_048)
  ) {
    return null;
  }
  return body as ActivationProxyRequest;
}
