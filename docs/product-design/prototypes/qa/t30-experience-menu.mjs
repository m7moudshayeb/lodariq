/**
 * The experiences menu, on both surfaces (§3.3).
 *
 * Drives the launcher's palette and the panel's mode-pill menu against a seeded
 * index, and checks the things that are easy to get wrong and invisible in a
 * unit test: which side the flyout lands on, that the list pages instead of
 * loading everything, that "On this page" stacks above a complete "All tours"
 * with the second collapsed and counted, that naming happens before the
 * document exists, and that the type switch says what it is about to do.
 *
 * Needs a fixture host. Point SDK_PORT at one that is already running.
 *
 *   node docs/product-design/prototypes/qa/t30-experience-menu.mjs
 *   SDK_PORT=5176 SHOT=1 node docs/product-design/prototypes/qa/t30-experience-menu.mjs
 */
import { join } from 'node:path';
import { chromium, outDir } from './env.mjs';

const PORT = process.env.SDK_PORT ?? '5176';
const SEED = Number(process.env.SEED ?? '24');
const out = outDir('experience-menu');
const shots = process.env.SHOT !== '0';

const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 200));
});

const failures = [];
const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(name);
};
const shot = async (name) => {
  if (shots) await page.screenshot({ path: join(out, `${name}.png`) });
};

await page.goto(`http://localhost:${PORT}/`);
await page.waitForSelector('[data-lodariq-creator-launcher="true"]', { timeout: 15_000 });
await page.waitForTimeout(1200);

await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();
await page.waitForSelector('[data-lodariq-creator-launcher="true"]', { timeout: 15_000 });
await page.waitForTimeout(1200);

