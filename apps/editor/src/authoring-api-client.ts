import { AUTHORING_ACTIVATION_GRANT_HEADER, AUTHORING_SESSION_HEADER } from '@lodariq/schema';

const AUTHORING_REQUEST_TIMEOUT_MS = 15_000;

interface AuthoringRequestOptions extends Omit<RequestInit, 'credentials' | 'mode' | 'redirect'> {
  activationGrant?: string;
  useSession?: boolean;
}

export class HostedAuthoringApiClient {
  private readonly apiOrigin: string;
  private readonly activeRequests = new Set<AbortController>();
  private sessionToken: string | null = null;

  constructor(apiOrigin: string) {
    this.apiOrigin = requireHttpOrigin(apiOrigin);
  }

  matchesOrigin(apiOrigin: string): boolean {
    return this.apiOrigin === requireHttpOrigin(apiOrigin);
  }

  setSessionToken(token: string): void {
    if (!token) throw new Error('Authoring session token is required');
    this.sessionToken = token;
  }

  clearSession(): void {
    this.sessionToken = null;
  }

  async request(path: string | URL, options: AuthoringRequestOptions = {}): Promise<Response> {
    const url = this.resolveUrl(path);
    const headers = new Headers(options.headers);
    headers.set('accept', 'application/json');
    if (options.activationGrant) {
      headers.set(AUTHORING_ACTIVATION_GRANT_HEADER, options.activationGrant);
    }
    if (options.useSession) {
      if (!this.sessionToken) throw new Error('Authoring session is unavailable');
      headers.set(AUTHORING_SESSION_HEADER, this.sessionToken);
    }
    const { activationGrant: _activationGrant, useSession: _useSession, ...init } = options;
    const controller = new AbortController();
    const timeout = options.keepalive
      ? undefined
      : window.setTimeout(
          () => controller.abort('authoring_request_timeout'),
          AUTHORING_REQUEST_TIMEOUT_MS,
        );
    const signal = combineAbortSignals(options.signal, controller.signal);
    if (!options.keepalive) this.activeRequests.add(controller);
    try {
      return await fetch(url, {
        ...init,
        headers: Object.fromEntries(headers.entries()),
        signal,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
      this.activeRequests.delete(controller);
    }
  }

  dispose(): void {
    for (const controller of this.activeRequests) controller.abort('authoring_session_closed');
    this.activeRequests.clear();
    this.sessionToken = null;
  }

  private resolveUrl(path: string | URL): URL {
    const url = path instanceof URL ? new URL(path) : new URL(path, this.apiOrigin);
    if (url.origin !== this.apiOrigin || url.username || url.password) {
      throw new Error('Authoring API target is outside the trusted origin');
    }
    return url;
  }
}

function combineAbortSignals(
  externalSignal: AbortSignal | null | undefined,
  internalSignal: AbortSignal,
): AbortSignal {
  if (!externalSignal) return internalSignal;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([externalSignal, internalSignal]);
  }
  const controller = new AbortController();
  const abort = (signal: AbortSignal): void => controller.abort(signal.reason);
  if (externalSignal.aborted) abort(externalSignal);
  if (internalSignal.aborted) abort(internalSignal);
  externalSignal.addEventListener('abort', () => abort(externalSignal), { once: true });
  internalSignal.addEventListener('abort', () => abort(internalSignal), { once: true });
  return controller.signal;
}

function requireHttpOrigin(value: string): string {
  const url = new URL(value);
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '' && url.pathname !== '/')
  ) {
    throw new Error('Authoring API origin is invalid');
  }
  return url.origin;
}
