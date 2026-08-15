import type { CompiledStep } from '@lodariq/schema';
import {
  LODARIQ_RENDERED_NODE_ID_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE,
} from '@lodariq/schema/dom';
import {
  resolveSafeNavigationDestination,
  type SafeNavigationDestination,
} from '@lodariq/schema/url';
import {
  TOUR_POPUP_STYLE_VARIABLES,
  resolveTourActionRecipe,
  resolveTourCompositionRecipe,
  resolveTourPopupStyleRecipe,
  tourPopupStyleVariables,
} from './tour-recipes';

export type RuntimeBodyNode = CompiledStep['body'][number];
export type RuntimeAction = NonNullable<RuntimeBodyNode['props']['action']>;
type BodyNodeRenderer = (node: RuntimeBodyNode, context: BodyNodeRenderContext) => HTMLElement;

interface BodyNodeRenderContext {
  onAction: (action: RuntimeAction | undefined) => void;
  resolveMediaAsset?: (assetId: string, kind: 'image' | 'video' | 'captions') => string | null;
}

export const BODY_NODE_RENDERERS: Readonly<Record<string, BodyNodeRenderer>> = {
  button: renderButtonNode,
  divider: renderDividerNode,
  heading: renderHeadingNode,
  link: renderLinkNode,
  list: renderListNode,
  media: renderMediaNode,
  paragraph: renderTextNode,
  callout: renderCalloutNode,
  stat: renderStatNode,
  icon: renderIconNode,
};

function renderHeadingNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('h2');
  setBodyNodeContent(element, node);
  return element;
}

export function renderTextNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('div');
  setBodyNodeContent(element, node);
  return element;
}

function renderListNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('ul');
  setBodyNodeAttributes(element, node);
  for (const item of listItems(node.text)) {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    element.appendChild(listItem);
  }
  return element;
}

function renderDividerNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('hr');
  setBodyNodeAttributes(element, node);
  return element;
}

function renderCalloutNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('aside');
  element.setAttribute('role', 'note');
  element.dataset['lodariqCalloutTone'] =
    node.props.composition?.kind === 'callout' ? node.props.composition.tone : 'info';
  setBodyNodeContent(element, node);
  return element;
}

function renderStatNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('role', 'group');
  element.dataset['lodariqStatEmphasis'] =
    node.props.composition?.kind === 'stat' ? node.props.composition.emphasis : 'standard';
  setBodyNodeContent(element, node);
  return element;
}

function renderIconNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', node.props.accessibilityName ?? node.text ?? 'Icon');
  setBodyNodeAttributes(element, node);
  const iconName = node.props.composition?.kind === 'icon' ? node.props.composition.icon : 'info';
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('tour-composition-icon');
  icon.dataset['lodariqIconLoading'] = iconName;
  void import('./tour-rich-icons').then(({ createCompositionIcon }) => {
    const resolvedIcon = createCompositionIcon(iconName);
    resolvedIcon.setAttribute('aria-hidden', 'true');
    resolvedIcon.classList.add('tour-composition-icon');
    icon.replaceWith(resolvedIcon);
  });
  element.prepend(icon);
  if (node.props.textStyle?.align === 'center') element.style.justifyContent = 'center';
  if (node.props.textStyle?.align === 'right') element.style.justifyContent = 'flex-end';
  return element;
}

