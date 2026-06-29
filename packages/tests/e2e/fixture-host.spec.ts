import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';

test('fixture host installs the local SDK build and plays a tour', async ({ page }) => {
  const loadedUrls: string[] = [];
  page.on('request', (request) => loadedUrls.push(request.url()));

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as { Talmeh?: unknown }).Talmeh));

  expect(
    loadedUrls.some((url) => url.includes('/packages/sdk-runtime/dist/talmeh-loader.js')),
  ).toBe(true);

  await page.evaluate(() =>
    (window as { Talmeh: { playTour: () => Promise<void> } }).Talmeh.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Talmeh tour' })).toContainText(
    'Create your first project',
  );
});

test('creator authors an editable tour step, attaches a target, and replays it', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');

  await expect(frame.locator('.block')).toHaveCount(1);
  const initialBlockCount = await frame.locator('.block').count();
  await frame.getByLabel('Block composer', { exact: true }).fill('/step');
  await frame.getByLabel('Block composer', { exact: true }).press('Enter');
  await expect(frame.locator('.block')).toHaveCount(initialBlockCount + 1);
  const stepBlock = frame.locator('.block').last();
  await expect(stepBlock).toBeVisible();

  const heading = stepBlock.getByLabel('Heading');
  const body = stepBlock.getByLabel('Body text');
  const button = stepBlock.getByLabel('Button label');
  await expect(heading).toHaveValue('Untitled step');
  await heading.fill('Invite teammates');
  await heading.blur();
  await body.fill('Share access so your team can collaborate.');
  await body.blur();
  await button.fill('Finish');
  await button.blur();

  await stepBlock.getByRole('button', { name: /select target/i }).click();
  await page.getByRole('button', { name: 'New project' }).click();

  await expect(stepBlock.locator('.target-chip')).toContainText('New project');
  await openTargetActions(stepBlock, 'New project');
  await stepBlock.getByRole('button', { name: 'Target health' }).click();
  await expect(stepBlock.locator('.target-chip')).toContainText('Healthy');
  await expect(frame.locator('#status')).toContainText('Found by');
  await openTargetActions(stepBlock, 'New project');
  await stepBlock.getByRole('button', { name: 'View target' }).click();
  await expect(page.locator('[data-talmeh-bridge="target-reveal"]')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Talmeh tour' })).toContainText('Invite teammates');
  await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();

  await compilePreview(frame);
  await expect(frame.getByLabel('Compiled preview')).toContainText('doc_tour_welcome');
  await expect(frame.getByLabel('Compiled preview')).toContainText('Invite teammates');
  await expect(frame.getByLabel('Compiled preview')).toContainText('Finish');
  await openUtilityTab(frame, 'Metrics');
  await expect(frame.getByLabel('Local metrics')).toContainText('"timeToAttachFirstTargetMs"');
  await expect(frame.getByLabel('Local metrics')).toContainText('"previewOpenRate": 1');

  await page.reload();
  await page.waitForFunction(() => Boolean((window as { Talmeh?: unknown }).Talmeh));
  await page.getByRole('button', { name: 'Start tour' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('dialog', { name: 'Talmeh tour' })).toContainText('Invite teammates');
  await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
});

test('creator can add an editable tour step from the primary action', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');
  await expect(frame.locator('.block')).toHaveCount(1);
  const initialBlockCount = await frame.locator('.block').count();

  await frame.getByRole('button', { name: 'Add step' }).click();

  await expect(frame.locator('.block')).toHaveCount(initialBlockCount + 1);
  const stepBlock = frame.locator('.block').last();
  await expect(stepBlock.getByLabel('Heading')).toHaveValue('Untitled step');
  await expect(stepBlock.getByLabel('Heading')).toBeFocused();
  await expect(stepBlock.getByLabel('Body text')).toHaveValue('Write supporting copy');
  await expect(stepBlock.getByLabel('Button label')).toHaveValue('Continue');
  await expect(stepBlock.getByLabel('Button action')).toHaveValue('next');
  await expect(stepBlock.getByRole('button', { name: /select target/i })).toBeVisible();
});

