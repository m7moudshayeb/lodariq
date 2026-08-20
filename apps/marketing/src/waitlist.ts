/**
 * Pre-launch waitlist form. With `VITE_WAITLIST_ENDPOINT` configured it POSTs
 * `{ email, source }` there; without one it opens a prefilled email draft so
 * a request is never silently dropped while the product is unreleased.
 */
import { WAITLIST_CONTACT_EMAIL, WAITLIST_ENDPOINT } from './config';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type WaitlistState = 'idle' | 'submitting' | 'done' | 'invalid' | 'failed';

const MESSAGE_COPY: Record<Exclude<WaitlistState, 'idle'>, string> = {
  submitting: 'Sending…',
  done: 'You are on the list. One email when it is your turn — nothing else.',
  invalid: 'That does not look like an email address.',
  failed: 'That did not go through. Please try again in a moment.',
};

export function mountWaitlist(form: HTMLFormElement): void {
  const input = form.querySelector<HTMLInputElement>('input[type="email"]');
  const message = form.querySelector<HTMLElement>('[data-waitlist-message]');
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!input || !message || !submit) throw new Error('Waitlist markup is incomplete');

  const setState = (state: WaitlistState): void => {
    form.dataset['state'] = state;
    message.textContent = state === 'idle' ? '' : MESSAGE_COPY[state];
    submit.disabled = state === 'submitting' || state === 'done';
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = input.value.trim();
    if (!EMAIL_PATTERN.test(email)) {
      setState('invalid');
      input.focus();
      return;
    }
    void submitEmail(email, setState);
  });

  input.addEventListener('input', () => {
    if (form.dataset['state'] === 'invalid') setState('idle');
  });
}

async function submitEmail(email: string, setState: (state: WaitlistState) => void): Promise<void> {
  if (!WAITLIST_ENDPOINT) {
    // No backend yet: hand off to the visitor's own mail client, visibly.
    const subject = encodeURIComponent('Lodariq early access');
    const body = encodeURIComponent(`Please add ${email} to the Lodariq waitlist.`);
    window.location.href = `mailto:${WAITLIST_CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    setState('done');
    return;
  }
  setState('submitting');
  try {
    const response = await fetch(WAITLIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'lodariq.io' }),
    });
    setState(response.ok ? 'done' : 'failed');
  } catch {
    setState('failed');
  }
}
