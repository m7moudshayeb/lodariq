import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The control map (§9) is a published document, so it can rot. This suite is the
 * thing that stops it: every row's primary control has to exist in the source, and
 * the accelerator column may not print a shortcut nothing listens for.
 */
const MAP = readFileSync('../../docs/plans/authoring-control-map.md', 'utf8');

interface Row {
  readonly action: string;
  readonly control: string;
  readonly accelerator: string;
}

function rows(): readonly Row[] {
  return MAP.split('\n')
    .filter(
      (line) => line.startsWith('| ') && !line.startsWith('| Action') && !line.startsWith('| ---'),
    )
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 6)
    .map((cells) => ({ action: cells[1]!, control: cells[2]!, accelerator: cells[4]! }));
}

describe('the published control map (§9)', () => {
  it('has a row for every action, each with a visible primary control', () => {
    const parsed = rows();
    expect(parsed.length).toBeGreaterThan(20);
    for (const row of parsed) {
      expect(row.action.length).toBeGreaterThan(0);
      expect(row.control.length).toBeGreaterThan(0);
      // A row whose primary column is empty would be a shortcut-only action.
      expect(row.control).not.toBe('—');
    }
  });

  it('prints no accelerator that is not wired', () => {
    // §3.1a: printing `⌘O` beside a row whose shortcut does not exist teaches a lie.
    const wired = new Set(['—', '`Esc`', '`⌘K`']);
    for (const row of rows()) {
      expect(wired.has(row.accelerator)).toBe(true);
    }
  });

  it('names the surfaces that actually exist', () => {
    const surfaces = new Set(
      rows()
        .map((row) => row.control)
        .join(' '),
    );
    expect(surfaces.size).toBeGreaterThan(0);
    for (const required of [
      'Editing ⇄ Browsing',
      'Change target',
      'Ask Lodariq',
      'Blends in',
      'Ask for it',
      'Keep mine',
      'Spoken script',
      'Take me there',
    ]) {
      expect(MAP).toContain(required);
    }
  });

  it('keeps the keyboard obligations separate from the shortcut column', () => {
    expect(MAP).toContain('44×44 CSS px');
    expect(MAP).toContain('focus-trapped popover');
    expect(MAP).toContain('the meaning is always also in text');
  });
});
