import { describe, expect, it } from 'vitest';
import {
  getExperienceSurfaceDefinition,
  listExperienceSurfaceDefinitions,
} from '../../../../../packages/sdk-runtime/src/renderers/experience-surface-registry';

describe('experience surface registry', () => {
  it('registers popup, modal, and hotspot as explicit surface capabilities', () => {
    expect(listExperienceSurfaceDefinitions().map(({ kind }) => kind)).toEqual([
      'popup',
      'modal',
      'hotspot',
    ]);
  });

  it('keeps modal and hotspot interaction semantics distinct', () => {
    expect(getExperienceSurfaceDefinition('modal')).toMatchObject({
      anchor: 'viewport',
      ariaRole: 'dialog',
      backdrop: true,
      focus: 'trap',
      resizable: true,
    });
    expect(getExperienceSurfaceDefinition('hotspot')).toMatchObject({
      anchor: 'target',
      ariaRole: 'button',
      backdrop: false,
      focus: 'roving',
      resizable: false,
    });
  });
});
