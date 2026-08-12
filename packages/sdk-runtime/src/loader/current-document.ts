import type { CompiledDocument } from '@lodariq/schema';

/** Current-document transport is fetched only when playback actually needs it. */
export async function fetchCompiledDocument(
  url: string,
  clientToken?: string,
): Promise<CompiledDocument> {
  if (!url.trim()) throw new Error('Lodariq current document URL is required');
  const headers: Record<string, string> = {};
  if (clientToken) headers['authorization'] = `Bearer ${clientToken}`;
  const response = await fetch(url, { credentials: 'omit', headers });
  if (!response.ok) throw new Error(`Lodariq current document fetch failed: ${response.status}`);
  return (await response.json()) as CompiledDocument;
}