const menuState = () =>
  page.evaluate(() => {
    const menu = document.querySelector('[data-lodariq-experience-menu="true"]');
    if (!menu) return { present: false };
    const rect = menu.getBoundingClientRect();
    return {
      present: true,
      hidden: menu.hidden,
      side: menu.dataset.lodariqSide ?? menu.dataset.side ?? null,
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      inViewport:
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth,
      width: Math.round(rect.width),
      role: menu.getAttribute('role'),
      heading: menu.querySelector('.lodariq-experience-menu-head strong')?.textContent ?? '',
      hasSearch: Boolean(menu.querySelector('input[type="search"]')),
      rows: menu.querySelectorAll('[data-experience-row]').length,
      experienceRows: menu.querySelectorAll('[data-lodariq-experience-id]').length,
      scopes: [...menu.querySelectorAll('[data-experience-scope-head]')].map((head) => {
        const list = menu.querySelector(`#${CSS.escape(head.getAttribute('aria-controls') ?? '')}`);
        return {
          scope: head.dataset.experienceScopeHead,
          label: (head.querySelector('strong')?.textContent ?? '').trim(),
          expanded: head.getAttribute('aria-expanded'),
          count: (
            head.querySelector('.lodariq-experience-menu-scope-count')?.textContent ?? ''
          ).trim(),
          hidden: list ? list.hidden : null,
          rows: list ? list.querySelectorAll('[data-lodariq-experience-id]').length : 0,
          ids: list
            ? [...list.querySelectorAll('[data-lodariq-experience-id]')].map(
                (node) => node.dataset.lodariqExperienceId,
              )
            : [],
          pages: list
            ? [...list.querySelectorAll('.lodariq-experience-menu-copy small')].map(
                (node) => node.textContent,
              )
            : [],
          // A collapsed list is display:none, not just `hidden` on the element:
          // the class sets display:flex, which would win over the UA default.
          shown: list ? getComputedStyle(list).display !== 'none' : null,
        };
      }),
      text: (menu.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    };
  });

/*
 * Real pointer movement, never a synthesised MouseEvent.
 *
 * A dispatched 'mouseenter' is delivered straight to the element and ignores
 * `pointer-events` entirely. The panel's shadow root is pointer-events:none at
 * the host — every piece of chrome opts back in by name — and a menu mounted
 * there without opting in received no mouse events at all: it could not be
 * hovered, so the grace timer that holds it open while the pointer crosses the
 * gap never got cancelled, and its rows could not be clicked either. Synthetic
 * events passed that build cleanly. These helpers would not have.
 */
const centreOf = async (selector, { deep = false } = {}) =>
  page.evaluate(
    ([sel, searchShadow]) => {
      const found = [];
      const walk = (root) => {
        for (const node of root.querySelectorAll(sel)) found.push(node);
        if (!searchShadow) return;
        for (const node of root.querySelectorAll('*')) if (node.shadowRoot) walk(node.shadowRoot);
      };
      walk(document);
      const target = found.find((node) => node.getBoundingClientRect().width > 0);
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
    [selector, deep],
  );

const hoverReal = async (selector, options) => {
  const point = await centreOf(selector, options);
  if (!point) throw new Error(`nothing to hover: ${selector}`);
  await page.mouse.move(point.x, point.y, { steps: 8 });
  await page.waitForTimeout(500);
  return point;
};

const clickReal = async (selector, options) => {
  const point = await centreOf(selector, options);
  if (!point) throw new Error(`nothing to click: ${selector}`);
  await page.mouse.move(point.x, point.y, { steps: 6 });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(500);
  return point;
};

/** Walks the pointer from wherever it is into the open flyout, as a hand would. */
const walkIntoFlyout = async (from) => {
  const box = await page.evaluate(() => {
    const found = [];
    const walk = (root) => {
      for (const node of root.querySelectorAll('[data-lodariq-experience-menu="true"]')) {
        found.push(node);
      }
      for (const node of root.querySelectorAll('*')) if (node.shadowRoot) walk(node.shadowRoot);
    };
    walk(document);
    const menu = found.find((node) => !node.hidden);
    if (!menu) return null;
    const rect = menu.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + 40 };
  });
  if (!box) return false;
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(
      from.x + ((box.x - from.x) * step) / 12,
      from.y + ((box.y - from.y) * step) / 12,
    );
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(400);
  return true;
};

const hoverAction = async (actionId) =>
  hoverReal(`[data-lodariq-launcher-action-id="${actionId}"]`);

// ── 1. The launcher's palette ────────────────────────────────────────────────
await clickReal('[data-lodariq-creator-toolbar="true"]');

const actionPoint = await hoverAction('new-experience');
let state = await menuState();
check('hover opens the type list', state.present && !state.hidden, state.heading);
check('type list has all five types', state.rows === 5, `${state.rows} rows`);
check('type list is not searchable', !state.hasSearch);
const launcherBox = await page.evaluate(() => {
  const rect = document
    .querySelector('[data-lodariq-creator-launcher="true"]')
    ?.getBoundingClientRect();
  return rect ? { left: Math.round(rect.left) } : null;
});
check(
  'flyout opens to the left of a bottom-right launcher',
  state.side === 'left' && state.right <= (launcherBox?.left ?? 0) + 8,
  `side=${state.side} right=${state.right} launcherLeft=${launcherBox?.left}`,
);
await shot('01-launcher-types');

// The move a hand makes next, and the one that used to kill it.
await walkIntoFlyout(actionPoint);
check(
  'the menu survives the pointer moving onto it',
  (await menuState()).hidden === false,
  'the row is left behind before the menu is reached',
);

// ── 2. Naming comes before the document ──────────────────────────────────────
await clickReal('[data-lodariq-experience-type="tour"]');
const dialog = await page.evaluate(() => {
  const scrim = document.querySelector('[data-lodariq-experience-dialog-scrim="true"]');
  if (!scrim) return { present: false };
  const input = scrim.querySelector('input');
  return {
    present: true,
    value: input?.value ?? null,
    focused: document.activeElement === input || scrim.contains(document.activeElement),
    text: (scrim.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
  };
});
check('choosing a type asks for a name first', dialog.present, dialog.text);
check('the name field is pre-filled', dialog.value === 'Untitled Tour', String(dialog.value));
await shot('02-name-dialog');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check(
  'cancelling keeps the type list open',
  (await menuState()).hidden === false,
  'the chosen type is not thrown away',
);

// ── 3. The list: paged, searchable, index-only ───────────────────────────────
/*
 * Seeded here, not at load, and against the key the SDK is using right now.
 *
 * A host that routes on boot — SocialHub sends `/` to `/login` a second and a
 * half in — is on a different key by the time anything reads the index, and a
 * key sampled too early files all twenty-four rows under a page this run is no
 * longer on, which reads as an empty first scope: a true reading of a wrong
 * fixture. By this point the script has spent several seconds driving the
 * palette, so the routing has settled.
 *
 * Title and type only, and no matching documents: a row must render from the
 * index alone. If listing still loaded each document these would resolve to
 * null and the list would come back empty.
 */
const routeKey = await page.evaluate(() => `${window.location.pathname}${window.location.hash}`);
await page.evaluate(
  ([count, here]) => {
    const entries = Array.from({ length: count }, (_, index) => ({
      documentId: `doc_seed_${index}`,
      routeKey: here,
      title: index === 0 ? 'Welcome walkthrough' : `Seeded tour ${index}`,
      type: 'tour',
    }));
    /*
     * Three more, filed under pages this run never visits.
     *
     * Two documents, three entries: the last is the same document as the first,
     * filed twice, as it is the moment a creator opens one tour from a second
     * screen. "All tours" repeats what is on this page — that is the point of a
     * shortcut above a complete list — but it still prints one row per tour.
     */
    entries.push(
      { documentId: 'doc_other_a', routeKey: '/billing', title: 'Invoice tour', type: 'tour' },
      {
        documentId: 'doc_other_b',
        routeKey: '/reports#monthly',
        title: 'Reports tour',
        type: 'tour',
      },
      { documentId: 'doc_other_a', routeKey: '/archive', title: 'Invoice tour', type: 'tour' },
    );
    localStorage.setItem('lodariq:creator-index:wk_local_dev', JSON.stringify(entries));
  },
  [SEED, routeKey],
);
console.log(`seeded ${SEED + 3} entries against ${routeKey}`);

await hoverAction('experiences-on-page');
await page.waitForTimeout(700);
state = await menuState();
check('hover opens the experiences list', state.present && !state.hidden, state.heading);
check('the list is searchable', state.hasSearch);
check(
  'rows render from the index without loading documents',
  state.experienceRows > 0,
  `${state.experienceRows} of ${SEED} seeded, no documents exist`,
);
check(
  'the list pages rather than rendering everything',
  state.experienceRows < SEED,
  `${state.experienceRows} rendered of ${SEED}`,
);
check(
  'the second scope is not paged while it is closed',
  (state.scopes?.[0]?.rows ?? 0) < SEED,
  `${state.scopes?.[0]?.rows} rows open, ${state.scopes?.[1]?.rows} closed`,
);
// It is placed while it still says "Loading…" and then grows ten rows taller,
// so the clamp has to run again once the rows land.
check(
  'the grown list is still inside the viewport',
  state.inViewport,
  `top=${state.top} bottom=${state.bottom} (viewport 900)`,
);

// ── 3b. Two scopes: this page, then the whole workspace ──────────────────────
const [onPage, elsewhere] = state.scopes ?? [];
check(
  'the list is two scopes, this page first',
  state.scopes?.length === 2 && onPage?.scope === 'page' && elsewhere?.scope === 'all',
  JSON.stringify(state.scopes?.map((scope) => [scope.scope, scope.label])),
);
check(
  'the first is open and the second is collapsed',
  onPage?.expanded === 'true' && elsewhere?.expanded === 'false' && elsewhere?.shown === false,
  `page=${onPage?.expanded} other=${elsewhere?.expanded} shown=${elsewhere?.shown}`,
);
// The reason to load a collapsed list at all: without the count it is a header
// with nothing behind it as far as anyone can tell. It counts the workspace —
// everything above it plus the two elsewhere — from one page of rows.
check(
  'the collapsed scope counts the whole workspace from one page of rows',
  elsewhere?.count === String(SEED + 2) && elsewhere?.rows < SEED,
  `count=${elsewhere?.count} of ${SEED + 2} documents, ${elsewhere?.rows} rows held`,
);
// One row per tour, not one per screen it was ever opened from: doc_other_a is
// filed under two pages and 27 entries have to come back as 26 rows.
check(
  'a document filed under two pages is still one tour',
  new Set(elsewhere?.ids).size === elsewhere?.ids?.length,
  `${elsewhere?.ids?.length} rows, ${new Set(elsewhere?.ids).size} distinct`,
);
// The repeat across the two lists is the point, and the reason every row in the
// second names its page: without it the same title appears twice with nothing
// to tell the two apart.
check(
  'it repeats this page and says so on every row',
  elsewhere?.ids?.[0] === onPage?.ids?.[0] &&
    elsewhere?.pages?.length === elsewhere?.rows &&
    new Set(elsewhere?.pages).size === 1 &&
    elsewhere?.pages?.[0] === routeKey &&
    onPage?.pages?.length === 0,
  `${elsewhere?.pages?.length} of ${elsewhere?.rows} rows say ${elsewhere?.pages?.[0]}, vs ${onPage?.pages?.length} in the open list`,
);
// The reachability half, and the reason each open section scrolls in its own
// bounds: with one scroller the first list's rows push this header off the
// bottom, and scrolling toward it loads ten more rows in front of it.
const headerOnScreen = await page.evaluate(() => {
  const head = document.querySelector('[data-experience-scope-head="all"]');
  const menu = document.querySelector('[data-lodariq-experience-menu="true"]');
  if (!head || !menu) return null;
  const headRect = head.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  return { bottom: Math.round(headRect.bottom), menuBottom: Math.round(menuRect.bottom) };
});
check(
  'the second header stays on screen while the first list pages',
  headerOnScreen !== null && headerOnScreen.bottom <= headerOnScreen.menuBottom,
  `header bottom=${headerOnScreen?.bottom}, menu bottom=${headerOnScreen?.menuBottom}`,
);
await clickReal('[data-experience-scope-head="all"]');
const expanded = (await menuState()).scopes?.[1];
check(
  'clicking the header opens it',
  expanded?.expanded === 'true' && expanded?.shown === true,
  `expanded=${expanded?.expanded} shown=${expanded?.shown}`,
);
await shot('03b-experiences-scopes');
await clickReal('[data-experience-scope-head="all"]');

await shot('03-experiences-list');

const scrolled = await page.evaluate(() => {
  // The open section's own list, not the stack: a closed section never scrolls.
  const list = document.querySelector(
    '[data-experience-scope-open="true"] .lodariq-experience-menu-scope-list',
  );
  if (!list) return null;
  list.scrollTop = list.scrollHeight;
  list.dispatchEvent(new Event('scroll', { bubbles: true }));
  return { scrollHeight: list.scrollHeight, clientHeight: list.clientHeight };
});
await page.waitForTimeout(600);
const afterScroll = await menuState();
check(
  'scrolling to the bottom loads the next page',
  afterScroll.experienceRows > state.experienceRows,
  `${state.experienceRows} → ${afterScroll.experienceRows} (scrollable: ${scrolled?.scrollHeight} > ${scrolled?.clientHeight})`,
);

await page.evaluate(() => {
  const input = document.querySelector('[data-lodariq-experience-menu="true"] input');
  if (!input) return;
  // Not "Welcome": the fixture host's own base document is in the index too, and
  // it is called "Welcome tour". Two matches would be the right answer.
  input.value = 'walkthrough';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(700);
const searched = await menuState();
// One tour, one row in each list, and both counts follow it down to 1: the
// field reaches both scopes because a creator searching by name does not know
// which of them the tour is in.
check(
  'the search field narrows both lists',
  JSON.stringify(searched.scopes?.map((scope) => [scope.rows, scope.count])) ===
    JSON.stringify([
      [1, '1'],
      [1, '1'],
    ]) && searched.text.includes('Welcome walkthrough'),
  `${JSON.stringify(searched.scopes?.map((scope) => [scope.rows, scope.count]))}: ${searched.text}`,
);
await shot('04-experiences-search');

// ── 4. The same menus from inside the panel ──────────────────────────────────
await page.evaluate(() => {
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  window.__meridian?.openAuthoring?.();
});
await page.waitForTimeout(6000);

/*
 * The panel half needs a host that can open authoring on demand. The fixture
 * host exposes that; a proxied real application does not, and the run should
 * report the eleven checks above rather than die on the twelfth.
 */
if (!(await centreOf('[data-pill-menu]', { deep: true }))) {
  console.log("SKIP  the panel's own menu — this host does not expose openAuthoring()");
  console.log(`\nconsole errors: ${errors.length}`);
  for (const error of errors.slice(0, 6)) console.log(`  ${error}`);
  console.log(`\n${failures.length ? `FAILURES: ${failures.join(', ')}` : 'all checks passed'}`);
  await browser.close();
  process.exit(failures.length || errors.length ? 1 : 0);
}
await clickReal('[data-pill-menu]', { deep: true });
const pillMenu = await page.evaluate(() => {
  const findPill = () => {
    const direct = document.querySelector('.overlay-mode-pill');
    if (direct) return direct;
    for (const node of document.querySelectorAll('*')) {
      const found = node.shadowRoot?.querySelector('.overlay-mode-pill');
      if (found) return found;
    }
    return null;
  };
  const pill = findPill();
  if (!pill) return { present: false };
  const list = pill.querySelector('[data-pill-menu-list]');
  return {
    present: true,
    open: list ? !list.hidden : false,
    heads: [...pill.querySelectorAll('.overlay-mode-pill-menu-group')].map((node) =>
      (node.textContent ?? '').trim(),
    ),
    submenuRows: [...pill.querySelectorAll('[data-pill-submenu]')].map((node) => ({
      label: (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
      side: node.dataset.pillSubmenu,
    })),
    flatTypeRows: pill.querySelectorAll('[data-pill-experience]').length,
  };
});
check('the pill menu opens', pillMenu.present && pillMenu.open);
check(
  'the flat experience-type list is gone',
  pillMenu.flatTypeRows === 0,
  `${pillMenu.flatTypeRows} bare type rows`,
);
check(
  'the menu groups no longer stack two type lists',
  !pillMenu.heads?.includes('Experience type'),
  JSON.stringify(pillMenu.heads),
);
check(
  'both experience rows and the type switch are submenus',
  (pillMenu.submenuRows?.length ?? 0) >= 1,
  JSON.stringify(pillMenu.submenuRows),
);
await shot('05-pill-menu');

/** Real pointer, and deep: the pill lives in the panel's shadow root. */
const hoverPillRow = async (selector) => hoverReal(selector, { deep: true });

const shadowMenuState = () =>
  page.evaluate(() => {
    const all = [];
    const collect = (root) => {
      for (const node of root.querySelectorAll('[data-lodariq-experience-menu="true"]')) {
        all.push(node);
      }
      for (const node of root.querySelectorAll('*')) {
        if (node.shadowRoot) collect(node.shadowRoot);
      }
    };
    collect(document);
    const menu = all.find((node) => !node.hidden);
    if (!menu) return { present: false, total: all.length };
    const rect = menu.getBoundingClientRect();
    return {
      present: true,
      total: all.length,
      side: menu.dataset.side ?? null,
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      heading: menu.querySelector('.lodariq-experience-menu-head strong')?.textContent ?? '',
      rows: menu.querySelectorAll('[data-experience-row]').length,
      background: getComputedStyle(menu).backgroundColor,
      text: (menu.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
    };
  });

const pillRowPoint = await hoverPillRow('[data-pill-launcher-action="new-experience"]');
const pillFlyout = await shadowMenuState();
check(
  'the pill row opens the same menu, anchored to itself',
  pillFlyout.present && pillFlyout.rows === 5,
  `${pillFlyout.heading} (${pillFlyout.rows} rows, side=${pillFlyout.side})`,
);
check(
  'it is styled, not unstyled — the panel stylesheet reached the shadow root',
  pillFlyout.background && pillFlyout.background !== 'rgba(0, 0, 0, 0)',
  String(pillFlyout.background),
);
/*
 * The one the shadow root breaks. Its host is pointer-events:none and every
 * surface opts back in by name, so a menu that forgets to gets no mouse events
 * at all — it cannot be hovered and its rows cannot be clicked.
 */
await walkIntoFlyout(pillRowPoint);
check(
  'the pill submenu survives the pointer moving onto it',
  (await shadowMenuState()).present,
  'pointer-events must be re-enabled inside the shadow root',
);
check(
  'and it takes pointer input at all inside the shadow root',
  await page.evaluate(() => {
    const all = [];
    const walk = (root) => {
      for (const node of root.querySelectorAll('[data-lodariq-experience-menu="true"]')) {
        all.push(node);
      }
      for (const node of root.querySelectorAll('*')) if (node.shadowRoot) walk(node.shadowRoot);
    };
    walk(document);
    const menu = all.find((node) => !node.hidden);
    return menu ? getComputedStyle(menu).pointerEvents === 'auto' : false;
  }),
  'computed pointer-events on the mounted menu',
);
await shot('06-pill-submenu');

/*
 * The accordion on the second surface, which is a second mounted flyout.
 *
 * Its `aria-controls` has to point at its own lists and not the launcher's:
 * both are in the document at once, and an id reused across the two would send
 * a screen reader to a list belonging to a menu nobody has open.
 */
await hoverPillRow('[data-pill-launcher-action="experiences-on-page"]');
await page.waitForTimeout(700);
const pillScopes = await page.evaluate(() => {
  const all = [];
  const walk = (root) => {
    for (const node of root.querySelectorAll('[data-lodariq-experience-menu="true"]')) {
      all.push(node);
    }
    for (const node of root.querySelectorAll('*')) if (node.shadowRoot) walk(node.shadowRoot);
  };
  walk(document);
  const menu = all.find((node) => !node.hidden);
  if (!menu) return null;
  const root = menu.getRootNode();
  return {
    inShadow: root !== document,
    menus: all.length,
    scopes: [...menu.querySelectorAll('[data-experience-scope-head]')].map((head) => {
      const id = head.getAttribute('aria-controls') ?? '';
      return {
        scope: head.dataset.experienceScopeHead,
        expanded: head.getAttribute('aria-expanded'),
        // Resolved against this menu's own root, not the document.
        resolves: Boolean(id && root.getElementById?.(id)),
        owned: Boolean(id && menu.querySelector(`#${CSS.escape(id)}`)),
      };
    }),
  };
});
check(
  "the panel's own list is the same two scopes",
  JSON.stringify(pillScopes?.scopes?.map((scope) => [scope.scope, scope.expanded])) ===
    JSON.stringify([
      ['page', 'true'],
      ['all', 'false'],
    ]),
  `${pillScopes?.menus} flyouts mounted, in shadow=${pillScopes?.inShadow}: ${JSON.stringify(pillScopes?.scopes)}`,
);
check(
  'each header points at a list inside its own menu',
  pillScopes?.scopes?.length === 2 &&
    pillScopes.scopes.every((scope) => scope.resolves && scope.owned),
  JSON.stringify(pillScopes?.scopes?.map((scope) => [scope.resolves, scope.owned])),
);
await shot('06b-pill-scopes');

// ── 5. The type switch names its consequence ─────────────────────────────────
await hoverPillRow('[data-pill-change-experience-type]');
const switchMenu = await shadowMenuState();
check(
  'the type switch is behind its own row',
  switchMenu.present && switchMenu.heading.includes('Change experience type'),
  `${switchMenu.heading} (${switchMenu.rows} rows)`,
);

await clickReal('[data-lodariq-switch-type="announcement"]', { deep: true });
const confirm = await page.evaluate(() => {
  const all = [];
  const collect = (root) => {
    for (const node of root.querySelectorAll('[data-lodariq-experience-dialog-scrim="true"]')) {
      all.push(node);
    }
    for (const node of root.querySelectorAll('*')) {
      if (node.shadowRoot) collect(node.shadowRoot);
    }
  };
  collect(document);
  const scrim = all[0];
  if (!scrim) return { present: false };
  return {
    present: true,
    text: (scrim.textContent ?? '').replace(/\s+/g, ' ').trim(),
    focusedIsCancel:
      scrim.querySelector('footer button') === document.activeElement ||
      scrim.contains(document.activeElement),
  };
});
check(
  'switching type asks first, and says what will happen',
  confirm.present && /stop appearing|disappear/.test(confirm.text),
  confirm.text?.slice(0, 180),
);
await shot('07-type-switch-confirm');

/*
 * The round trip, because the dialog promises it in so many words: "switching
 * back brings them straight back". A confirm that says a thing is reversible
 * has to be held to it.
 */
const storedType = () =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('lodariq:doc:'))
      .map((key) => JSON.parse(localStorage.getItem(key) ?? '{}'))
      .map((document) => ({ type: document.type, blocks: (document.blocks ?? []).length })),
  );

await clickReal('[data-lodariq-experience-dialog-confirm]', { deep: true });
await page.waitForTimeout(2500);
const switched = await storedType();
check(
  'the switch is applied and keeps every block',
  switched.some((entry) => entry.type === 'announcement' && entry.blocks > 0),
  JSON.stringify(switched),
);

await clickReal('[data-pill-menu]', { deep: true });
await hoverPillRow('[data-pill-change-experience-type]');
await clickReal('[data-lodariq-switch-type="tour"]', { deep: true });
await clickReal('[data-lodariq-experience-dialog-confirm]', { deep: true });
await page.waitForTimeout(2500);
const restored = await storedType();
check(
  'switching back restores the type, as the confirm promised',
  restored.some((entry) => entry.type === 'tour' && entry.blocks > 0),
  JSON.stringify(restored),
);
await shot('08-type-switched-back');

console.log(`\nconsole errors: ${errors.length}`);
for (const error of errors.slice(0, 6)) console.log(`  ${error}`);
console.log(`screenshots in ${out}`);
console.log(`\n${failures.length ? `FAILURES: ${failures.join(', ')}` : 'all checks passed'}`);

await browser.close();
if (failures.length || errors.length) process.exitCode = 1;
