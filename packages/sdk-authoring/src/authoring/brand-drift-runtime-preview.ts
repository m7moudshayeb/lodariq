import type { AuthoringBrandDriftCheckResult, BrandThemeSnapshot } from '@lodariq/schema';

export type BrandDriftRuntimePreviewMode = 'current' | 'proposed';

type RuntimePreview = NonNullable<AuthoringBrandDriftCheckResult['runtimePreview']>;

export interface BrandDriftRuntimePreviewServices {
  readPreviewTheme: () => BrandThemeSnapshot | undefined;
  playPreviewTheme: (theme: BrandThemeSnapshot | undefined) => Promise<void>;
}

/**
 * Owns the temporary Brand-drift preview overlay. The theme that was already
 * active on the host page is captured once and restored exactly; it may be a
 * mutable Product Match draft and must not be replaced by an initial snapshot.
 */
export class BrandDriftRuntimePreviewSession {
  private runtimePreview: RuntimePreview | undefined;
  private previousTheme: BrandThemeSnapshot | undefined;
  private active = false;

  constructor(private readonly services: BrandDriftRuntimePreviewServices) {}

  isActive(): boolean {
    return this.active;
  }

  async replaceRuntimePreview(runtimePreview: RuntimePreview | undefined): Promise<void> {
    await this.restore();
    this.runtimePreview = runtimePreview ? structuredClone(runtimePreview) : undefined;
  }

  /** Clear drift-owned state when another explicit workflow takes ownership. */
  clear(): void {
    this.runtimePreview = undefined;
    this.previousTheme = undefined;
    this.active = false;
  }

  async preview(mode: BrandDriftRuntimePreviewMode): Promise<void> {
    const requestedTheme = this.requestedTheme(mode);
    if (!requestedTheme) {
      throw new Error('Lodariq Brand drift runtime preview is unavailable');
    }
    if (!this.active) {
      const currentTheme = this.services.readPreviewTheme();
      this.previousTheme = currentTheme ? structuredClone(currentTheme) : undefined;
      this.active = true;
    }
    try {
      await this.services.playPreviewTheme(structuredClone(requestedTheme));
    } catch (error) {
      await this.restoreAfterFailure();
      throw error;
    }
  }

  async restore(): Promise<void> {
    if (!this.active) return;
    const previousTheme = this.takePreviousTheme();
    await this.services.playPreviewTheme(previousTheme);
  }

  private requestedTheme(mode: BrandDriftRuntimePreviewMode): BrandThemeSnapshot | undefined {
    const runtimePreview = this.runtimePreview;
    if (!runtimePreview) return undefined;
    return mode === 'proposed' ? runtimePreview.proposedTheme : runtimePreview.currentTheme;
  }

  private takePreviousTheme(): BrandThemeSnapshot | undefined {
    const previousTheme = this.previousTheme ? structuredClone(this.previousTheme) : undefined;
    this.previousTheme = undefined;
    this.active = false;
    return previousTheme;
  }

  private async restoreAfterFailure(): Promise<void> {
    const previousTheme = this.takePreviousTheme();
    try {
      await this.services.playPreviewTheme(previousTheme);
    } catch {
      // The host theme value is still restored before compilation is attempted.
    }
  }
}
