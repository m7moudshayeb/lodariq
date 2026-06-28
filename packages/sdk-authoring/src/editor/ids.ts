/**
 * Stable Talmeh block IDs (PRD §7.2, §20).
 *
 * These IDs must survive editing, drag/drop, copy/paste, and migrations.
 * Lexical node keys are EPHEMERAL and must NEVER be used as persistent block
 * IDs — this module is the single source of block IDs for the editor.
 */
export function createBlockId(): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `block_${uuid}`;
}

export function createTargetId(): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `target_${uuid}`;
}