function renderMediaNode(node: RuntimeBodyNode, context: BodyNodeRenderContext): HTMLElement {
  const media = node.props.media;
  if (!media) {
    const placeholder = document.createElement('div');
    setBodyNodeContent(placeholder, node);
    return placeholder;
  }
  const resolved = safeNavigationDestination(
    context.resolveMediaAsset?.(media.assetId, media.kind) ?? undefined,
  );
  if (!resolved) {
    const unavailable = document.createElement('div');
    setBodyNodeAttributes(unavailable, node);
    unavailable.setAttribute('role', 'img');
    unavailable.setAttribute('aria-label', media.accessibilityName);
    unavailable.dataset['lodariqAssetId'] = media.assetId;
    return unavailable;
  }
  if (media.kind === 'image') {
    const image = document.createElement('img');
    setBodyNodeAttributes(image, node);
    image.src = resolved.href;
    image.alt = media.accessibilityName;
    image.loading = 'lazy';
    if (media.heightPx) image.style.height = `${media.heightPx}px`;
    image.style.objectFit = media.fit ?? 'contain';
    image.style.width = `${media.widthPercent ?? 100}%`;
    if (media.aspectRatio) image.dataset['lodariqAspectRatio'] = media.aspectRatio;
    return image;
  }
  const video = document.createElement('video');
  setBodyNodeAttributes(video, node);
  video.src = resolved.href;
  video.controls = true;
  video.preload = 'metadata';
  video.setAttribute('aria-label', media.accessibilityName);
  if (media.heightPx) video.style.height = `${media.heightPx}px`;
  video.style.objectFit = media.fit ?? 'contain';
  video.style.width = `${media.widthPercent ?? 100}%`;
  if (media.aspectRatio) video.dataset['lodariqAspectRatio'] = media.aspectRatio;
  const captions = media.captionsAssetId
    ? safeNavigationDestination(
        context.resolveMediaAsset?.(media.captionsAssetId, 'captions') ?? undefined,
      )
    : null;
  if (captions) {
    const track = document.createElement('track');
    track.kind = 'captions';
    track.src = captions.href;
    track.default = true;
    video.appendChild(track);
  }
  const poster = media.posterAssetId
    ? safeNavigationDestination(
        context.resolveMediaAsset?.(media.posterAssetId, 'image') ?? undefined,
      )
    : null;
  if (poster) video.poster = poster.href;
  return video;
}

function renderButtonNode(node: RuntimeBodyNode, context: BodyNodeRenderContext): HTMLElement {
  const element = document.createElement('button');
  element.type = 'button';
  setBodyNodeContent(element, node);
  applyButtonPresentation(element, node);
  configureActionElement(element, node.props.action, context);
  return element;
}

function renderLinkNode(node: RuntimeBodyNode, context: BodyNodeRenderContext): HTMLElement {
  const element = document.createElement('a');
  const destination = safeNavigationDestination(
    node.props.action?.type === 'openPage' ? node.props.action.url : undefined,
  );
  element.href = destination?.href ?? '#';
  if (destination?.kind === 'external') {
    element.target = '_blank';
    element.rel = 'noopener noreferrer';
  }
  setBodyNodeContent(element, node);
  applyButtonPresentation(element, node);
  configureActionElement(element, node.props.action, context);
  return element;
}

function setBodyNodeContent(element: HTMLElement, node: RuntimeBodyNode): void {
  setBodyNodeAttributes(element, node);
  const contentRuns = node.contentRuns;
  if (!contentRuns?.length) {
    element.textContent = node.text ?? '';
    appendButtonIcon(element, node);
    return;
  }
  for (const run of contentRuns) {
    const runElement = createInlineRunElement(element.ownerDocument, run);
    element.appendChild(runElement);
  }
  appendButtonIcon(element, node);
}

function setBodyNodeAttributes(element: HTMLElement, node: RuntimeBodyNode): void {
  element.setAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE, node.id);
  element.setAttribute(LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE, node.type);
  if (node.props.variant) {
    element.setAttribute('data-lodariq-action-variant', node.props.variant);
  }
  if (node.props.accessibilityName)
    element.setAttribute('aria-label', node.props.accessibilityName);
  const textStyle = node.props.textStyle;
  if (textStyle?.align) element.style.textAlign = textStyle.align;
  if (textStyle?.fontSizePx) element.style.fontSize = `${textStyle.fontSizePx}px`;
  if (textStyle?.color) element.style.color = textStyle.color;
  if (textStyle?.fontWeight) element.style.fontWeight = String(textStyle.fontWeight);
  if (textStyle?.fontStyle) element.style.fontStyle = textStyle.fontStyle;
  const blockLayout = node.props.blockLayout;
  if (blockLayout?.align) element.dataset['lodariqBlockAlign'] = blockLayout.align;
  if (blockLayout?.spacingBefore) {
    element.dataset['lodariqSpacingBefore'] = blockLayout.spacingBefore;
  }
  if (blockLayout?.spacingAfter) {
    element.dataset['lodariqSpacingAfter'] = blockLayout.spacingAfter;
  }
  if (blockLayout?.spacingAfterPx !== undefined) {
    element.dataset['lodariqSpacingAfterPx'] = String(blockLayout.spacingAfterPx);
    element.style.setProperty('--lq-block-spacing-after', `${blockLayout.spacingAfterPx}px`);
  }
}

