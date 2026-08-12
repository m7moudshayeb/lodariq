import {
  CustomerBrandTokenRegistration as CustomerBrandTokenRegistrationSchema,
  PRODUCT_STYLE_MAX_ANCESTORS,
  PRODUCT_STYLE_MAX_NEARBY_CONTROLS,
  PRODUCT_STYLE_MAX_REGISTERED_SOURCES,
  PRODUCT_STYLE_SOURCE_PRIORITY,
  validate,
  type CustomerBrandTokenRegistration,
  type CustomerBrandTokenValues,
  type ProductStyleProposal,
  type ProductStyleSample,
  type ProductStyleSampleKind,
  type ProductStyleSampleValues,
  type ProductStyleSource,
  type ProductStyleSourceKind,
  type ThemeShadowLayer,
} from '@lodariq/schema';

const PRODUCT_STYLE_MAX_INSPECTED_ELEMENTS = 200;
const PRODUCT_STYLE_DOCUMENT_READY_TIMEOUT_MS = 5_000;
const SEMANTIC_CONTROL_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
const SEMANTIC_CONTROL_ROLES = new Set(['button', 'link', 'checkbox', 'switch', 'tab', 'menuitem']);

const SAFE_FONT_RE = /^(?!.*(?:url\(|https?:\/\/|data:|var\(|[;{}])).+$/iu;
const PIXEL_VALUE_RE = /^(-?(?:\d+|\d*\.\d+))px$/u;
const COLOR_VALUE_RE = /(?:#[0-9a-f]{3,8}|rgba?\([^)]*\))/iu;

const SOURCE_CONFIDENCE: Record<ProductStyleSourceKind, number> = {
  registered_tokens: 100,
  selected_element: 88,
  page_typography: 82,
  ancestor_context: 64,
  nearby_control: 72,
  fallback: 50,
};

const SAMPLE_SOURCE_IDS: Record<ProductStyleSampleKind, string> = {
  selected_element: 'lodariq.inferred.selected',
  page_typography: 'lodariq.inferred.page',
  ancestor_context: 'lodariq.inferred.ancestor',
  nearby_control: 'lodariq.inferred.control',
};

const ACCESSIBLE_FALLBACK_TOKENS: CustomerBrandTokenValues = {
  modes: {
    light: {
      colors: {
        surface: '#ffffff',
        text: '#111827',
        accent: '#2457ff',
        onAccent: '#ffffff',
        border: '#d1d5db',
        focus: '#2457ff',
      },
    },
  },
  typography: {
    fontFamilies: ['system-ui'],
    baseSizePx: 16,
    bodyLineHeight: 1.5,
    bodyWeight: 400,
  },
  radii: { md: 12 },
  spacing: { md: 16 },
};

export interface ProductStyleSamplerOptions {
  document?: Document;
  selectedElement?: Element | null;
  registeredTokens?: readonly CustomerBrandTokenRegistration[];
  proposalId?: string;
  now?: () => Date;
  waitForRouteReady?: () => Promise<void>;
  waitForAnimationFrame?: () => Promise<void>;
}

interface PendingSample {
  kind: ProductStyleSampleKind;
  values: ProductStyleSampleValues;
}

/**
 * Samples a deliberately small, privacy-safe product-style envelope. It never
 * serializes selectors, class names, DOM/HTML, text, URLs, or coordinates.
 */
export async function sampleProductStyles(
  options: ProductStyleSamplerOptions = {},
): Promise<ProductStyleProposal> {
  const document = options.document ?? globalThis.document;
  if (!document?.defaultView) {
    throw new Error('Product style sampling requires a browser document.');
  }

  const waitForRouteReady = options.waitForRouteReady ?? (() => waitForDocumentReady(document));
  await waitForRouteReady();
  await waitForFonts(document);
  const waitForFrame =
    options.waitForAnimationFrame ?? createAnimationFrameWaiter(document.defaultView);
  await waitForFrame();
  await waitForFrame();

  const capturedAt = (options.now ?? (() => new Date()))().toISOString();
  const pendingSamples = collectSamples(document, options.selectedElement ?? null);
  const samples = pendingSamples.map<ProductStyleSample>((sample, index) => ({
    sampleId: `sample.${sample.kind}.${index + 1}`,
    sourceId: SAMPLE_SOURCE_IDS[sample.kind],
    kind: sample.kind,
    confidence: SOURCE_CONFIDENCE[sample.kind],
    values: sample.values,
  }));
  const registrations = normalizeRegistrations(options.registeredTokens ?? []);
  const sources = await createSources(registrations, samples, capturedAt);
  const confidence = proposalConfidence(registrations, samples);

  let tokens = mergeTokenValues(ACCESSIBLE_FALLBACK_TOKENS, inferTokens(samples));
  for (const registration of registrations) {
    tokens = mergeTokenValues(tokens, tokenValuesFromRegistration(registration));
  }

  return {
    schemaVersion: '1',
    proposalId: options.proposalId ?? `proposal.${Date.parse(capturedAt)}`,
    sources,
    samples,
    tokens,
    confidence,
    requiresConfirmation: registrations.length === 0 && confidence < 85,
    createdAt: capturedAt,
  };
}

function collectSamples(document: Document, selectedElement: Element | null): PendingSample[] {
  const samples: PendingSample[] = [];
  const reserved = new Set<Element>();

  if (selectedElement && selectedElement.ownerDocument === document && isVisible(selectedElement)) {
    appendSample(samples, 'selected_element', selectedElement);
    reserved.add(selectedElement);
  }

  if (document.body && isVisible(document.body)) {
    appendSample(samples, 'page_typography', document.body);
    reserved.add(document.body);
  }

  let ancestor = selectedElement?.parentElement ?? null;
  let ancestorCount = 0;
  while (ancestor && ancestorCount < PRODUCT_STYLE_MAX_ANCESTORS) {
    if (!reserved.has(ancestor) && isVisible(ancestor)) {
      appendSample(samples, 'ancestor_context', ancestor);
      reserved.add(ancestor);
      ancestorCount += 1;
    }
    ancestor = ancestor.parentElement;
  }

  appendNearbyControlSamples(samples, reserved, document.body);

  return samples;
}

function appendNearbyControlSamples(
  samples: PendingSample[],
  reserved: Set<Element>,
  root: Element | null,
): void {
  if (!root) return;
  const queue: Element[] = [root];
  let inspectedCount = 0;
  let controlCount = 0;
  while (
    queue.length > 0 &&
    inspectedCount < PRODUCT_STYLE_MAX_INSPECTED_ELEMENTS &&
    controlCount < PRODUCT_STYLE_MAX_NEARBY_CONTROLS
  ) {
    const candidate = queue.shift();
    if (!candidate) break;
    inspectedCount += 1;
    if (!reserved.has(candidate) && isSemanticControl(candidate) && isVisible(candidate)) {
      appendSample(samples, 'nearby_control', candidate);
      reserved.add(candidate);
      controlCount += 1;
    }
    for (const child of candidate.children) {
      if (queue.length + inspectedCount >= PRODUCT_STYLE_MAX_INSPECTED_ELEMENTS) break;
      queue.push(child);
    }
  }
}

function isSemanticControl(element: Element): boolean {
  if (SEMANTIC_CONTROL_TAGS.has(element.tagName)) return true;
  if (element.tagName === 'A' && element.hasAttribute('href')) return true;
  const role = element.getAttribute('role');
  return role ? SEMANTIC_CONTROL_ROLES.has(role.toLowerCase()) : false;
}

function appendSample(
  samples: PendingSample[],
  kind: ProductStyleSampleKind,
  element: Element,
): void {
  const view = element.ownerDocument.defaultView;
  if (!view) return;
  const values = normalizeComputedStyle(view.getComputedStyle(element));
  if (Object.keys(values).length > 0) samples.push({ kind, values });
}

function isVisible(element: Element): boolean {
  let candidate: Element | null = element;
  while (candidate) {
    if (
      candidate.hasAttribute('hidden') ||
      candidate.hasAttribute('inert') ||
      candidate.getAttribute('aria-hidden') === 'true'
    ) {
      return false;
    }
    const style = candidate.ownerDocument.defaultView?.getComputedStyle(candidate);
    if (
      style &&
      (style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        (style.opacity !== '' && Number(style.opacity) === 0))
    ) {
      return false;
    }
    candidate = candidate.parentElement;
  }
  return true;
}

function normalizeComputedStyle(style: CSSStyleDeclaration): ProductStyleSampleValues {
  const color = normalizeColor(style.color);
  const backgroundColor = normalizeColor(style.backgroundColor);
  const fontFamilies = normalizeFontFamilies(style.fontFamily);
  const fontSizePx = boundedPixel(style.fontSize, 8, 96);
  const fontWeight = normalizeFontWeight(style.fontWeight);
  const lineHeight = normalizeLineHeight(style.lineHeight, fontSizePx);
  const borderColor = normalizeColor(style.borderTopColor);
  const borderWidthPx = boundedPixel(style.borderTopWidth, 0, 6);
  const radiusPx = boundedPixel(style.borderTopLeftRadius, 0, 32);
  const paddingBlockPx = averagePixels(style.paddingTop, style.paddingBottom, 0, 64);
  const paddingInlinePx = averagePixels(style.paddingLeft, style.paddingRight, 0, 64);
  const shadow = normalizeShadow(style.boxShadow);
  const widthPx = boundedPixel(style.width, 1, 4_096);
  const maxWidthPx = boundedPixel(style.maxWidth, 1, 4_096);

  return {
    ...(color ? { color } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(fontFamilies.length > 0 ? { fontFamilies } : {}),
    ...(fontSizePx !== undefined ? { fontSizePx } : {}),
    ...(fontWeight !== undefined ? { fontWeight } : {}),
    ...(lineHeight !== undefined ? { lineHeight } : {}),
    ...(borderColor ? { borderColor } : {}),
    ...(borderWidthPx !== undefined ? { borderWidthPx } : {}),
    ...(radiusPx !== undefined ? { radiusPx } : {}),
    ...(paddingBlockPx !== undefined ? { paddingBlockPx } : {}),
    ...(paddingInlinePx !== undefined ? { paddingInlinePx } : {}),
    ...(shadow.length > 0 ? { shadow } : {}),
    ...(widthPx !== undefined ? { widthPx } : {}),
    ...(maxWidthPx !== undefined ? { maxWidthPx } : {}),
  };
}

function normalizeColor(value: string): `#${string}` | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'transparent') return '#00000000';
  if (normalized.startsWith('#')) return normalizeHexColor(normalized);

  const match = /^rgba?\((.*)\)$/u.exec(normalized);
  if (!match?.[1]) return undefined;
  const parts = match[1]
    .replace('/', ' ')
    .split(/[\s,]+/u)
    .filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return undefined;
  const red = normalizeRgbChannel(parts[0]);
  const green = normalizeRgbChannel(parts[1]);
  const blue = normalizeRgbChannel(parts[2]);
  if (red === undefined || green === undefined || blue === undefined) return undefined;
  const alpha = parts[3] === undefined ? 255 : normalizeAlpha(parts[3]);
  if (alpha === undefined) return undefined;
  const rgb = `${hexByte(red)}${hexByte(green)}${hexByte(blue)}`;
  return alpha === 255 ? `#${rgb}` : `#${rgb}${hexByte(alpha)}`;
}

function normalizeHexColor(value: string): `#${string}` | undefined {
  const hex = value.slice(1);
  if (!/^[0-9a-f]+$/u.test(hex)) return undefined;
  if (hex.length === 3 || hex.length === 4) {
    return `#${[...hex].map((character) => `${character}${character}`).join('')}`;
  }
  return hex.length === 6 || hex.length === 8 ? `#${hex}` : undefined;
}

function normalizeRgbChannel(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (value.endsWith('%')) {
    const percentage = Number(value.slice(0, -1));
    return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
      ? Math.round((percentage / 100) * 255)
      : undefined;
  }
  const channel = Number(value);
  return Number.isFinite(channel) && channel >= 0 && channel <= 255
    ? Math.round(channel)
    : undefined;
}

function normalizeAlpha(value: string): number | undefined {
  if (value.endsWith('%')) {
    const percentage = Number(value.slice(0, -1));
    return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
      ? Math.round((percentage / 100) * 255)
      : undefined;
  }
  const alpha = Number(value);
  return Number.isFinite(alpha) && alpha >= 0 && alpha <= 1 ? Math.round(alpha * 255) : undefined;
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function normalizeFontFamilies(value: string): string[] {
  const families = value
    .split(',')
    .map((family) => family.trim().replace(/^(?:"|')|(?:"|')$/gu, ''))
    .filter((family) => family.length > 0 && family.length <= 80 && SAFE_FONT_RE.test(family));
  return [...new Set(families)].slice(0, 5);
}

function boundedPixel(value: string, minimum: number, maximum: number): number | undefined {
  const match = PIXEL_VALUE_RE.exec(value.trim().toLowerCase());
  if (!match?.[1]) return undefined;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) return undefined;
  return round(numeric, 3);
}

function averagePixels(
  first: string,
  second: string,
  minimum: number,
  maximum: number,
): number | undefined {
  const firstPx = boundedPixel(first, minimum, maximum);
  const secondPx = boundedPixel(second, minimum, maximum);
  if (firstPx === undefined || secondPx === undefined) return undefined;
  return round((firstPx + secondPx) / 2, 3);
}

function normalizeFontWeight(value: string): number | undefined {
  if (value === 'normal') return 400;
  if (value === 'bold') return 700;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 100 || numeric > 900) return undefined;
  return Math.round(numeric / 100) * 100;
}

function normalizeLineHeight(value: string, fontSizePx: number | undefined): number | undefined {
  const direct = Number(value);
  let ratio = Number.isFinite(direct) ? direct : undefined;
  if (ratio === undefined && fontSizePx !== undefined) {
    const lineHeightPx = boundedPixel(value, fontSizePx, fontSizePx * 3);
    if (lineHeightPx !== undefined) ratio = lineHeightPx / fontSizePx;
  }
  if (ratio === undefined || ratio < 1 || ratio > 3) return undefined;
  return round(ratio, 3);
}

function normalizeShadow(value: string): ThemeShadowLayer[] {
  if (!value || value === 'none' || value.includes('inset')) return [];
  const layers: ThemeShadowLayer[] = [];
  for (const layer of splitCssList(value)) {
    if (layers.length >= 3) break;
    const colorMatch = COLOR_VALUE_RE.exec(layer);
    const color = colorMatch ? normalizeColor(colorMatch[0]) : undefined;
    if (!color || !colorMatch) continue;
    const lengths = layer
      .replace(colorMatch[0], '')
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .map((part) => boundedPixel(part, -32, 64));
    if (lengths.length < 2 || lengths.some((length) => length === undefined)) continue;
    const xPx = lengths[0] ?? 0;
    const yPx = lengths[1] ?? 0;
    const blurPx = lengths[2] ?? 0;
    const spreadPx = lengths[3] ?? 0;
    if (xPx > 32 || yPx > 32 || blurPx < 0 || spreadPx < -16 || spreadPx > 16) continue;
    layers.push({
      xPx: Math.round(xPx),
      yPx: Math.round(yPx),
      blurPx: Math.round(blurPx),
      spreadPx: Math.round(spreadPx),
      color,
    });
  }
  return layers;
}

function splitCssList(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function inferTokens(samples: readonly ProductStyleSample[]): CustomerBrandTokenValues {
  const selected = firstSample(samples, 'selected_element');
  const page = firstSample(samples, 'page_typography');
  const ancestor = firstSample(samples, 'ancestor_context');
  const control = firstSample(samples, 'nearby_control');
  const accentSource = selected ?? control;
  const accent = opaqueColor(accentSource?.values.backgroundColor);
  const onAccent = opaqueColor(accentSource?.values.color);
  const surface = opaqueColor(page?.values.backgroundColor);
  const text = opaqueColor(page?.values.color);
  const border = opaqueColor(selected?.values.borderColor ?? ancestor?.values.borderColor);
  const colors = {
    ...(surface ? { surface } : {}),
    ...(text ? { text } : {}),
    ...(accent ? { accent } : {}),
    ...(accent && onAccent ? { onAccent } : {}),
    ...(border ? { border } : {}),
  };
  const pageValues = page?.values;
  const typography = {
    ...(pageValues?.fontFamilies ? { fontFamilies: pageValues.fontFamilies } : {}),
    ...(pageValues?.fontSizePx !== undefined
      ? { baseSizePx: clampInteger(pageValues.fontSizePx, 12, 20) }
      : {}),
    ...(pageValues?.lineHeight !== undefined
      ? { bodyLineHeight: round(Math.min(2, Math.max(1.2, pageValues.lineHeight)), 3) }
      : {}),
    ...(pageValues?.fontWeight !== undefined
      ? { bodyWeight: pageValues.fontWeight >= 500 ? (500 as const) : (400 as const) }
      : {}),
  };
  const radius = selected?.values.radiusPx ?? control?.values.radiusPx;
  const spacing = selected?.values.paddingInlinePx ?? control?.values.paddingInlinePx;

  return {
    ...(Object.keys(colors).length > 0 ? { modes: { light: { colors } } } : {}),
    ...(Object.keys(typography).length > 0 ? { typography } : {}),
    ...(radius !== undefined ? { radii: { md: clampInteger(radius, 0, 32) } } : {}),
    ...(spacing !== undefined ? { spacing: { md: clampInteger(spacing, 0, 64) } } : {}),
  };
}

function firstSample(
  samples: readonly ProductStyleSample[],
  kind: ProductStyleSampleKind,
): ProductStyleSample | undefined {
  return samples.find((sample) => sample.kind === kind);
}

function opaqueColor(value: string | undefined): `#${string}` | undefined {
  return value?.length === 7 ? (value as `#${string}`) : undefined;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function normalizeRegistrations(
  registrations: readonly CustomerBrandTokenRegistration[],
): CustomerBrandTokenRegistration[] {
  return registrations.slice(-PRODUCT_STYLE_MAX_REGISTERED_SOURCES).flatMap((registration) => {
    const result = validate(CustomerBrandTokenRegistrationSchema, registration);
    return result.valid ? [structuredClone(result.value)] : [];
  });
}

async function createSources(
  registrations: readonly CustomerBrandTokenRegistration[],
  samples: readonly ProductStyleSample[],
  capturedAt: string,
): Promise<ProductStyleSource[]> {
  const sources: ProductStyleSource[] = [];
  for (const registration of registrations) {
    sources.push({
      sourceId: registration.sourceId,
      kind: 'registered_tokens',
      revision: registration.revision,
      confidence: SOURCE_CONFIDENCE.registered_tokens,
      fingerprintHash: await hashNormalized(registration),
      capturedAt,
    });
  }

  for (const kind of [
    'selected_element',
    'page_typography',
    'ancestor_context',
    'nearby_control',
  ] as const) {
    const grouped = samples.filter((sample) => sample.kind === kind);
    if (grouped.length === 0) continue;
    sources.push({
      sourceId: SAMPLE_SOURCE_IDS[kind],
      kind,
      confidence: SOURCE_CONFIDENCE[kind],
      fingerprintHash: await hashNormalized(grouped.map((sample) => sample.values)),
      capturedAt,
    });
  }

  sources.push({
    sourceId: 'lodariq.fallback.accessible',
    kind: 'fallback',
    revision: '1',
    confidence: SOURCE_CONFIDENCE.fallback,
    fingerprintHash: await hashNormalized(ACCESSIBLE_FALLBACK_TOKENS),
    capturedAt,
  });

  const priority = new Map(PRODUCT_STYLE_SOURCE_PRIORITY.map((kind, index) => [kind, index]));
  return sources.sort(
    (left, right) => (priority.get(left.kind) ?? 99) - (priority.get(right.kind) ?? 99),
  );
}

function tokenValuesFromRegistration(
  registration: CustomerBrandTokenRegistration,
): CustomerBrandTokenValues {
  const { schemaVersion, sourceId, revision, ...tokens } = registration;
  void schemaVersion;
  void sourceId;
  void revision;
  return tokens;
}

function mergeTokenValues(
  base: CustomerBrandTokenValues,
  override: CustomerBrandTokenValues,
): CustomerBrandTokenValues {
  return deepMerge(base, override) as CustomerBrandTokenValues;
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainRecord(base) || !isPlainRecord(override)) return structuredClone(override);
  const merged: Record<string, unknown> = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    merged[key] = key in merged ? deepMerge(merged[key], value) : structuredClone(value);
  }
  return merged;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function proposalConfidence(
  registrations: readonly CustomerBrandTokenRegistration[],
  samples: readonly ProductStyleSample[],
): number {
  if (registrations.length > 0) return 100;
  const selected = firstSample(samples, 'selected_element');
  if (selected) {
    const hasAccentPair = Boolean(
      opaqueColor(selected.values.backgroundColor) && opaqueColor(selected.values.color),
    );
    const hasComponentShape = Boolean(
      selected.values.radiusPx !== undefined ||
      selected.values.paddingBlockPx !== undefined ||
      selected.values.paddingInlinePx !== undefined,
    );
    if (hasAccentPair && hasComponentShape) return SOURCE_CONFIDENCE.selected_element;
  }
  return (
    samples.reduce((current, sample) => {
      const confidence =
        sample.kind === 'selected_element' ? SOURCE_CONFIDENCE.page_typography : sample.confidence;
      return Math.max(current, confidence);
    }, 0) || 50
  );
}

async function hashNormalized(value: unknown): Promise<`sha256-${string}`> {
  if (!globalThis.crypto?.subtle) throw new Error('Product style sampling requires Web Crypto.');
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256-${hex}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

async function waitForFonts(document: Document): Promise<void> {
  if (!document.fonts) return;
  try {
    await document.fonts.ready;
  } catch {
    // An optional font failure is recorded as fallback, not a sampling failure.
  }
}

function waitForDocumentReady(document: Document): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  const view = document.defaultView;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener('DOMContentLoaded', onReady);
      if (timeoutId !== undefined) view?.clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve();
    };
    const onReady = (): void => finish();
    const timeoutId = view?.setTimeout(
      () => finish(new Error('Product style sampling timed out waiting for document readiness.')),
      PRODUCT_STYLE_DOCUMENT_READY_TIMEOUT_MS,
    );
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  });
}

function createAnimationFrameWaiter(view: Window): () => Promise<void> {
  return () => new Promise((resolve) => view.requestAnimationFrame(() => resolve()));
}

function round(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}
