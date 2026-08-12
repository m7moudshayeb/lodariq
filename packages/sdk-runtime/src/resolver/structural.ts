import { simHash } from './hashing';

const OCCUPANCY_GRID_SIZE = 8;
const MAX_OCCUPANCY_DESCENDANTS = 96;
const MAX_NEIGHBOR_ANCESTORS = 4;

export interface VisualStructureCapture {
  structuralHash: string;
  occupancyGrid: string;
  appearanceHash: string;
  neighborhoodHash: string;
  layoutSlot?: { siblingIndex: number; siblingCount: number };
}

export function captureVisualStructure(element: Element): VisualStructureCapture | null {
  const rect = safeRect(element);
  if (!rect) return null;
  const style = safeComputedStyle(element);
  const structuralHash = simHash(structuralTokens(element, style));
  const occupancyGrid = occupancyGridFor(element, rect);
  const appearanceHash = simHash(appearanceTokens(style, occupancyGrid));
  const neighborhoodHash = simHash(neighborhoodTokens(element));
  const parent = element.parentElement;
  const siblings = parent ? [...parent.children].filter((entry) => !isLodariqOwned(entry)) : [];
  const siblingIndex = siblings.indexOf(element);
  const siblingCount = siblings.length;

  return {
    structuralHash,
    occupancyGrid,
    appearanceHash,
    neighborhoodHash,
    ...(siblingIndex >= 0 && siblingCount > 0 && siblingCount <= 10_000
      ? { layoutSlot: { siblingIndex, siblingCount } }
      : {}),
  };
}

function structuralTokens(element: Element, style: CSSStyleDeclaration | null): string[] {
  const descendants = boundedDescendants(element, MAX_OCCUPANCY_DESCENDANTS);
  const children = nonLodariqChildren(element);
  return [
    `kind:${elementCategory(element)}`,
    `display:${displayCategory(style?.display)}`,
    `children:${countBucket(children.length)}`,
    `descendants:${countBucket(descendants.length)}`,
    `leaf-kinds:${categoryHistogram(descendants.filter((entry) => entry.children.length === 0))}`,
  ];
}

function appearanceTokens(style: CSSStyleDeclaration | null, occupancyGrid: string): string[] {
  const occupied = [...occupancyGrid].filter((bit) => bit === '1').length;
  return [
    `background:${colorTone(style?.backgroundColor)}`,
    `foreground:${colorTone(style?.color)}`,
    `border:${borderBucket(style)}`,
    `radius:${radiusBucket(style?.borderRadius)}`,
    `shadow:${style?.boxShadow && style.boxShadow !== 'none' ? 'yes' : 'no'}`,
    `density:${ratioBucket(occupied / 64)}`,
  ];
}

function neighborhoodTokens(element: Element): string[] {
  const tokens: string[] = [];
  let current = element.parentElement;
  let depth = 0;
  while (current && depth < MAX_NEIGHBOR_ANCESTORS) {
    tokens.push(
      `ancestor-${depth}:${elementCategory(current)}:${countBucket(nonLodariqChildren(current).length)}`,
    );
    current = current.parentElement;
    depth += 1;
  }
  const siblings = element.parentElement ? nonLodariqChildren(element.parentElement) : [];
  const siblingIndex = siblings.indexOf(element);
  const previous = siblingIndex > 0 ? siblings[siblingIndex - 1] : undefined;
  const next = siblingIndex >= 0 ? siblings[siblingIndex + 1] : undefined;
  if (previous) {
    tokens.push(`previous:${elementCategory(previous)}`);
  }
  if (next) {
    tokens.push(`next:${elementCategory(next)}`);
  }
  tokens.push(`siblings:${countBucket(siblings.length)}`);
  return tokens;
}

