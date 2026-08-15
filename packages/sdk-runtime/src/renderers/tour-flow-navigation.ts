import type { StepTransitionDestination } from '@lodariq/schema';

export interface TourFlowNavigation {
  complete: () => void;
  dismiss: () => void;
  goToStep: (stepId: string) => void;
  next: () => void;
}

export function runTourFlowDestination(
  destination: StepTransitionDestination,
  navigation: TourFlowNavigation,
): void {
  if (destination.type === 'next') navigation.next();
  else if (destination.type === 'complete') navigation.complete();
  else if (destination.type === 'dismiss') navigation.dismiss();
  else navigation.goToStep(destination.stepId);
}
