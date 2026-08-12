import { describe, expect, it, vi } from 'vitest';
import { LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1, type BrandThemeSnapshot } from '@lodariq/schema';
import { BrandDriftRuntimePreviewSession } from '../../../../../packages/sdk-authoring/src/authoring/brand-drift-runtime-preview';

describe('host Brand drift runtime preview lifecycle', () => {
  it('does not touch an existing Product Match preview until drift preview is activated', async () => {
    let previewTheme: BrandThemeSnapshot | undefined = theme('d');
    const playPreviewTheme = vi.fn(async (nextTheme: BrandThemeSnapshot | undefined) => {
      previewTheme = cloneTheme(nextTheme);
    });
    const session = new BrandDriftRuntimePreviewSession({
      readPreviewTheme: () => cloneTheme(previewTheme),
      playPreviewTheme,
    });

    await session.replaceRuntimePreview(runtimePreview());
    await session.restore();
    session.clear();

    expect(playPreviewTheme).not.toHaveBeenCalled();
    expect(previewTheme?.contentHash).toBe(hash('d'));
    expect(session.isActive()).toBe(false);
  });

  it('restores the exact pre-drift Product Match theme after proposed preview and recheck', async () => {
    let previewTheme: BrandThemeSnapshot | undefined = theme('d');
    const playedHashes: Array<string | undefined> = [];
    const session = new BrandDriftRuntimePreviewSession({
      readPreviewTheme: () => cloneTheme(previewTheme),
      playPreviewTheme: async (nextTheme) => {
        previewTheme = cloneTheme(nextTheme);
        playedHashes.push(nextTheme?.contentHash);
      },
    });

    await session.replaceRuntimePreview(runtimePreview('a', 'b'));
    await session.preview('proposed');
    expect(previewTheme?.contentHash).toBe(hash('b'));

    await session.replaceRuntimePreview(runtimePreview('a', 'c'));

    expect(playedHashes).toEqual([hash('b'), hash('d')]);
    expect(previewTheme?.contentHash).toBe(hash('d'));
    expect(session.isActive()).toBe(false);
  });

  it('restores the exact pre-drift theme when compiling the proposed preview fails', async () => {
    let previewTheme: BrandThemeSnapshot | undefined = theme('d');
    const playedHashes: Array<string | undefined> = [];
    const session = new BrandDriftRuntimePreviewSession({
      readPreviewTheme: () => cloneTheme(previewTheme),
      playPreviewTheme: async (nextTheme) => {
        previewTheme = cloneTheme(nextTheme);
        playedHashes.push(nextTheme?.contentHash);
        if (nextTheme?.contentHash === hash('b')) throw new Error('compile failed');
      },
    });
    await session.replaceRuntimePreview(runtimePreview('a', 'b'));

    await expect(session.preview('proposed')).rejects.toThrow('compile failed');

    expect(playedHashes).toEqual([hash('b'), hash('d')]);
    expect(previewTheme?.contentHash).toBe(hash('d'));
    expect(session.isActive()).toBe(false);
  });
});

function runtimePreview(currentCharacter = 'a', proposedCharacter = 'b') {
  return {
    currentTheme: theme(currentCharacter),
    proposedTheme: theme(proposedCharacter),
  };
}

function theme(character: string): BrandThemeSnapshot {
  return {
    ...structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1),
    themeVersionId: `themev_${character}`,
    contentHash: hash(character),
  };
}

function hash(character: string): `sha256-${string}` {
  return `sha256-${character.repeat(64)}`;
}

function cloneTheme(theme: BrandThemeSnapshot | undefined): BrandThemeSnapshot | undefined {
  return theme ? structuredClone(theme) : undefined;
}
