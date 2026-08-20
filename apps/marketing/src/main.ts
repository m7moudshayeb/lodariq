import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './styles.css';
import { mountDemo } from './demo/demo-controller';
import { mountWaitlist } from './waitlist';

const demo = document.querySelector<HTMLElement>('[data-demo]');
if (demo) mountDemo(demo);

const waitlistForm = document.querySelector<HTMLFormElement>('[data-waitlist]');
if (waitlistForm) mountWaitlist(waitlistForm);

wireCopyButtons();
wireHeaderShade();
wireReveals();

/** Copy-to-clipboard for the install snippet. */
function wireCopyButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy-target]')) {
    button.addEventListener('click', () => {
      const source = document.querySelector(button.dataset['copyTarget'] ?? '');
      if (!source?.textContent) return;
      void navigator.clipboard.writeText(source.textContent.trim()).then(() => {
        const label = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => {
          button.textContent = label;
        }, 1600);
      });
    });
  }
}

/** Hairline under the header once the page has scrolled. */
function wireHeaderShade(): void {
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!header) return;
  const update = (): void => {
    header.dataset['scrolled'] = window.scrollY > 8 ? 'true' : 'false';
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

/** Quiet entrance for below-the-fold sections; skipped under reduced motion. */
function wireReveals(): void {
  const revealables = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealables.forEach((element) => {
      element.dataset['reveal'] = 'shown';
    });
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset['reveal'] = 'shown';
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '-40px' },
  );
  revealables.forEach((element) => observer.observe(element));
}