function occupancyGridFor(element: Element, targetRect: DOMRect): string {
  const cells = new Uint8Array(OCCUPANCY_GRID_SIZE * OCCUPANCY_GRID_SIZE);
  const descendants = boundedDescendants(element, MAX_OCCUPANCY_DESCENDANTS);
  for (const descendant of descendants) {
    const rect = safeRect(descendant);
    if (!rect) continue;
    const left = clampRatio((rect.left - targetRect.left) / targetRect.width);
    const right = clampRatio((rect.right - targetRect.left) / targetRect.width);
    const top = clampRatio((rect.top - targetRect.top) / targetRect.height);
    const bottom = clampRatio((rect.bottom - targetRect.top) / targetRect.height);
    const startColumn = Math.min(7, Math.floor(left * OCCUPANCY_GRID_SIZE));
    const endColumn = Math.min(7, Math.floor(right * OCCUPANCY_GRID_SIZE));
    const startRow = Math.min(7, Math.floor(top * OCCUPANCY_GRID_SIZE));
    const endRow = Math.min(7, Math.floor(bottom * OCCUPANCY_GRID_SIZE));
    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        cells[row * OCCUPANCY_GRID_SIZE + column] = 1;
      }
    }
  }
  return [...cells].join('');
}

function boundedDescendants(element: Element, limit: number): Element[] {
  const descendants: Element[] = [];
  const queue = [...element.children];
  while (queue.length > 0 && descendants.length < limit) {
    const candidate = queue.shift();
    if (!candidate) continue;
    if (isLodariqOwned(candidate)) continue;
    descendants.push(candidate);
    queue.push(...candidate.children);
  }
  return descendants;
}

function nonLodariqChildren(element: Element): Element[] {
  return [...element.children].filter((child) => !isLodariqOwned(child));
}

function isLodariqOwned(element: Element): boolean {
  return element.tagName.toLowerCase().startsWith('lodariq-');
}

function categoryHistogram(elements: readonly Element[]): string {
  const counts = new Map<string, number>();
  for (const element of elements) {
    const category = elementCategory(element);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([category, count]) => `${category}:${countBucket(count)}`)
    .join(',');
}

function elementCategory(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (['button', 'a', 'input', 'select', 'textarea', 'summary'].includes(tag)) return 'control';
  if (['img', 'svg', 'canvas', 'video', 'picture'].includes(tag)) return 'media';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (['p', 'span', 'label', 'strong', 'small', 'li'].includes(tag)) return 'content';
  if (['table', 'ul', 'ol', 'form', 'nav', 'main', 'section', 'article'].includes(tag)) {
    return 'semantic-container';
  }
  return 'container';
}

function displayCategory(display: string | undefined): string {
  if (!display) return 'unknown';
  if (display.includes('flex')) return 'flex';
  if (display.includes('grid')) return 'grid';
  if (display.includes('table')) return 'table';
  if (display.includes('inline')) return 'inline';
  if (display === 'contents') return 'contents';
  return 'block';
}

function colorTone(value: string | undefined): string {
  if (!value || value === 'transparent') return 'transparent';
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  if (channels.length < 3 || (channels.length > 3 && channels[3] === 0)) return 'transparent';
  const luminance = (channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722) / 255;
  if (luminance < 0.25) return 'dark';
  if (luminance < 0.7) return 'mid';
  return 'light';
}

function borderBucket(style: CSSStyleDeclaration | null): string {
  if (!style) return 'unknown';
  const widths = [
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ].map((value) => Number.parseFloat(value) || 0);
  const width = Math.max(...widths);
  if (width <= 0) return 'none';
  if (width <= 1) return 'thin';
  return 'thick';
}

function radiusBucket(value: string | undefined): string {
  const radius = Number.parseFloat(value ?? '') || 0;
  if (radius <= 0) return 'square';
  if (radius <= 4) return 'small';
  if (radius <= 12) return 'medium';
  return 'round';
}

function ratioBucket(value: number): string {
  if (value <= 0.15) return 'sparse';
  if (value <= 0.5) return 'balanced';
  return 'dense';
}

function countBucket(value: number): string {
  if (value === 0) return 'zero';
  if (value === 1) return 'one';
  if (value <= 3) return 'few';
  if (value <= 8) return 'several';
  return 'many';
}

function safeComputedStyle(element: Element): CSSStyleDeclaration | null {
  try {
    return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
  } catch {
    return null;
  }
}

function safeRect(element: Element): DOMRect | null {
  try {
    const rect = element.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
    return rect.width > 0 && rect.height > 0 ? rect : null;
  } catch {
    return null;
  }
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}
