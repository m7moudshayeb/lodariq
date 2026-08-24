/**
 * Saved step styles and draft checkpoints, kept across a reload.
 *
 * WIRE_BE: the hosted editor writes these through `saveAuthoringResources`,
 * which is a control-plane call. Local development supplied none of the three
 * hooks, so a named style or a checkpoint lived until the next refresh — and a
 * checkpoint you cannot come back to is not a checkpoint. This is the same
 * IndexedDB the media library already uses, one database over.
 *
 * The loaders the frame calls are synchronous, so the rows are hydrated into
 * memory once before the frame mounts and read from there afterwards — exactly
 * how `hydrateLocalMediaAssets` already works.
 */
import {
  AUTHORING_RESOURCE_LIMITS,
  AuthoringDraftCheckpointResource as AuthoringDraftCheckpointResourceSchema,
  AuthoringStepStyleRecipeResource as AuthoringStepStyleRecipeResourceSchema,
  validate,
  type AuthoringDraftCheckpointResource,
} from '@lodariq/schema';
import type { AuthoringStepStyleRecipe } from '../authoring/step-style-recipes';

const DATABASE_NAME = 'lodariq-local-authoring-resources';
const DATABASE_VERSION = 1;
const RECIPE_STORE = 'step-style-recipes';
const CHECKPOINT_STORE = 'draft-checkpoints';

let recipes: AuthoringStepStyleRecipe[] = [];
let checkpoints: AuthoringDraftCheckpointResource[] = [];

/** Reads both sets into memory. Call once, before the frame mounts. */
export async function hydrateLocalAuthoringResources(): Promise<void> {
  recipes = [];
  checkpoints = [];
  if (!hasIndexedDatabase()) return;
  try {
    const [storedRecipes, storedCheckpoints] = await Promise.all([
      readAll(RECIPE_STORE),
      readAll(CHECKPOINT_STORE),
    ]);
    recipes = storedRecipes.filter(isRecipe).slice(0, AUTHORING_RESOURCE_LIMITS.recipes);
    checkpoints = storedCheckpoints
      .filter(isCheckpoint)
      .slice(0, AUTHORING_RESOURCE_LIMITS.checkpoints);
  } catch {
    /*
     * A private window, a blocked upgrade, a corrupt row: none of these are
     * worth refusing to open the editor over. The session then behaves the way
     * it did before this file existed.
     */
  }
}

export function localStepStyleRecipes(): readonly AuthoringStepStyleRecipe[] {
  return recipes.map((recipe) => structuredClone(recipe));
}

export function localDraftCheckpoints(): readonly AuthoringDraftCheckpointResource[] {
  return checkpoints.map((checkpoint) => structuredClone(checkpoint));
}

/**
 * Replaces both sets, as one transaction. The frame hands over its whole list
 * on every change, and a checkpoint deleted in the same breath as a style being
 * saved must not survive because two writes were separate.
 */
export async function saveLocalAuthoringResources(
  nextRecipes: readonly AuthoringStepStyleRecipe[],
  nextCheckpoints: readonly AuthoringDraftCheckpointResource[],
): Promise<void> {
  const keptRecipes = nextRecipes.filter(isRecipe).slice(0, AUTHORING_RESOURCE_LIMITS.recipes);
  const keptCheckpoints = nextCheckpoints
    .filter(isCheckpoint)
    .slice(0, AUTHORING_RESOURCE_LIMITS.checkpoints);
  // Memory first: the creator sees their own edit even where storage refuses.
  recipes = keptRecipes.map((recipe) => structuredClone(recipe));
  checkpoints = keptCheckpoints.map((checkpoint) => structuredClone(checkpoint));
  if (!hasIndexedDatabase()) return;
  await replaceAll(keptRecipes, keptCheckpoints);
}

function isRecipe(value: unknown): value is AuthoringStepStyleRecipe {
  return validate(AuthoringStepStyleRecipeResourceSchema, value).valid;
}

function isCheckpoint(value: unknown): value is AuthoringDraftCheckpointResource {
  return validate(AuthoringDraftCheckpointResourceSchema, value).valid;
}

function hasIndexedDatabase(): boolean {
  return typeof globalThis.indexedDB !== 'undefined';
}

async function readAll(storeName: string): Promise<unknown[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();
    let result: unknown[] = [];
    request.onsuccess = () => {
      result = (request.result as unknown[]) ?? [];
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Local authoring resource read was aborted'));
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Local authoring resource read failed'));
    };
  });
}

async function replaceAll(
  nextRecipes: readonly AuthoringStepStyleRecipe[],
  nextCheckpoints: readonly AuthoringDraftCheckpointResource[],
): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([RECIPE_STORE, CHECKPOINT_STORE], 'readwrite');
    const recipeStore = transaction.objectStore(RECIPE_STORE);
    const checkpointStore = transaction.objectStore(CHECKPOINT_STORE);
    recipeStore.clear();
    checkpointStore.clear();
    for (const recipe of nextRecipes) recipeStore.put(structuredClone(recipe));
    for (const checkpoint of nextCheckpoints) checkpointStore.put(structuredClone(checkpoint));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Local authoring resource write was aborted'));
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Local authoring resource write failed'));
    };
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      for (const storeName of [RECIPE_STORE, CHECKPOINT_STORE]) {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName, { keyPath: 'id' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Local authoring resource storage is unavailable'));
    request.onblocked = () =>
      reject(new Error('Local authoring resource storage upgrade is blocked'));
  });
}
