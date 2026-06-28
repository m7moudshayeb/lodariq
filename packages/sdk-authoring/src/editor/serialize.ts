import type { TalmehBlock, TalmehDocument } from '@talmeh/schema';

/**
 * Serialization boundary between Lexical editor state and canonical Talmeh
 * block JSON (PRD §7.2 required capabilities).
 *
 * Phase -1 ships the type-safe boundary + a versioned migration hook; the full
 * Lexical-state <-> block-tree mapping lands in the Pre-phase editor work
 * (PRD §16.1). Stable block IDs are owned by ./ids and round-trip losslessly.
 */

export interface SerializedEditorState {
  blocks: TalmehBlock[];
}

/** Lexical state -> canonical block JSON (PRD §7.2). */
export function toBlockJson(state: SerializedEditorState): TalmehBlock[] {
  return state.blocks;
}

/** Canonical block JSON -> Lexical-ready state (PRD §7.2). */
export function fromBlockJson(blocks: TalmehBlock[]): SerializedEditorState {
  return { blocks };
}

/**
 * Versioned migration entry point for older block JSON (PRD §7.2, §16.1).
 * Each step upgrades one schemaVersion to the next; register migrations here.
 */
export type Migration = (doc: TalmehDocument) => TalmehDocument;

const MIGRATIONS: Record<string, Migration> = {
  // '0.9.0': (doc) => ({ ...doc, schemaVersion: '1.0.0' }),
};

export function migrate(doc: TalmehDocument): TalmehDocument {
  let current = doc;
  let migration = MIGRATIONS[current.schemaVersion];
  while (migration) {
    current = migration(current);
    migration = MIGRATIONS[current.schemaVersion];
  }
  return current;
}
