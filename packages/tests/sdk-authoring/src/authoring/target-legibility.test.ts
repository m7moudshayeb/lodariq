// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  countLookAlikes,
  describeTarget,
  pickBigger,
  pickSmaller,
  targetBreadcrumb,
} from '../../../../../packages/sdk-authoring/src/bridge/targeting/legibility';
import {
  targetVerificationPresentation,
  targetVerificationState,
} from '../../../../../packages/sdk-authoring/src/authoring/target-verification';

function render(html: string): void {
  document.body.innerHTML = html;
}

describe('target description (§4.4)', () => {
  beforeEach(() => render(''));

  it('names what the thing is in plain language, never a tag or selector', () => {
    render('<button aria-label="Create project">＋</button>');
    const description = describeTarget(document.querySelector('button')!);
    expect(description.kind).toBe('Button');
    expect(description.name).toBe('Create project');
    // No selector, no tag name, no DOM depth may appear (ADR-0016).
    expect(JSON.stringify(description)).not.toContain('button>');
    expect(Object.keys(description)).not.toContain('selector');
  });

  it('describes containers as areas rather than elements', () => {
    render('<nav><a href="#">Projects</a></nav><article>Card body</article>');
    expect(describeTarget(document.querySelector('nav')!).kind).toBe('Navigation');
    expect(describeTarget(document.querySelector('article')!).kind).toBe('Card');
  });

  it('carries the size, because a creator picks by box as much as by name', () => {
    render('<button>Go</button>');
    const button = document.querySelector('button')!;
    button.getBoundingClientRect = () => new DOMRect(10, 20, 120, 44);
    const description = describeTarget(button);
    expect(description.widthPx).toBe(120);
    expect(description.heightPx).toBe(44);
  });
});

describe('look-alike count (§4.4)', () => {
  beforeEach(() => render(''));

  it('reports 1 of 1 when the target is unique', () => {
    render('<button aria-label="Create project">＋</button><button aria-label="Import">↑</button>');
    const count = countLookAlikes(document.querySelector('[aria-label="Create project"]')!);
    expect(count).toEqual({ index: 1, total: 1, byName: true });
  });

  it('counts the look-alikes and says which one this is', () => {
    render(
      '<button>Create project</button><button>Create project</button><button>Create project</button>',
    );
    const buttons = [...document.querySelectorAll('button')];
    expect(countLookAlikes(buttons[1]!)).toEqual({ index: 2, total: 3, byName: true });
  });

  it('is pessimistic when there is no name: role alone', () => {
    render('<button></button><button></button>');
    const count = countLookAlikes(document.querySelectorAll('button')[0]!);
    expect(count.total).toBe(2);
    expect(count.byName).toBe(false);
  });
});

describe('ancestor breadcrumb (§4.4)', () => {
  beforeEach(() => render(''));

  it('reads outermost first, in plain language, ending at the element', () => {
    render(`
      <nav><div role="toolbar" aria-label="Project actions">
        <button aria-label="Create project">＋</button>
      </div></nav>
    `);
    const crumbs = targetBreadcrumb(document.querySelector('button')!);
    expect(crumbs.map((crumb) => crumb.label)).toEqual([
      'Navigation',
      '“Project actions” toolbar',
      '“Create project” button',
    ]);
    expect(crumbs[0]?.label).toBe('Navigation');
    expect(crumbs[crumbs.length - 1]?.label).toContain('Create project');
    expect(crumbs[crumbs.length - 1]?.element.tagName).toBe('BUTTON');
    // Every crumb is a real element, so each one can be clicked and previewed.
    for (const crumb of crumbs) expect(crumb.element).toBeInstanceOf(Element);
  });

  it('skips generic wrappers that are not worth a crumb', () => {
    render('<nav><span><span><button>Go</button></span></span></nav>');
    const labels = targetBreadcrumb(document.querySelector('button')!).map((crumb) => crumb.label);
    expect(labels.filter((label) => label === 'Element')).toHaveLength(0);
  });

  it('keeps the outermost and the nearest crumbs when the trail is long', () => {
    render(`
      <nav><section><article><form><table><button>Go</button></table></form></article></section></nav>
    `);
    const crumbs = targetBreadcrumb(document.querySelector('button')!, 4);
    expect(crumbs).toHaveLength(4);
    expect(crumbs[0]?.label).toBe('Navigation');
    expect(crumbs[crumbs.length - 1]?.element.tagName).toBe('BUTTON');
  });

  it('stops at the page body rather than crumbing the document itself', () => {
    render('<nav><button>Go</button></nav>');
    const crumbs = targetBreadcrumb(document.querySelector('button')!);
    expect(crumbs.map((crumb) => crumb.element.tagName)).toEqual(['NAV', 'BUTTON']);
  });
});

describe('pick bigger and smaller (§4.4)', () => {
  beforeEach(() => render(''));

  it('walks one level up, skipping generic wrappers', () => {
    render('<nav><span><button>Go</button></span></nav>');
    const bigger = pickBigger(document.querySelector('button')!);
    expect(bigger?.tagName).toBe('NAV');
  });

  it('stops at the page rather than selecting the whole document', () => {
    render('<button>Go</button>');
    expect(pickBigger(document.body)).toBeNull();
    expect(pickBigger(document.querySelector('button')!)).toBeNull();
  });

  it('walks down to the largest child worth picking', () => {
    render('<section><span>x</span><div id="big">wide</div></section>');
    const section = document.querySelector('section')!;
    const big = document.getElementById('big')!;
    big.getBoundingClientRect = () => new DOMRect(0, 0, 300, 40);
    const smaller = pickSmaller(section);
    expect(smaller?.id).toBe('big');
  });

  it('returns null when there is nothing smaller', () => {
    render('<button>Go</button>');
    expect(pickSmaller(document.querySelector('button')!)).toBeNull();
  });
});

describe('three verification states (audit #2)', () => {
  it('treats "not on this screen right now" as Needs context, not a failure', () => {
    expect(targetVerificationState('unavailable_current_context')).toBe('needs-context');
    expect(targetVerificationState('unverified')).toBe('needs-context');
  });

  it('reserves Can’t find for failed evidence gates', () => {
    expect(targetVerificationState('missing')).toBe('cannot-find');
    expect(targetVerificationState('drifted')).toBe('cannot-find');
    expect(targetVerificationState('ambiguous')).toBe('cannot-find');
  });

  it('states a meaning and an action for every state', () => {
    for (const presentation of [
      'verified',
      'checking',
      'unavailable_current_context',
      'unverified',
      'ambiguous',
      'drifted',
      'missing',
    ] as const) {
      const shown = targetVerificationPresentation(presentation);
      expect(shown.label.length).toBeGreaterThan(0);
      expect(shown.meaning.length).toBeGreaterThan(0);
      expect(shown.action.length).toBeGreaterThan(0);
      // A tone is never the only carrier of meaning.
      expect(['positive', 'attention', 'danger', 'muted']).toContain(shown.tone);
    }
  });

  it('never says "verification failed" for a context miss', () => {
    const shown = targetVerificationPresentation('unavailable_current_context');
    expect(shown.label).toBe('Needs context');
    expect(shown.meaning.toLowerCase()).not.toContain('failed');
  });
});