function createInlineRunElement(
  ownerDocument: Document,
  run: NonNullable<RuntimeBodyNode['contentRuns']>[number],
): HTMLElement {
  const destination = run.link
    ? resolveSafeNavigationDestination(run.link, { baseUrl: ownerDocument.location?.href })
    : null;
  const element = destination
    ? ownerDocument.createElement('a')
    : ownerDocument.createElement('span');
  element.textContent = run.text;
  if (destination && element instanceof HTMLAnchorElement) {
    element.href = destination.href;
    if (destination.kind === 'external') {
      element.target = '_blank';
      element.rel = 'noopener noreferrer';
    }
    element.addEventListener('click', (event) => event.stopPropagation());
  }
  const marks = new Set(run.marks ?? []);
  if (marks.has('bold')) element.style.fontWeight = '700';
  if (marks.has('italic')) element.style.fontStyle = 'italic';
  if (marks.has('underline')) element.style.textDecoration = 'underline';
  if (run.fontSizePx) element.style.fontSize = `${run.fontSizePx}px`;
  if (run.color) element.style.color = run.color;
  if (run.highlightColor) element.style.backgroundColor = run.highlightColor;
  if (run.animation) {
    element.dataset['lodariqInlineMotion'] = run.animation.recipe;
    element.style.setProperty('--lq-inline-motion-duration', `${run.animation.durationMs}ms`);
    element.style.setProperty(
      '--lq-inline-motion-easing',
      inlineMotionEasing(run.animation.easing),
    );
  }
  return element;
}

function inlineMotionEasing(easing: 'standard' | 'emphasized' | 'linear'): string {
  if (easing === 'linear') return 'linear';
  if (easing === 'emphasized') return 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  return 'cubic-bezier(0.2, 0, 0, 1)';
}

type RuntimeIconElement = readonly [
  tag: 'circle' | 'line' | 'path',
  attributes: Readonly<Record<string, string>>,
];

const ACTION_ICON_NODES: Readonly<Record<string, readonly RuntimeIconElement[]>> = {
  'arrow-right': [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'm12 5 7 7-7 7' }],
  ],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  'external-link': [
    ['path', { d: 'M15 3h6v6' }],
    ['path', { d: 'M10 14 21 3' }],
    ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
  ],
};

function appendButtonIcon(element: HTMLElement, node: RuntimeBodyNode): void {
  if (node.type !== 'button' && node.type !== 'link') return;
  const iconName = node.props.buttonStyle?.icon;
  const iconNode = iconName ? ACTION_ICON_NODES[iconName] : undefined;
  if (!iconNode) return;
  const icon = createRuntimeIcon(iconNode);
  icon.classList.add('tour-action-icon');
  if (node.props.buttonStyle?.iconPlacement === 'start') element.prepend(icon);
  else element.append(icon);
}

function createRuntimeIcon(iconNode: readonly RuntimeIconElement[]): SVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  for (const [name, value] of Object.entries({
    'aria-hidden': 'true',
    fill: 'none',
    height: '24',
    stroke: 'currentColor',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-width': '2',
    viewBox: '0 0 24 24',
    width: '24',
  })) {
    icon.setAttribute(name, value);
  }
  for (const [tag, attributes] of iconNode) {
    const element = document.createElementNS(namespace, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    icon.append(element);
  }
  return icon;
}

