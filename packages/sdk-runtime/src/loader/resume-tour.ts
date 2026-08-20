import type { CompiledDocument, ManifestPointer, SdkInstallContext } from '@lodariq/schema';
import type { LodariqRuntime } from '../runtime';
import type { TourPlaybackOptions } from './contracts';
import { resumeArrivingHandoff } from './arriving-handoff';

type ResumeState = NonNullable<ReturnType<LodariqRuntime['readTourResume']>>;
type LoadCurrentTour = (
  manifest: ManifestPointer,
  context: SdkInstallContext,
) => Promise<CompiledDocument>;

/**
 * Picking the tour back up after an interruption — a same-tab navigation, or a
 * handoff from another application. Both live here so the bootstrap pays for one
 * lazy import instead of two, and neither joins the sub-3 KiB critical graph.
 *
 * A handoff token names a step explicitly, so it outranks whatever this origin
 * happened to remember.
 */
export async function continueInterruptedTour(
  resume: ResumeState | null,
  runtime: LodariqRuntime,
  manifest: ManifestPointer,
  context: SdkInstallContext,
  loadCurrentTour: LoadCurrentTour | undefined,
  playTour: (document: CompiledDocument, options?: TourPlaybackOptions) => Promise<void>,
): Promise<void> {
  const handedOff = await resumeArrivingHandoff(
    runtime,
    manifest,
    context,
    loadCurrentTour,
    playTour,
  );
  if (handedOff || !resume) return;
  await resumePendingTour(resume, runtime, manifest, context, loadCurrentTour, playTour);
}

async function resumePendingTour(
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
