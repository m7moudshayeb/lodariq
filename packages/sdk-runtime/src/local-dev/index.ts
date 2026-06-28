import { compileDocument } from '@talmeh/compiler';
import {
  TalmehDocument,
  validate,
  type CompiledDocument,
  type TalmehDocument as TalmehDocumentType,
} from '@talmeh/schema';

/**
 * Local development helpers (PRD §9.1, §16.1).
 *
 * Provides local persistence, fixture import/export, and BROWSER-SIDE preview
 * compilation. Browser compilation is preview-only — real publications are
 * always compiled server-side and content-addressed (PRD §9.1, §20).
 */
const STORAGE_PREFIX = 'talmeh:doc:';

export function saveDocument(doc: TalmehDocumentType): void {
  localStorage.setItem(`${STORAGE_PREFIX}${doc.id}`, JSON.stringify(doc));
}

export function loadDocument(id: string): TalmehDocumentType | null {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
  return raw ? (JSON.parse(raw) as TalmehDocumentType) : null;
}

export function exportDocument(doc: TalmehDocumentType): string {
  return JSON.stringify(doc, null, 2);
}

export function importDocument(json: string): TalmehDocumentType {
  const parsed = JSON.parse(json) as unknown;
  const result = validate(TalmehDocument, parsed);
  if (!result.valid) {
    throw new Error(`Invalid Talmeh document import: ${result.errors[0]?.message}`);
  }
  return result.value;
}

/** Preview-only compile for the local playground (PRD §20). */
export async function compilePreview(doc: TalmehDocumentType): Promise<CompiledDocument> {
  return compileDocument(doc);
}

export function resetLocalDocuments(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
  }
}