function applyButtonPresentation(element: HTMLElement, node: RuntimeBodyNode): void {
  const style = node.props.buttonStyle;
  const recipe = resolveTourActionRecipe(node.props);
  if (recipe.widthPx) {
    element.dataset['lodariqActionWidth'] = 'custom';
    element.style.setProperty('--lq-action-width', `${recipe.widthPx}px`);
  } else {
    element.dataset['lodariqActionWidth'] = recipe.width;
  }
  element.dataset['lodariqActionSize'] = recipe.size;
  element.dataset['lodariqActionRadius'] = recipe.radius;
  if (style?.fillColor) element.style.setProperty('--lq-action-fill', style.fillColor);
  if (style?.textColor) element.style.setProperty('--lq-action-text', style.textColor);
  if (style?.borderColor) element.style.setProperty('--lq-action-border', style.borderColor);
}

export function applyStepComposition(card: HTMLElement, step: CompiledStep): void {
  const recipe = resolveTourCompositionRecipe(step.tooltipLayout);
  const popupStyle = resolveTourPopupStyleRecipe(step.tooltipStyle);
  if (recipe.widthPx !== null) {
    card.dataset['lodariqPopupWidth'] = 'custom';
    card.style.setProperty('--lq-popup-width', `${recipe.widthPx}px`);
  } else {
    delete card.dataset['lodariqPopupWidth'];
    card.style.removeProperty('--lq-popup-width');
  }
  if (recipe.heightPx !== null) {
    card.dataset['lodariqPopupHeight'] = 'custom';
    card.style.setProperty('--lq-popup-height', `${recipe.heightPx}px`);
  } else {
    delete card.dataset['lodariqPopupHeight'];
    card.style.removeProperty('--lq-popup-height');
  }
  card.dataset['lodariqContentAlign'] = recipe.contentAlign;
  card.dataset['lodariqActionLayout'] = recipe.actionLayout;
  card.dataset['lodariqActionAlign'] = recipe.actionAlign;
  card.dataset['lodariqCompositionGap'] = recipe.gap;
  card.dataset['lodariqCompositionPadding'] = recipe.padding;
  card.dataset['lodariqPopupRadius'] = recipe.radius;
  card.dataset['lodariqPointerArrow'] = recipe.showArrow ? 'show' : 'hide';
  card.dataset['lodariqPopupBorderWeight'] = popupStyle.borderWeight;
  card.dataset['lodariqPopupElevation'] = popupStyle.elevation;
  for (const variable of TOUR_POPUP_STYLE_VARIABLES) card.style.removeProperty(variable);
  for (const [variable, value] of Object.entries(tourPopupStyleVariables(popupStyle))) {
    if (value) card.style.setProperty(variable, value);
  }
}

export function appendStepBody(
  card: HTMLElement,
  step: CompiledStep,
  createBodyElement: (node: RuntimeBodyNode) => HTMLElement,
): void {
  let actionGroup: HTMLElement | null = null;
  for (const node of step.body) {
    const isAction = node.type === 'button' || node.type === 'link';
    if (!isAction) {
      actionGroup = null;
      card.appendChild(createBodyElement(node));
      continue;
    }
    if (!actionGroup) {
      actionGroup = card.ownerDocument.createElement('div');
      actionGroup.className = 'tour-action-group';
      card.appendChild(actionGroup);
    }
    actionGroup.appendChild(createBodyElement(node));
  }
}

function configureActionElement(
  element: HTMLButtonElement | HTMLAnchorElement,
  action: RuntimeAction | undefined,
  context: BodyNodeRenderContext,
): void {
  if (!actionEnabled(action)) {
    disableActionElement(element);
    return;
  }
  element.addEventListener('click', (event) => {
    event.preventDefault();
    context.onAction(action);
  });
}

function actionEnabled(action: RuntimeAction | undefined): action is RuntimeAction {
  if (!action) return false;
  if (action.type !== 'openPage') return true;
  return Boolean(safeNavigationDestination(action.url));
}

function disableActionElement(element: HTMLButtonElement | HTMLAnchorElement): void {
  element.setAttribute('aria-disabled', 'true');
  if (element instanceof HTMLButtonElement) {
    element.disabled = true;
    return;
  }
  element.removeAttribute('href');
  element.tabIndex = -1;
}

function listItems(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function safeNavigationDestination(
  rawUrl: string | undefined,
): SafeNavigationDestination | null {
  return resolveSafeNavigationDestination(rawUrl, { baseUrl: window.location.href });
}
