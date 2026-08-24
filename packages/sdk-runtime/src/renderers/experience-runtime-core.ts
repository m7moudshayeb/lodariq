import type { CompiledDocument, CompiledExperienceBehavior } from '@lodariq/schema';
import { experienceRuntimeText } from '../experience-i18n';
import { tourRuntimeText } from '../tour-i18n';
import {
  getExperienceSurfaceDefinition,
  type ExperienceSurfaceDefinition,
} from './experience-surface-registry';

const ANNOUNCEMENT_SESSION_PREFIX = 'lodariq:announcement:session:';
const ANNOUNCEMENT_VISITOR_PREFIX = 'lodariq:announcement:visitor:';
const SURVEY_PREFIX = 'lodariq:survey:';

export function experienceRuntimeLabel(document: CompiledDocument): string {
  const type = compiledExperience(document).type;
  if (type === 'announcement') return experienceRuntimeText('Lodariq announcement');
  if (type === 'checklist') return experienceRuntimeText('Lodariq checklist');
  if (type === 'hotspot') return experienceRuntimeText('Lodariq hotspot');
  if (type === 'survey') return experienceRuntimeText('Lodariq survey');
  return tourRuntimeText('Lodariq tour');
}

export function experienceCompletionLabel(document: CompiledDocument): string {
  const type = compiledExperience(document).type;
  if (type === 'announcement') return experienceRuntimeText('Announcement complete');
  if (type === 'checklist') return experienceRuntimeText('Checklist complete');
  if (type === 'hotspot') return experienceRuntimeText('Hotspot complete');
  if (type === 'survey') return experienceRuntimeText('Survey complete');
  return tourRuntimeText('Tour complete');
}

export function compiledExperience(document: CompiledDocument): CompiledExperienceBehavior {
  if ('experience' in document && document.experience) return document.experience;
  if (document.type === 'announcement') {
    return { type: 'announcement', surface: 'modal', frequency: 'always', dismissible: true };
  }
  if (document.type === 'hotspot') {
    return { type: 'hotspot', surface: 'hotspot', marker: 'pulse', activation: 'click' };
  }
  if (document.type === 'survey') {
    return {
      type: 'survey',
      surface: 'modal',
      submission: 'repeatable',
      requireAnswer: false,
      questionBlockIds: [],
    };
  }
  if (document.type === 'checklist') {
    return {
      type: 'checklist',
      surface: 'floating',
      showProgress: true,
      completion: 'allItems',
      itemBlockIds: [],
    };
  }
  return { type: 'tour', surface: 'popup' };
}

/**
 * The surface contract in force. Layout, focus, backdrop and dismissal all read
 * this rather than testing the experience type, so a surface behaves the same
 * way whichever type chose it.
 */
export function experienceSurfaceDefinition(
  document: CompiledDocument,
): ExperienceSurfaceDefinition {
  return getExperienceSurfaceDefinition(compiledExperience(document).surface);
}

export function experienceIsSuppressed(document: CompiledDocument): boolean {
  const experience = compiledExperience(document);
  if (experience.type === 'announcement') {
    if (experience.frequency === 'always') return false;
    return storageHas(
      experience.frequency === 'session' ? sessionStorageSafe() : localStorageSafe(),
      `${experience.frequency === 'session' ? ANNOUNCEMENT_SESSION_PREFIX : ANNOUNCEMENT_VISITOR_PREFIX}${document.documentId}`,
    );
  }
  if (experience.type === 'survey' && experience.submission === 'once') {
    return storageHas(localStorageSafe(), surveyStorageKey(document.documentId));
  }
  return false;
}

export function markExperienceShown(document: CompiledDocument): void {
  const experience = compiledExperience(document);
  if (experience.type !== 'announcement' || experience.frequency === 'always') return;
  storageSet(
    experience.frequency === 'session' ? sessionStorageSafe() : localStorageSafe(),
    `${experience.frequency === 'session' ? ANNOUNCEMENT_SESSION_PREFIX : ANNOUNCEMENT_VISITOR_PREFIX}${document.documentId}`,
    '1',
  );
}

export function surveyStorageKey(documentId: string): string {
  return `${SURVEY_PREFIX}${documentId}`;
}

export function localStorageSafe(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function storageSet(storage: Storage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    /* Visitor progress is best-effort and must never break the customer page. */
  }
}

function sessionStorageSafe(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function storageHas(storage: Storage | null, key: string): boolean {
  try {
    return storage?.getItem(key) === '1';
  } catch {
    return false;
  }
}
