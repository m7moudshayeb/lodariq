import {
  isTourStepStyleSnapshot,
  type LodariqBlock,
  type LodariqDocument,
  type TourStepStyleContent,
  type TourStepStyleSnapshot,
} from '@lodariq/schema';
import { authoringText } from '../i18n';

export interface AuthoringStepStyleRecipe {
  id: string;
  name: string;
  revision: number;
  contentHash: string;
  snapshot: TourStepStyleSnapshot;
  thumbnail: Readonly<{
    surfaceColor?: string;
    textColor?: string;
    actionColor?: string;
  }>;
}

export class AuthoringStepStyleRecipeLibrary {
  private readonly recipes = new Map<string, AuthoringStepStyleRecipe>();

  constructor(initialRecipes: readonly AuthoringStepStyleRecipe[] = []) {
    for (const recipe of initialRecipes) this.upsertValidated(recipe);
  }

  list(): readonly AuthoringStepStyleRecipe[] {
    return [...this.recipes.values()].map(cloneRecipe);
  }

  get(id: string): AuthoringStepStyleRecipe | null {
    const recipe = this.recipes.get(id);
    return recipe ? cloneRecipe(recipe) : null;
  }

  save(name: string, snapshot: TourStepStyleSnapshot): AuthoringStepStyleRecipe {
    if (!isTourStepStyleSnapshot(snapshot)) throw new Error('Invalid Tour step style snapshot');
    const contentHash = styleSnapshotHash(snapshot);
    const id = `style-${contentHash}`;
    const prior = this.recipes.get(id);
    const recipe: AuthoringStepStyleRecipe = {
      id,
      name: boundedRecipeName(name),
      revision: (prior?.revision ?? 0) + 1,
      contentHash,
      snapshot: structuredClone(snapshot),
      thumbnail: recipeThumbnail(snapshot),
    };
    this.recipes.set(id, recipe);
    return cloneRecipe(recipe);
  }

  delete(id: string): boolean {
    return this.recipes.delete(id);
  }

  private upsertValidated(recipe: AuthoringStepStyleRecipe): void {
    if (!isTourStepStyleSnapshot(recipe.snapshot)) return;
    if (recipe.contentHash !== styleSnapshotHash(recipe.snapshot)) return;
    this.recipes.set(recipe.id, cloneRecipe(recipe));
  }
}

export function extractTourStepStyle(step: LodariqBlock): TourStepStyleSnapshot {
  const popup = firstBlock(step, (block) => block.type === 'tooltip' || block.type === 'spotlight');
  const action = firstBlock(step, (block) => block.type === 'button' || block.type === 'link');
  const contentStyles = collectContentStyles(step);
  const snapshot: TourStepStyleSnapshot = {
    ...(popup?.props.tooltipLayout
      ? { popupLayout: structuredClone(popup.props.tooltipLayout) }
      : {}),
    ...(popup?.props.tooltipStyle ? { popupStyle: structuredClone(popup.props.tooltipStyle) } : {}),
    ...(action?.props.buttonStyle
      ? { primaryActionStyle: structuredClone(action.props.buttonStyle) }
      : {}),
    ...(contentStyles.length ? { contentStyles } : {}),
  };
  if (!isTourStepStyleSnapshot(snapshot)) throw new Error('Unable to create a safe step style');
  return snapshot;
}

/** Applies style-only fields and cannot represent content, target, or behavior mutations. */
export function applyTourStepStyle(
  document: LodariqDocument,
  stepIds: readonly string[],
  snapshot: TourStepStyleSnapshot,
): LodariqDocument {
  if (!isTourStepStyleSnapshot(snapshot)) return document;
  const selected = new Set(stepIds);
  return {
    ...document,
    blocks: document.blocks.map((block) =>
      selected.has(block.id) ? applyStyleToStep(block, snapshot) : block,
    ),
  };
}

export function styleSnapshotHash(snapshot: TourStepStyleSnapshot): string {
  const serialized = stableSerialize(snapshot);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(serialized)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, '0');
}

function applyStyleToStep(step: LodariqBlock, snapshot: TourStepStyleSnapshot): LodariqBlock {
  let popupApplied = false;
  let actionApplied = false;
  const contentStyles = new Map(snapshot.contentStyles?.map((entry) => [entry.role, entry.style]));
  const visit = (block: LodariqBlock): LodariqBlock => {
    let props = block.props;
    if (!popupApplied && (block.type === 'tooltip' || block.type === 'spotlight')) {
      popupApplied = true;
      props = {
        ...props,
        tooltipLayout: snapshot.popupLayout ? structuredClone(snapshot.popupLayout) : undefined,
        tooltipStyle: snapshot.popupStyle ? structuredClone(snapshot.popupStyle) : undefined,
      };
    }
    if (!actionApplied && (block.type === 'button' || block.type === 'link')) {
      actionApplied = true;
      props = {
        ...props,
        buttonStyle: snapshot.primaryActionStyle
          ? structuredClone(snapshot.primaryActionStyle)
          : undefined,
      };
    }
    const role = contentRole(block);
    if (role && contentStyles.has(role)) {
      props = { ...props, textStyle: structuredClone(contentStyles.get(role)) };
    }
    return { ...block, props, children: block.children.map(visit) };
  };
  return visit(step);
}

function collectContentStyles(step: LodariqBlock): TourStepStyleContent[] {
  const found = new Map<TourStepStyleContent['role'], TourStepStyleContent>();
  walkBlocks(step, (block) => {
    const role = contentRole(block);
    if (!role || !block.props.textStyle || found.has(role)) return;
    found.set(role, { role, style: structuredClone(block.props.textStyle) });
  });
  return [...found.values()];
}

function contentRole(block: LodariqBlock): TourStepStyleContent['role'] | null {
  if (block.type === 'heading') return 'heading';
  if (block.type === 'paragraph') return 'body';
  if (block.type === 'list') return 'list';
  return null;
}

function firstBlock(
  block: LodariqBlock,
  predicate: (candidate: LodariqBlock) => boolean,
): LodariqBlock | null {
  if (predicate(block)) return block;
  for (const child of block.children) {
    const match = firstBlock(child, predicate);
    if (match) return match;
  }
  return null;
}

function walkBlocks(block: LodariqBlock, visit: (candidate: LodariqBlock) => void): void {
  visit(block);
  for (const child of block.children) walkBlocks(child, visit);
}

function recipeThumbnail(snapshot: TourStepStyleSnapshot): AuthoringStepStyleRecipe['thumbnail'] {
  return {
    ...(snapshot.popupStyle?.surfaceColor
      ? { surfaceColor: snapshot.popupStyle.surfaceColor }
      : {}),
    ...(snapshot.popupStyle?.textColor ? { textColor: snapshot.popupStyle.textColor } : {}),
    ...(snapshot.primaryActionStyle?.fillColor
      ? { actionColor: snapshot.primaryActionStyle.fillColor }
      : {}),
  };
}

function boundedRecipeName(name: string): string {
  const trimmed = name.trim().slice(0, 80);
  return trimmed || authoringText('Untitled style');
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, candidate]) => candidate !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, candidate]) => `${JSON.stringify(key)}:${stableSerialize(candidate)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function cloneRecipe(recipe: AuthoringStepStyleRecipe): AuthoringStepStyleRecipe {
  return structuredClone(recipe);
}