test('creator can insert nested step content inline', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');

  await frame.getByRole('button', { name: 'Add step' }).click();
  const stepBlock = frame.locator('.block').last();

  await stepBlock.getByLabel('Insert content at start of step').click();
  await stepBlock.getByRole('menuitem', { name: /Paragraph/ }).click();
  await expect(stepBlock.getByLabel('Body text')).toHaveCount(2);

  await stepBlock.getByLabel('Insert content at end of step').click();
  await stepBlock.getByRole('menuitem', { name: /Media/ }).click();
  await expect(stepBlock.getByLabel('Media placeholder')).toHaveValue('Media placeholder');
  await expect(stepBlock).toContainText('Placeholder only');

  await compilePreview(frame);
  await expect(frame.getByLabel('Compiled preview')).toContainText('"type": "media"');
});

test('creator can cancel target picking with Escape from the authoring iframe', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');
  const targetButton = frame.getByRole('button', { name: /select target|change target/i }).first();
  await expect(targetButton).toBeVisible();
  const initialChipCount = await frame.locator('.target-chip').count();

  await targetButton.click();
  await expect(page.locator('[data-talmeh-bridge="target-outline"]')).toHaveCount(1);
  await expect(page.locator('[data-talmeh-bridge="target-veil"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'New project' }).hover();
  const hoverLabel = page.locator('[data-talmeh-bridge="target-label"]');
  await expect(hoverLabel).toContainText('Button');
  await expect(hoverLabel).toContainText('New project');
  await expect(hoverLabel).toContainText('Click to attach');

  await page.keyboard.press('Escape');

  await expect(page.locator('[data-talmeh-bridge="target-outline"]')).toHaveCount(0);
  await expect(page.locator('[data-talmeh-bridge="target-veil"]')).toHaveCount(0);
  await expect(page.locator('[data-talmeh-bridge="target-label"]')).toHaveCount(0);
  await expect(frame.locator('#status')).toContainText('Target picker canceled');

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(frame.locator('.target-chip')).toHaveCount(initialChipCount);
});

test('local authoring and tour playback pass accessibility smoke checks', async ({ page }) => {
  await page.goto('/');

  const authoringTrigger = page.getByRole('button', { name: 'Open Talmeh authoring' });
  await expect(authoringTrigger).toBeVisible();
  await authoringTrigger.focus();
  await expect(authoringTrigger).toBeFocused();
  await authoringTrigger.press('Enter');
  await expect(authoringTrigger).toHaveAttribute('aria-expanded', 'true');
  const anchoredPanel = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('[data-talmeh-authoring-trigger="true"]');
    const panel = document.querySelector<HTMLElement>('talmeh-authoring-panel');
    const triggerRect = trigger?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    return {
      triggerTop: triggerRect?.top ?? Number.NaN,
      triggerRight: window.innerWidth - (triggerRect?.right ?? 0),
      panelTop: panelRect?.top ?? Number.NaN,
      panelBottom: window.innerHeight - (panelRect?.bottom ?? 0),
    };
  });
  expect(anchoredPanel.triggerTop).toBeLessThan(32);
  expect(anchoredPanel.triggerRight).toBeLessThan(32);
  expect(anchoredPanel.panelTop).toBeGreaterThan(72);
  expect(anchoredPanel.panelBottom).toBeLessThanOrEqual(18);

  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');
  const slashInput = frame.getByLabel('Block composer', { exact: true });
  await expect(slashInput).toBeVisible();
  await slashInput.focus();
  await expect(slashInput).toBeFocused();
  await openUtilityTab(frame, 'JSON');
  await expect(frame.getByRole('textbox', { name: 'Document JSON' })).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Preview full tour' })).toBeVisible();
  const editorHasHorizontalOverflow = await frame.locator('body').evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return html.scrollWidth > html.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1;
  });
  expect(editorHasHorizontalOverflow).toBe(false);
  const actionBar = frame.locator('.canvas-actionbar');
  await frame.locator('body').evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect(actionBar).toBeVisible();
  const actionBarTopAfterScroll = await actionBar.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(actionBarTopAfterScroll).toBeGreaterThanOrEqual(44);
  expect(actionBarTopAfterScroll).toBeLessThanOrEqual(88);

  await page.getByRole('button', { name: 'Start tour' }).click();
  const tourDialog = page.getByRole('dialog', { name: 'Talmeh tour' });
  await expect(tourDialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused();
});

