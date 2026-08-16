export interface WebAuthnConfiguration {
  rpId: string;
  rpName: 'Lodariq';
  origin: string;
}

export function readWebAuthnConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): WebAuthnConfiguration | null {
  const enabled = environment.LODARIQ_WEBAUTHN_MODE?.trim() ?? 'disabled';
  if (enabled === 'disabled') return null;
  if (enabled !== 'enabled') throw new Error('LODARIQ_WEBAUTHN_MODE must be enabled or disabled');
  const rpId = environment.LODARIQ_WEBAUTHN_RP_ID?.trim() ?? '';
  const origin = environment.LODARIQ_WEBAUTHN_ORIGIN?.trim() ?? '';
  if (!isRpId(rpId)) throw new Error('LODARIQ_WEBAUTHN_RP_ID is invalid');
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('LODARIQ_WEBAUTHN_ORIGIN must be an exact origin');
  }
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' &&
      !(environment.NODE_ENV !== 'production' && isLoopback(url.hostname)))
  ) {
    throw new Error('LODARIQ_WEBAUTHN_ORIGIN must be an exact HTTPS origin');
  }
  if (rpId !== url.hostname) {
    throw new Error('LODARIQ_WEBAUTHN_RP_ID must equal the configured origin host');
  }
  return { rpId, rpName: 'Lodariq', origin };
}

function isRpId(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 253 &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(value) &&
    !value.includes('..')
  );
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
