import type { CompiledDocument, ManifestPointer, SdkInstallContext } from '@lodariq/schema';
import type { TourPlaybackOptions } from './contracts';
import {
  readJourneyHandoffFromLocation,
  resumeStepIdFor,
  stripJourneyHandoffParam,
} from '../journey-handoff';

type LoadCurrentTour = (
  manifest: ManifestPointer,
  context: SdkInstallContext,
) => Promise<CompiledDocument>;

/**
 * The receiving half of a cross-application handoff. Runs before the ordinary
 * `sessionStorage` resume so an arriving visitor sees the step they were sent
 * to rather than whatever this origin happened to remember.
 *
 * The token is consumed whether or not it plays: leaving it in the address bar
 * would replay someone else's progress on the next visit, or on a share.
 */
export async function resumeArrivingHandoff(
  runtime: { clearTourResume(): void },
  manifest: ManifestPointer,
  context: SdkInstallContext,
  loadCurrentTour: LoadCurrentTour | undefined,
  playTour: (document: CompiledDocument, options?: TourPlaybackOptions) => Promise<void>,
): Promise<boolean> {
  const token = readJourneyHandoffFromLocation(window.location.href, Date.now());
  if (!token) return false;
  consumeToken();
  if (!loadCurrentTour) return false;

  try {
    const tour = await loadCurrentTour(manifest, context);
    if (!tour || !Array.isArray(tour.steps) || tour.documentId !== token.documentId) return false;
    // A destination on a different version resumes onto a step that may have
    // moved, so it restarts rather than guessing.
    const stepIds = tour.steps.map((step) => step.id);
    const stepId =
      tour.contentHash === token.contentHash ? resumeStepIdFor(token, stepIds) : stepIds[0];
    if (!stepId) return false;
    runtime.clearTourResume();
    await playTour(tour, { initialStepId: stepId });
    return true;
  } catch {
    return false;
  }
}

function consumeToken(): void {
  try {
    const cleaned = stripJourneyHandoffParam(window.location.href);
    if (cleaned !== window.location.href) window.history.replaceState(null, '', cleaned);
  } catch {
    /* A host that blocks history rewriting must not break playback. */
  }
}
