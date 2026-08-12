/** Read the host page's CSP nonce without depending on broader DOM helpers. */
export function cspNonceOf(doc: Document): string | undefined {
  const meta = doc.querySelector<HTMLMetaElement>(
    'meta[property="csp-nonce"], meta[name="csp-nonce"]',
  );
  const raw =
    meta?.nonce ||
    meta?.getAttribute('nonce') ||
    meta?.content ||
    meta?.getAttribute('content') ||
    doc.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ||
    doc.querySelector<HTMLScriptElement>('script[nonce]')?.getAttribute('nonce');
  const nonce = raw?.trim();
  return nonce || undefined;
}

/** Create an inline style element that honors the host page's CSP nonce. */
export function createNonceStyleElement(doc: Document, cssText: string): HTMLStyleElement {
  const style = doc.createElement('style');
  const nonce = cspNonceOf(doc);
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = cssText;
  return style;
}
