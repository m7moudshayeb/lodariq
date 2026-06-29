import type { LodariqBlock } from '@lodariq/schema';
import { createBlockId } from './ids';

export interface ClipboardLike {
  getData: (type: string) => string;
}

export function blocksFromSafePasteData(data: ClipboardLike): LodariqBlock[] {
  const text = safeClipboardText(data);
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((content) => ({
      id: createBlockId(),
      type: 'paragraph',
      content,
      props: {},
      status: 'ready',
      children: [],
    }));
}

function safeClipboardText(data: ClipboardLike): string {
  const plain = data.getData('text/plain').trim();
  if (plain) return plain;
  const html = data.getData('text/html');
  if (!html || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('script,style,template').forEach((node) => node.remove());
  return doc.body.textContent?.trim() ?? '';
}
