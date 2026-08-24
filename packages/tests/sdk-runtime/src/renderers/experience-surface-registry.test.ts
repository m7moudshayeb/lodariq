import { describe, expect, it } from 'vitest';
import {
  getExperienceSurfaceDefinition,
  listExperienceSurfaceDefinitions,
} from '../../../../../packages/sdk-runtime/src/renderers/experience-surface-registry';

describe('experience surface registry', () => {
  it('registers every compiled experience surface as an explicit capability', () => {
    expect(listExperienceSurfaceDefinitions().map(({ kind }) => kind)).toEqual([
      'popup',
      'modal',
      'hotspot',
      'banner',
      'slideIn',
      'drawer',
      'floating',
    ]);
  });

  it('keeps persistent and edge surfaces modeless', () => {
    for (const kind of ['banner', 'slideIn', 'drawer', 'floating'] as const) {
      expect(getExperienceSurfaceDefinition(kind)).toMatchObject({
        anchor: 'viewport',
        ariaRole: 'dialog',
        backdrop: false,
      });
    }
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