test('creator can reposition the opened authoring panel from the bubble and header', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  await expect(page.locator('talmeh-authoring-panel')).toBeVisible();

  const initial = await authoringPanelRects(page);
  await dragFromPoint(page, centerPoint(initial.trigger), { dx: -420, dy: 20 }, { steps: 8 });
  const afterBubbleDrag = await authoringPanelRects(page);

  expect(afterBubbleDrag.trigger.left).toBeLessThan(initial.trigger.left - 300);
  expect(afterBubbleDrag.panel.left).toBeLessThan(initial.panel.left - 20);
  expect(afterBubbleDrag.panel.top).toBeGreaterThan(initial.panel.top);
  await expect(page.getByRole('button', { name: 'Open Talmeh authoring' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  await dragFromPoint(
    page,
    {
      x: afterBubbleDrag.header.left + Math.min(180, afterBubbleDrag.header.width / 2),
      y: afterBubbleDrag.header.top + afterBubbleDrag.header.height / 2,
    },
    { dx: -120, dy: 70 },
    { steps: 8 },
  );
  const afterHeaderDrag = await authoringPanelRects(page);

  expect(afterHeaderDrag.panel.left).toBeLessThan(afterBubbleDrag.panel.left - 60);
  expect(afterHeaderDrag.panel.top).toBeGreaterThan(afterBubbleDrag.panel.top + 40);
  expect(afterHeaderDrag.trigger.top).toBeLessThan(afterHeaderDrag.panel.top);
});

test('creator can save an incomplete button action without data loss', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  let frame = page.frameLocator('iframe[title="Talmeh authoring"]');

  await frame.getByLabel('Block composer', { exact: true }).fill('/button');
  await frame.getByLabel('Block composer', { exact: true }).press('Enter');

  const buttonBlock = frame.locator('.block').last();
  await expect(buttonBlock.locator('.badge')).toContainText('incomplete');
  await expect(buttonBlock.getByLabel('Button action')).toHaveValue('');
  await expect(buttonBlock).toContainText('Needs purpose');

  await buttonBlock.getByLabel('Button label').fill('Learn more');
  await buttonBlock.getByLabel('Button label').blur();
  await frame.getByRole('button', { name: 'Save', exact: true }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  frame = page.frameLocator('iframe[title="Talmeh authoring"]');
  const reloadedButton = frame.locator('.block').last();

  await expect(reloadedButton.getByLabel('Button label')).toHaveValue('Learn more');
  await expect(reloadedButton.getByLabel('Button action')).toHaveValue('');
  await expect(reloadedButton.locator('.badge')).toContainText('incomplete');
});

test('creator can remove a target without losing step content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');
  const stepBlock = frame.locator('.block').first();

  await expect(stepBlock.getByLabel('Heading')).toHaveValue('Create your first project');
  await stepBlock.getByRole('button', { name: /select target|change target/i }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();

  await expect(stepBlock.locator('.target-chip')).toContainText('New project');
  await expect(stepBlock.locator('.badge')).toContainText('ready');

  await openTargetActions(stepBlock, 'New project');
  await stepBlock.getByRole('button', { name: 'Remove target' }).click();

  await expect(stepBlock.locator('.target-chip')).toHaveCount(0);
  await expect(stepBlock.locator('.badge')).toContainText('incomplete');
  await expect(stepBlock.getByLabel('Heading')).toHaveValue('Create your first project');
  await expect(stepBlock.getByLabel('Body text')).toHaveValue(
    "Projects help organize your team's work.",
  );
  await expect(frame.locator('#status')).toContainText('Removed target');

  await page.reload();
  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const reloadedStep = page
    .frameLocator('iframe[title="Talmeh authoring"]')
    .locator('.block')
    .first();
  await expect(reloadedStep.locator('.target-chip')).toHaveCount(0);
  await expect(reloadedStep.locator('.badge')).toContainText('incomplete');
  await expect(reloadedStep.getByLabel('Heading')).toHaveValue('Create your first project');
});

test('tour advances after a real product target click opens a modal', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');
  const textarea = await documentJson(frame);
  const document = JSON.parse(await textarea.inputValue()) as Record<string, unknown>;
  const clickTargetDocument = {
    ...document,
    targets: [
      {
        id: 'target_open_modal',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'Open import modal',
          label: 'Open import modal',
          stableAttributes: { 'data-talmeh-id': 'open-modal' },
        },
      },
      {
        id: 'target_confirm_import',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'Review import',
          label: 'Review import',
          stableAttributes: { 'data-talmeh-id': 'confirm-import' },
        },
        lifecycle: {
          waitForElement: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Review import',
            stableAttributes: { 'data-talmeh-id': 'confirm-import' },
          },
          timeoutMs: 1200,
        },
      },
    ],
    blocks: [
      {
        id: 'block_step_click_import',
        type: 'tourStep',
        props: { index: 0 },
        status: 'ready',
        children: [
          {
            id: 'block_tooltip_click_import',
            type: 'tooltip',
            props: { placement: 'bottom', targetId: 'target_open_modal' },
            status: 'ready',
            children: [
              {
                id: 'block_heading_click_import',
                type: 'heading',
                props: { level: 2 },
                content: 'Open the import modal',
                children: [],
              },
              {
                id: 'block_button_click_import',
                type: 'button',
                content: 'Click Import',
                props: { variant: 'primary', action: { type: 'clickTarget' } },
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'block_step_review_import',
        type: 'tourStep',
        props: { index: 1 },
        status: 'ready',
        children: [
          {
            id: 'block_tooltip_review_import',
            type: 'tooltip',
            props: { placement: 'bottom', targetId: 'target_confirm_import' },
            status: 'ready',
            children: [
              {
                id: 'block_heading_review_import',
                type: 'heading',
                props: { level: 2 },
                content: 'Review imported data',
                children: [],
              },
              {
                id: 'block_button_review_import',
                type: 'button',
                content: 'Finish',
                props: { variant: 'primary', action: { type: 'next' } },
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };

  await textarea.evaluate(
    (element, value) => {
      const textAreaElement = element as HTMLTextAreaElement;
      textAreaElement.value = value;
      textAreaElement.dispatchEvent(new Event('input', { bubbles: true }));
    },
    JSON.stringify(clickTargetDocument, null, 2),
  );
  await frame.getByRole('button', { name: 'Import' }).click();
  await compilePreview(frame);
  await expect(frame.getByLabel('Compiled preview')).toContainText('clickTarget');

  await page.getByRole('button', { name: 'Close Talmeh authoring' }).click();
  await page.evaluate(() =>
    (window as { Talmeh: { playTour: () => Promise<void> } }).Talmeh.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Talmeh tour' })).toContainText(
    'Open the import modal',
  );
  await page.waitForFunction(`
    Boolean(
      document
        .querySelector('talmeh-tour')
        ?.shadowRoot
        ?.querySelector('[role="dialog"]')
        ?.style.left
    )
  `);
  await page.getByRole('button', { name: 'Open import modal' }).click();

  await expect(page.getByRole('dialog', { name: 'Import projects' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Talmeh tour' })).toContainText(
    'Review imported data',
  );
});

test('tour resumes the next step after a real product click navigates the page', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');
  const textarea = await documentJson(frame);
  const sourceDocument = JSON.parse(await textarea.inputValue()) as Record<string, unknown>;
  const navigationDocument = {
    ...sourceDocument,
    targets: [
      {
        id: 'target_new_project',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'New project',
          label: 'New project',
          stableAttributes: { 'data-talmeh-id': 'new-project' },
        },
      },
    ],
    blocks: [
      {
        id: 'block_step_navigate',
        type: 'tourStep',
        props: { index: 0 },
        status: 'ready',
        children: [
          {
            id: 'block_tooltip_navigate',
            type: 'tooltip',
            props: { placement: 'bottom', targetId: 'target_new_project' },
            status: 'ready',
            children: [
              {
                id: 'block_heading_navigate',
                type: 'heading',
                props: { level: 2 },
                content: 'Open the project page',
                children: [],
              },
              {
                id: 'block_button_navigate',
                type: 'button',
                content: 'Click New project',
                props: { variant: 'primary', action: { type: 'clickTarget' } },
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'block_step_after_navigation',
        type: 'tourStep',
        props: { index: 1 },
        status: 'ready',
        children: [
          {
            id: 'block_tooltip_after_navigation',
            type: 'tooltip',
            props: { placement: 'bottom', targetId: 'target_new_project' },
            status: 'ready',
            children: [
              {
                id: 'block_heading_after_navigation',
                type: 'heading',
                props: { level: 2 },
                content: 'Navigation resumed',
                children: [],
              },
              {
                id: 'block_button_after_navigation',
                type: 'button',
                content: 'Finish',
                props: { variant: 'primary', action: { type: 'next' } },
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };

  await textarea.evaluate(
    (element, value) => {
      const textAreaElement = element as HTMLTextAreaElement;
      textAreaElement.value = value;
      textAreaElement.dispatchEvent(new Event('input', { bubbles: true }));
    },
    JSON.stringify(navigationDocument, null, 2),
  );
  await frame.getByRole('button', { name: 'Import' }).click();
  await frame.getByRole('button', { name: 'Save', exact: true }).click();
  await compilePreview(frame);
  await expect(frame.getByLabel('Compiled preview')).toContainText('clickTarget');

  await page.getByRole('button', { name: 'Close Talmeh authoring' }).click();
  await page.evaluate(() => {
    document.querySelector('[data-talmeh-id="new-project"]')?.addEventListener('click', () => {
      window.location.assign('/?createdProject=1#details');
    });
  });
  await page.evaluate(() =>
    (window as { Talmeh: { playTour: () => Promise<void> } }).Talmeh.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Talmeh tour' })).toContainText(
    'Open the project page',
  );
  await page.waitForFunction(`
    Boolean(
      document
        .querySelector('talmeh-tour')
        ?.shadowRoot
        ?.querySelector('[role="dialog"]')
        ?.style.left
    )
  `);

  await Promise.all([
    page.waitForURL(/createdProject=1/),
    page.locator('[data-talmeh-id="new-project"]').click(),
  ]);
  await page.waitForFunction(() => Boolean((window as { Talmeh?: unknown }).Talmeh));

  await expect(page.getByRole('dialog', { name: 'Talmeh tour' })).toContainText(
    'Navigation resumed',
  );
});

test('runtime lifecycle opens a configured panel before resolving a target', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');
  const textarea = await documentJson(frame);
  const document = JSON.parse(await textarea.inputValue()) as Record<string, unknown>;
  const lifecycleDocument = {
    ...document,
    targets: [
      {
        id: 'target_confirm_import',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'Review import',
          label: 'Review import',
          stableAttributes: { 'data-talmeh-id': 'confirm-import' },
        },
        lifecycle: {
          openPanel: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Open import modal',
            stableAttributes: { 'data-talmeh-id': 'open-modal' },
          },
          waitForElement: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Review import',
            stableAttributes: { 'data-talmeh-id': 'confirm-import' },
          },
          timeoutMs: 1200,
        },
      },
    ],
    blocks: [
      {
        id: 'block_step_review_import',
        type: 'tourStep',
        props: { index: 0 },
        status: 'ready',
        children: [
          {
            id: 'block_tooltip_review_import',
            type: 'tooltip',
            props: { placement: 'bottom', targetId: 'target_confirm_import' },
            status: 'ready',
            children: [
              {
                id: 'block_heading_review_import',
                type: 'heading',
                props: { level: 2 },
                content: 'Review imported data',
                children: [],
              },
              {
                id: 'block_button_review_import',
                type: 'button',
                content: 'Finish',
                props: { variant: 'primary', action: { type: 'next' } },
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };

  await textarea.evaluate(
    (element, value) => {
      const textAreaElement = element as HTMLTextAreaElement;
      textAreaElement.value = value;
      textAreaElement.dispatchEvent(new Event('input', { bubbles: true }));
    },
    JSON.stringify(lifecycleDocument, null, 2),
  );
  await frame.getByRole('button', { name: 'Import' }).click();
  await compilePreview(frame);
  await expect(frame.getByLabel('Compiled preview')).toContainText('openPanel');

  await page.getByRole('button', { name: 'Close Talmeh authoring' }).click();
  await page.evaluate(() =>
    (window as { Talmeh: { playTour: () => Promise<void> } }).Talmeh.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Import projects' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Talmeh tour' })).toContainText(
    'Review imported data',
  );
});

test('creator exports, re-imports, recompiles, and replays a local fixture', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as { Talmeh?: unknown }).Talmeh));

  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');
  const textarea = await documentJson(frame);
  const doc = JSON.parse(await textarea.inputValue()) as { blocks: BlockIdNode[] };
  const originalIds = collectBlockIds(doc.blocks);
  const heading = doc.blocks[0]?.children?.[0]?.children?.[0];
  if (!heading) throw new Error('fixture heading missing');
  heading.content = 'Imported replay heading';

  await textarea.evaluate(
    (element, value) => {
      const textAreaElement = element as HTMLTextAreaElement;
      textAreaElement.value = value;
      textAreaElement.dispatchEvent(new Event('input', { bubbles: true }));
    },
    JSON.stringify(doc, null, 2),
  );
  await expect(textarea).toHaveValue(/Imported replay heading/);
  await frame.getByRole('button', { name: 'Import' }).click();
  await frame.getByRole('button', { name: 'Export', exact: true }).click();

  const roundTripped = JSON.parse(await textarea.inputValue()) as typeof doc;
  expect(collectBlockIds(roundTripped.blocks)).toEqual(originalIds);

  await compilePreview(frame);
  await expect(frame.getByLabel('Compiled preview')).toContainText('Imported replay heading');

  await page.evaluate(() =>
    (window as { Talmeh: { playTour: () => Promise<void> } }).Talmeh.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Talmeh tour' })).toContainText(
    'Imported replay heading',
  );
});

test('creator attaches targets in route, drawer, modal, scroll, and lazy states', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('[data-route="projects"]').click();
  await expect(page.getByText('Project 40')).toBeVisible();

  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  await moveAuthoringPanelAside(page);
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');

  const list = page.locator('#project-list');
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await attachTarget(page, frame, page.getByRole('button', { name: 'Open project' }).last(), [
    'Open project',
  ]);

  await page.getByRole('button', { name: 'Open settings' }).click();
  const drawer = page.locator('#settings-drawer');
  await expect(drawer).toHaveClass(/open/);
  await attachTarget(page, frame, page.locator('[data-talmeh-id="close-drawer"]'), ['Close']);
  await expect(drawer).toHaveClass(/open/);
  await drawer.evaluate((element) => element.classList.remove('open'));

  await page.getByRole('button', { name: 'Open import modal' }).click();
  await attachTarget(page, frame, page.getByRole('button', { name: 'Review import' }), [
    'Review import',
  ]);
});

test('customer-like host installs the local SDK and opens SDK authoring', async ({ page }) => {
  const loadedUrls: string[] = [];
  page.on('request', (request) => loadedUrls.push(request.url()));

  await page.goto('http://127.0.0.1:4188/');
  await page.waitForFunction(() => Boolean((window as { Talmeh?: unknown }).Talmeh));

  expect(
    loadedUrls.some((url) => url.includes('/packages/sdk-runtime/dist/talmeh-loader.js')),
  ).toBe(true);

  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();

  await page.getByRole('button', { name: 'Open Talmeh authoring' }).click();
  const frame = page.frameLocator('iframe[title="Talmeh authoring"]');
  await frame.getByLabel('Block composer', { exact: true }).fill('/step');
  await frame.getByLabel('Block composer', { exact: true }).press('Enter');
  await attachTarget(page, frame, page.getByRole('button', { name: 'New project' }), [
    'New project',
  ]);
  await openUtilityTab(frame, 'Metrics');
  await expect(frame.getByLabel('Local metrics')).toContainText('"timeToAttachFirstTargetMs"');
  await frame.getByRole('button', { name: 'Export metrics' }).click();
  await expect(frame.getByLabel('Local metrics')).toContainText('"sessions"');
  await expect(frame.getByLabel('Local metrics')).toContainText('"sessionId"');

  await page.evaluate(() =>
    (window as { Talmeh: { playTour: () => Promise<void> } }).Talmeh.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Talmeh tour' })).toContainText(
    'Create your first project',
  );
});

async function moveAuthoringPanelAside(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('talmeh-authoring-panel');
    const panel = host?.shadowRoot?.querySelector<HTMLElement>('.panel');
    if (!panel) return;
    if (host) {
      host.style.inset = 'auto';
      host.style.left = '16px';
      host.style.top = '16px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
      host.style.width = '280px';
      host.style.height = '640px';
    }
    panel.style.left = '16px';
    panel.style.right = 'auto';
    panel.style.width = '280px';
  });
}

interface PageRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

async function authoringPanelRects(page: Page): Promise<{
  header: PageRect;
  panel: PageRect;
  trigger: PageRect;
}> {
  return page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('[data-talmeh-authoring-trigger="true"]');
    const panel = document.querySelector<HTMLElement>('talmeh-authoring-panel');
    const header = panel?.shadowRoot?.querySelector<HTMLElement>('header');
    if (!trigger || !panel || !header) {
      throw new Error('Authoring panel, trigger, or header missing');
    }
    const rectOf = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      };
    };
    return {
      header: rectOf(header),
      panel: rectOf(panel),
      trigger: rectOf(trigger),
    };
  });
}

function centerPoint(rect: PageRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

async function dragFromPoint(
  page: Page,
  point: { x: number; y: number },
  delta: { dx: number; dy: number },
  options: { steps?: number } = {},
): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + delta.dx, point.y + delta.dy, {
    steps: options.steps ?? 1,
  });
  await page.mouse.up();
}

async function openUtilityTab(
  frame: FrameLocator,
  name: 'Preview' | 'JSON' | 'Metrics',
): Promise<void> {
  await openDeveloperTools(frame);
  await frame.getByRole('tab', { name }).click();
}

async function openDeveloperTools(frame: FrameLocator): Promise<void> {
  const drawer = frame.locator('details.utilities-drawer');
  const isOpen = await drawer.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await drawer.locator('summary').click();
  }
}

async function documentJson(frame: FrameLocator): Promise<Locator> {
  await openUtilityTab(frame, 'JSON');
  return frame.getByLabel('Document JSON', { exact: true });
}

async function compilePreview(frame: FrameLocator): Promise<void> {
  await frame.getByRole('button', { name: 'Preview full tour' }).click();
  await openUtilityTab(frame, 'Preview');
}

async function openTargetActions(block: Locator, targetLabel: string): Promise<void> {
  await block.getByRole('button', { name: `Target ${targetLabel} actions` }).click();
}

async function attachTarget(
  page: Page,
  frame: FrameLocator,
  target: Locator,
  expectedLabels: string[],
): Promise<void> {
  await frame
    .getByRole('button', { name: /select target|change target/i })
    .first()
    .click();
  const panel = page.locator('talmeh-authoring-panel');
  await panel.evaluate((element) => {
    (element as HTMLElement).style.visibility = 'hidden';
  });
  try {
    await target.click();
  } finally {
    await panel.evaluate((element) => {
      (element as HTMLElement).style.visibility = '';
    });
  }
  const chips = frame.locator('.target-chip');
  for (const label of expectedLabels) {
    await expect(chips.last()).toContainText(label);
  }
  await expect(page.locator('[data-talmeh-bridge="target-outline"]')).toHaveCount(0);
}

interface BlockIdNode {
  id: string;
  content?: string;
  children?: BlockIdNode[];
}

function collectBlockIds(blocks: BlockIdNode[]): string[] {
  return blocks.flatMap((block) => [block.id, ...collectBlockIds(block.children ?? [])]);
}
