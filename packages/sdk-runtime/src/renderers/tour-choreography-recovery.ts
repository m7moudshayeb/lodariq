import { runtimeText } from '../i18n';

export interface TourChoreographyRecoveryActions {
  dismiss: () => void;
  retry: () => void;
  skip: () => void;
}

export function showTourChoreographyRecovery(
  card: HTMLElement,
  actions: TourChoreographyRecoveryActions,
): void {
  removeTourChoreographyRecovery(card);
  const region = card.ownerDocument.createElement('div');
  region.className = 'tour-choreography-recovery';
  region.setAttribute('role', 'status');
  const message = card.ownerDocument.createElement('p');
  message.textContent = runtimeText('This step could not continue.');
  region.appendChild(message);
  region.append(
    recoveryButton(card.ownerDocument, runtimeText('Try again'), actions.retry),
    recoveryButton(card.ownerDocument, runtimeText('Skip step'), actions.skip),
    recoveryButton(card.ownerDocument, runtimeText('Exit tour'), actions.dismiss),
  );
  card.querySelector('.tour-content')?.appendChild(region);
  region.querySelector<HTMLButtonElement>('button')?.focus();
}

export function removeTourChoreographyRecovery(card: HTMLElement): void {
  card.querySelector('.tour-choreography-recovery')?.remove();
}

function recoveryButton(document: Document, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}
