import { runtimeText } from '../i18n';

export class TourPresentationCanceledError extends Error {
  constructor(message = runtimeText('Lodariq tour presentation was canceled')) {
    super(message);
    this.name = 'TourPresentationCanceledError';
  }
}

export class TourPresentationUnavailableError extends Error {
  constructor(message = runtimeText('Lodariq tour presentation is unavailable')) {
    super(message);
    this.name = 'TourPresentationUnavailableError';
  }
}

export function throwIfTourPresentationCanceled(signal: AbortSignal): void {
  if (signal.aborted) throw new TourPresentationCanceledError();
}
