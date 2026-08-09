import type { CompiledDocument, ManifestPointer, SdkInstallContext } from '@lodariq/schema';
import type { LodariqRuntime } from '../runtime';
import type { TourPlaybackOptions } from './contracts';

type ResumeState = NonNullable<ReturnType<LodariqRuntime['readTourResume']>>;
type LoadCurrentTour = (
  manifest: ManifestPointer,
  context: SdkInstallContext,
) => Promise<CompiledDocument>;

/** Same-tab navigation recovery stays outside the sub-3 KiB bootstrap graph. */
export async function resumePendingTour(
  resume: ResumeState,
  runtime: LodariqRuntime,
  manifest: ManifestPointer,
  context: SdkInstallContext,
  loadCurrentTour: LoadCurrentTour | undefined,
  playTour: (document: CompiledDocument, options?: TourPlaybackOptions) => Promise<void>,
): Promise<void> {
  if (!loadCurrentTour) {
    runtime.clearTourResume();
    return;
  }

  try {
    const tour = await loadCurrentTour(manifest, context);
    if (
      !tour ||
      typeof tour !== 'object' ||
      typeof tour.documentId !== 'string' ||
      !Array.isArray(tour.steps)
    ) {
      throw new Error('Invalid compiled delivery JSON');
    }
    if (!runtime.canResumeTour(resume, tour)) {
      runtime.clearTourResume();
      return;
    }
    await playTour(tour, { initialStepId: resume.stepId });
  } catch (error) {
    if (!(error instanceof Error && error.name === 'LodariqArtifactCompatibilityError')) {
      runtime.clearTourResume();
    }
  }
}
