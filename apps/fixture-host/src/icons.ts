/**
 * Meridian's icon set, matching the prototype's.
 *
 * Inline paths rather than a font or sprite: the fixture must not depend on a
 * network asset, and an icon that fails to load would change the accessible name
 * the resolver sees. Every icon is decorative — the label beside it carries the
 * meaning — so all of them are `aria-hidden`.
 */
const PATHS: Readonly<Record<string, string>> = {
  alert: 'M12 4l9 16H3zM12 10v4|c:12,17,0.6',
  beaker: 'M9 3v6l-5 9a2 2 0 002 3h12a2 2 0 002-3l-5-9V3M8 3h8',
  bell: 'M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 004 0',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  chevron: 'M6 9l6 6 6-6',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  folder: 'M3 6h6l2 2h10v11H3z',
  gauge: 'M4 18a8 8 0 1116 0M12 18l4-6',
  help: 'M9 9a3 3 0 114 3c-.8.5-1 1.2-1 2|c:12,12,9|c:12,17,0.6',
  history: 'M4 12a8 8 0 108-8 8 8 0 00-6 2.8M4 4v4h4M12 8v4l3 2',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 016 0v3',
  more: 'c:6,12,1.2|c:12,12,1.2|c:18,12,1.2',
  palette: 'M12 3a9 9 0 100 18c1 0 1.5-.7 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5h1.5A5 5 0 0021 10c0-4-4-7-9-7',
  plus: 'M12 5v14M5 12h14',
  rocket: 'M12 3c4 2 6 6 6 10l-3 3H9l-3-3c0-4 2-8 6-10zM9 19l-2 2M15 19l2 2|c:12,10,1.6',
  search: 'M21 21l-4.5-4.5|c:10.5,10.5,6.5',
  send: 'M4 12l16-8-6 16-3-6z',
  settings: 'M12 8a4 4 0 100 8 4 4 0 000-8M19 12l2-1-2-4-2 .6M5 12l-2-1 2-4 2 .6',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  star: 'M12 4l2.5 5 5.5.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.5-.8z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  upload: 'M12 16V4M8 8l4-4 4 4M4 18v2h16v-2',
  user: 'M4 20a8 8 0 0116 0|c:12,8,4',
  users: 'M2 20a6 6 0 0112 0M14 20a6 6 0 016-6|c:8,8,3.4|c:17,9,2.6',
};

export function icon(name: string, size = 15): string {
  const definition = PATHS[name];
  if (!definition) return '';
  const shapes = definition
    .split('|')
    .filter(Boolean)
    .map((segment) => {
      if (!segment.startsWith('c:')) return `<path d="${segment}"/>`;
      const [cx, cy, r] = segment.slice(2).split(',');
      return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
    })
    .join('');
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${shapes}</svg>`;
}
