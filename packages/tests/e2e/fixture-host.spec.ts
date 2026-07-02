import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';
import type { CompiledDocument } from '@lodariq/schema';

test('fixture host installs the local SDK build and plays a tour', async ({ page }) => {
  const loadedUrls: string[] = [];
  page.on('request', (request) => loadedUrls.push(request.url()));

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));

  expect(
    loadedUrls.some((url) => url.includes('/src/lodariq-loader.ts')),
  ).toBe(true);

  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Create your first project',
  );
});

test('simple five-step tour completes under the Phase 1 time budget', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));

  const startedAt = Date.now();
  await page.evaluate((doc) => {
    return (
      window as { Lodariq: { playTour: (doc: CompiledDocument) => Promise<void> } }
    ).Lodariq.playTour(doc);
  }, fiveStepTourDocument());

  for (let index = 1; index <= 5; index += 1) {
    const isLast = index === 5;
    await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(`Step ${index}`);
    await page.getByRole('button', { name: isLast ? 'Finish' : 'Continue' }).click();
  }

  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toHaveCount(0);
  expect(Date.now() - startedAt).toBeLessThan(5 * 60 * 1000);
});

test('creator authors an editable tour step, chooses placement, and replays it', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  await frame.getByLabel('Experience title').fill('Customer onboarding tour');
  await frame.getByLabel('Experience title').blur();
  await expect(frame.locator('#status')).toContainText('Title updated');
  await expect(await documentJson(frame)).toHaveValue(/Customer onboarding tour/);

  await expect(frame.locator('.block')).toHaveCount(1);
  const initialBlockCount = await frame.locator('.block').count();
  await frame.getByLabel('Experience composer', { exact: true }).fill('/step');
  await frame.getByLabel('Experience composer', { exact: true }).press('Enter');
  await expect(frame.locator('.block')).toHaveCount(initialBlockCount + 1);
  const stepBlock = frame.locator('.block').last();
  await expect(stepBlock).toBeVisible();

  const heading = headingField(stepBlock);
  const body = stepBlock.getByLabel('Body text');
  const button = stepBlock.getByLabel('Button label');
  await expect(heading).toHaveValue('Untitled step');
  await heading.fill('Invite teammates');
  await heading.blur();
  await body.fill('Share access so your team can collaborate.');
  await body.blur();
  await button.fill('Finish');
  await button.blur();

  await stepBlock.getByRole('button', { name: /choose placement/i }).click();
  await page.getByRole('button', { name: 'New project' }).click();

  await expect(stepBlock.locator('.target-chip')).toContainText('New project');
  await openTargetActions(frame, stepBlock, 'New project');
  await targetMenu(frame).getByRole('button', { name: 'Check placement' }).click();
  await expect(stepBlock.locator('.target-chip')).toContainText('Ready');
  await expect(frame.locator('#status')).toContainText('Placement is ready.');
  await expect(targetMenu(frame)).toBeVisible();
  await targetMenu(frame).getByRole('button', { name: 'Show placement on page' }).click();
  await expect(page.locator('[data-lodariq-bridge="target-reveal"]')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Invite teammates',
  );
  await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();

  await compilePreview(frame);
  await expect(previewRecord(frame)).toContainText('doc_tour_welcome');
  await expect(previewRecord(frame)).toContainText('Invite teammates');
  await expect(previewRecord(frame)).toContainText('Finish');
  await openUtilityTab(frame, 'Activity report');
  await expect(activityLog(frame)).toContainText('"timeToAttachFirstTargetMs"');
  await expect(activityLog(frame)).toContainText('"previewOpenRate": 1');

  await page.reload();
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));
  await page.getByRole('button', { name: 'Start tour' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Invite teammates',
  );
  await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
});

test('creator can add an editable tour step from the primary action', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(frame.locator('.block')).toHaveCount(1);
  const initialBlockCount = await frame.locator('.block').count();

  await frame.getByRole('button', { name: 'New step' }).click();

  await expect(frame.locator('.block')).toHaveCount(initialBlockCount + 1);
  const stepBlock = frame.locator('.block').last();
  await expect(headingField(stepBlock)).toHaveValue('Untitled step');
  await expect(headingField(stepBlock)).toBeFocused();
  await expect(stepBlock.getByLabel('Body text')).toHaveValue('Write supporting copy');
  await expect(stepBlock.getByLabel('Button label')).toHaveValue('Continue');
  await expect(buttonActionSelect(stepBlock)).toHaveValue('next');
  await expect(stepBlock.getByRole('button', { name: /choose placement/i })).toBeVisible();
});

test('dragging steps updates the editor order and preview record', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const blocks = frame.locator('.block');

  await frame.getByRole('button', { name: 'New step' }).click();
  await headingField(blocks.nth(1)).fill('Middle drag step');
  await headingField(blocks.nth(1)).blur();

  await frame.getByRole('button', { name: 'New step' }).click();
  await headingField(blocks.nth(2)).fill('First after drag');
  await headingField(blocks.nth(2)).blur();

  const draggedBlockId = await blocks.nth(2).getAttribute('data-block-id');
  await expect(blocks).toHaveCount(3);
  await dispatchBlockDrag(frame, 2, 0);

  await expect(headingField(blocks.first())).toHaveValue('First after drag');
  const textarea = await documentJson(frame);
  const documentAfterDrag = JSON.parse(await textarea.inputValue()) as {
    blocks: Array<{ id: string; children?: Array<{ content?: string }> }>;
  };
  expect(documentAfterDrag.blocks[0]?.id).toBe(draggedBlockId);

  await compilePreview(frame);
  const compiledPreview = (await previewRecord(frame).textContent()) ?? '';
  expect(compiledPreview.indexOf('First after drag')).toBeLessThan(
    compiledPreview.indexOf('Create your first project'),
  );
  expect(compiledPreview.indexOf('Create your first project')).toBeLessThan(
    compiledPreview.indexOf('Middle drag step'),
  );
});

test('creator can insert nested step content inline', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  await frame.getByRole('button', { name: 'New step' }).click();
  const stepBlock = frame.locator('.block').last();

  await stepBlock.hover();
  await stepBlock.getByLabel('Insert content at start of step').click();
  await visibleInlineMenu(frame).getByRole('menuitem', { name: /Text/ }).click();
  await expect(stepBlock.getByLabel('Body text')).toHaveCount(2);

  await stepBlock.hover();
  await stepBlock.getByLabel('Insert content at end of step').click();
  await visibleInlineMenu(frame).getByRole('menuitem', { name: /Media/ }).click();
  await expect(stepBlock.getByLabel('Media placeholder')).toHaveValue('Media placeholder');
  await expect(stepBlock).toContainText('Add media later');

  await stepBlock.getByLabel('Step composer').fill('A composer-added note');
  await stepBlock.getByLabel('Step composer').press('Enter');
  await expect(stepBlock.getByLabel('Body text')).toHaveCount(3);
  await expect(stepBlock.getByLabel('Body text').last()).toHaveValue('A composer-added note');

  await compilePreview(frame);
  await expect(previewRecord(frame)).toContainText('"type": "media"');
  await expect(previewRecord(frame)).toContainText('A composer-added note');
});

test('creator can cancel placement picking with Escape from the authoring iframe', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const stepBlock = frame.locator('.block').first();
  await expect(stepBlock.locator('.target-chip')).toContainText('New project');
  const initialChipCount = await frame.locator('.target-chip').count();

  await startTargetPick(frame, stepBlock);
  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(1);
  await expect(page.locator('[data-lodariq-bridge="target-veil"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'New project' }).hover();
  const hoverLabel = page.locator('[data-lodariq-bridge="target-label"]');
  await expect(hoverLabel).toContainText('Button');
  await expect(hoverLabel).toContainText('New project');
  await expect(hoverLabel).toContainText('Click to use this placement');

  await page.keyboard.press('Escape');

  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(0);
  await expect(page.locator('[data-lodariq-bridge="target-veil"]')).toHaveCount(0);
  await expect(page.locator('[data-lodariq-bridge="target-label"]')).toHaveCount(0);
  await expect(frame.locator('#status')).toContainText('Placement selection canceled');

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(frame.locator('.target-chip')).toHaveCount(initialChipCount);
  await expect(stepBlock.locator('.target-chip')).toContainText('New project');
});

test('local authoring and tour playback pass accessibility smoke checks', async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1500 });
  await page.goto('/');

  const authoringTrigger = page.getByRole('button', { name: 'Open Lodariq authoring' });
  await expect(authoringTrigger).toBeVisible();
  await authoringTrigger.focus();
  await expect(authoringTrigger).toBeFocused();
  await authoringTrigger.press('Enter');
  await expect(authoringTrigger).toHaveAttribute('aria-expanded', 'true');
  const anchoredPanel = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('[data-lodariq-authoring-trigger="true"]');
    const panel = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const triggerRect = trigger?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    return {
      triggerTop: triggerRect?.top ?? Number.NaN,
      triggerRight: window.innerWidth - (triggerRect?.right ?? 0),
      panelTop: panelRect?.top ?? Number.NaN,
      panelBottom: window.innerHeight - (panelRect?.bottom ?? 0),
      panelHeight: panelRect?.height ?? Number.NaN,
    };
  });
  expect(anchoredPanel.triggerTop).toBeLessThan(32);
  expect(anchoredPanel.triggerRight).toBeLessThan(32);
  expect(anchoredPanel.panelTop).toBeGreaterThan(72);
  expect(anchoredPanel.panelHeight).toBeLessThanOrEqual(842);
  expect(anchoredPanel.panelBottom).toBeGreaterThan(560);

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const slashInput = frame.getByLabel('Experience composer', { exact: true });
  await expect(slashInput).toBeVisible();
  await slashInput.focus();
  await expect(slashInput).toBeFocused();
  await expect(await documentJson(frame)).toBeVisible();
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
  expect(actionBarTopAfterScroll).toBeGreaterThanOrEqual(8);
  expect(actionBarTopAfterScroll).toBeLessThanOrEqual(32);

  await page.getByRole('button', { name: 'Start tour' }).click();
  const tourDialog = page.getByRole('dialog', { name: 'Lodariq tour' });
  await expect(tourDialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused();
});

test('creator can reposition the opened authoring panel from the bubble and header', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  await expect(page.locator('lodariq-authoring-panel')).toBeVisible();

  const initial = await authoringPanelRects(page);
  await dragFromPoint(page, centerPoint(initial.trigger), { dx: -420, dy: 20 }, { steps: 8 });
  const afterBubbleDrag = await authoringPanelRects(page);

  expect(afterBubbleDrag.trigger.left).toBeLessThan(initial.trigger.left - 300);
  expect(afterBubbleDrag.panel.left).toBeLessThan(initial.panel.left - 20);
  expect(afterBubbleDrag.panel.top).toBeGreaterThan(initial.panel.top);
  await expect(page.getByRole('button', { name: 'Open Lodariq authoring' })).toHaveAttribute(
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
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  let frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  const stepBlock = frame.locator('.block').first();
  await stepBlock.getByLabel('Step composer').fill('/button');
  await stepBlock.getByLabel('Step composer').press('Enter');

  await expect(stepBlock.locator('.step-child-button')).toHaveCount(2);
  const buttonBlock = stepBlock.locator('.step-child-button').last();
  await expect(buttonBlock.locator('.button-field-shell.incomplete')).toHaveCount(1);
  await expect(buttonActionSelect(buttonBlock)).toHaveValue('');
  await expect(buttonBlock).toContainText('Choose next action');

  await buttonBlock.getByLabel('Button label').fill('Learn more');
  await buttonBlock.getByLabel('Button label').blur();
  await openReviewPanel(frame);
  await frame.getByRole('button', { name: 'Save draft', exact: true }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const reloadedStep = frame.locator('.block').first();
  const reloadedButton = reloadedStep.locator('.step-child-button').last();

  await expect(reloadedButton.getByLabel('Button label')).toHaveValue('Learn more');
  await expect(buttonActionSelect(reloadedButton)).toHaveValue('');
  await expect(reloadedButton.locator('.button-field-shell.incomplete')).toHaveCount(1);
});

test('creator can remove a placement without losing step content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const stepBlock = frame.locator('.block').first();

  await expect(headingField(stepBlock)).toHaveValue('Create your first project');
  await startTargetPick(frame, stepBlock);
  await page.getByRole('button', { name: 'New project', exact: true }).click();

  await expect(stepBlock.locator('.target-chip')).toContainText('New project');

  await openTargetActions(frame, stepBlock, 'New project');
  await targetMenu(frame).getByRole('button', { name: 'Remove placement' }).click();

  await expect(stepBlock.locator('.target-chip')).toHaveCount(0);
  await expect(stepBlock.locator('.block-header .badge')).toHaveCount(0);
  await expect(stepBlock.getByRole('button', { name: 'Choose placement' })).toBeVisible();
  await expect(headingField(stepBlock)).toHaveValue('Create your first project');
  await expect(stepBlock.getByLabel('Body text')).toHaveValue(
    "Projects help organize your team's work.",
  );
  await expect(frame.locator('#status')).toContainText('Removed placement; choose a new one');

  await page.reload();
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const reloadedStep = page
    .frameLocator('iframe[title="Lodariq authoring"]')
    .locator('.block')
    .first();
  await expect(reloadedStep.locator('.target-chip')).toHaveCount(0);
  await expect(reloadedStep.locator('.block-header .badge')).toHaveCount(0);
  await expect(reloadedStep.getByRole('button', { name: 'Choose placement' })).toBeVisible();
  await expect(headingField(reloadedStep)).toHaveValue('Create your first project');
});

test('tour advances after a real product target click opens a modal', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
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
          stableAttributes: { 'data-lodariq-id': 'open-modal' },
        },
      },
      {
        id: 'target_confirm_import',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'Review import',
          label: 'Review import',
          stableAttributes: { 'data-lodariq-id': 'confirm-import' },
        },
        lifecycle: {
          waitForElement: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Review import',
            stableAttributes: { 'data-lodariq-id': 'confirm-import' },
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
  await frame.getByRole('button', { name: 'Restore backup' }).click();
  await compilePreview(frame);
  await expect(previewRecord(frame)).toContainText('clickTarget');

  await page.getByRole('button', { name: 'Close Lodariq authoring' }).click();
  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Open the import modal',
  );
  await page.waitForFunction(`
    Boolean(
      document
        .querySelector('lodariq-tour')
        ?.shadowRoot
        ?.querySelector('[role="dialog"]')
        ?.style.left
    )
  `);
  await page.getByRole('button', { name: 'Open import modal' }).click();

  await expect(page.getByRole('dialog', { name: 'Import projects' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Review imported data',
  );
});

test('tour resumes the next step after a real product click navigates the page', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
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
          stableAttributes: { 'data-lodariq-id': 'new-project' },
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
  await frame.getByRole('button', { name: 'Restore backup' }).click();
  await frame.getByRole('button', { name: 'Save draft', exact: true }).click();
  await compilePreview(frame);
  await expect(previewRecord(frame)).toContainText('clickTarget');

  await page.getByRole('button', { name: 'Close Lodariq authoring' }).click();
  await page.evaluate(() => {
    document.querySelector('[data-lodariq-id="new-project"]')?.addEventListener('click', () => {
      window.location.assign('/?createdProject=1#details');
    });
  });
  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Open the project page',
  );
  await page.waitForFunction(`
    Boolean(
      document
        .querySelector('lodariq-tour')
        ?.shadowRoot
        ?.querySelector('[role="dialog"]')
        ?.style.left
    )
  `);

  await Promise.all([
    page.waitForURL(/createdProject=1/),
    page.locator('[data-lodariq-id="new-project"]').click(),
  ]);
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));

  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Navigation resumed',
  );
});

test('runtime lifecycle opens a configured panel before resolving a target', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
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
          stableAttributes: { 'data-lodariq-id': 'confirm-import' },
        },
        lifecycle: {
          openPanel: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Open import modal',
            stableAttributes: { 'data-lodariq-id': 'open-modal' },
          },
          waitForElement: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Review import',
            stableAttributes: { 'data-lodariq-id': 'confirm-import' },
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
  await frame.getByRole('button', { name: 'Restore backup' }).click();
  await compilePreview(frame);
  await expect(previewRecord(frame)).toContainText('openPanel');

  await page.getByRole('button', { name: 'Close Lodariq authoring' }).click();
  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Import projects' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Review imported data',
  );
});

test('creator exports, re-imports, recompiles, and replays a local fixture', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));

  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
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
  await frame.getByRole('button', { name: 'Restore backup' }).click();
  await frame.getByRole('button', { name: 'Copy backup', exact: true }).click();

  const roundTripped = JSON.parse(await textarea.inputValue()) as typeof doc;
  expect(collectBlockIds(roundTripped.blocks)).toEqual(originalIds);

  await compilePreview(frame);
  await expect(previewRecord(frame)).toContainText('Imported replay heading');

  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Imported replay heading',
  );
});

test('creator chooses placements in route, drawer, modal, scroll, and lazy states', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('[data-route="projects"]').click();
  await expect(page.getByText('Project 40')).toBeVisible();

  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  await moveAuthoringPanelAside(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');

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
  await attachTarget(page, frame, page.locator('[data-lodariq-id="close-drawer"]'), ['Close']);
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

  await page.goto(
    `http://127.0.0.1:${process.env.LODARIQ_E2E_CUSTOMER_LIKE_HOST_PORT ?? '4188'}/`,
  );
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));

  expect(
    loadedUrls.some((url) => url.includes('/src/lodariq-loader.ts')),
  ).toBe(true);

  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();

  await page.getByRole('button', { name: 'Open Lodariq authoring' }).click();
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await frame.getByLabel('Experience composer', { exact: true }).fill('/step');
  await frame.getByLabel('Experience composer', { exact: true }).press('Enter');
  await attachTarget(page, frame, page.getByRole('button', { name: 'New project' }), [
    'New project',
  ]);
  await openUtilityTab(frame, 'Activity report');
  await expect(activityLog(frame)).toContainText('"timeToAttachFirstTargetMs"');
  await frame.getByRole('button', { name: 'Create activity report' }).click();
  await expect(activityLog(frame)).toContainText('"sessions"');
  await expect(activityLog(frame)).toContainText('"sessionId"');

  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Create your first project',
  );
});

async function moveAuthoringPanelAside(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
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
    const trigger = document.querySelector<HTMLElement>('[data-lodariq-authoring-trigger="true"]');
    const panel = document.querySelector<HTMLElement>('lodariq-authoring-panel');
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

function fiveStepTourDocument(): CompiledDocument {
  return {
    schemaVersion: '1.0.0',
    type: 'tour',
    documentId: 'doc_five_step_budget',
    contentHash: `sha256-${'5'.repeat(64)}`,
    compilerVersion: 'e2e-five-step',
    targets: [],
    steps: Array.from({ length: 5 }, (_, index) => {
      const stepNumber = index + 1;
      return {
        id: `step_${stepNumber}`,
        body: [
          {
            id: `heading_${stepNumber}`,
            type: 'heading',
            text: `Step ${stepNumber}`,
            props: {},
          },
          {
            id: `button_${stepNumber}`,
            type: 'button',
            text: stepNumber === 5 ? 'Finish' : 'Continue',
            props: { action: { type: 'next' } },
          },
        ],
      };
    }),
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
  name: 'Preview package' | 'Restore backup' | 'Activity report',
): Promise<void> {
  await openSupportDetails(frame);
  await frame.getByRole('tab', { name }).click();
}

async function openReviewPanel(frame: FrameLocator): Promise<void> {
  const reviewDrawer = frame.locator('details.review-drawer');
  const reviewOpen = await reviewDrawer.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!reviewOpen) {
    await reviewDrawer.locator('summary').first().click();
  }
}

async function openSupportDetails(frame: FrameLocator): Promise<void> {
  await openReviewPanel(frame);

  const drawer = frame.locator('details.utilities-drawer');
  const isOpen = await drawer.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await drawer.locator('summary').click();
  }
}

async function documentJson(frame: FrameLocator): Promise<Locator> {
  await openUtilityTab(frame, 'Restore backup');
  return frame.locator('textarea[data-action="edit-draft-backup"]');
}

async function compilePreview(frame: FrameLocator): Promise<void> {
  await openReviewPanel(frame);
  await frame.getByRole('button', { name: 'Preview full tour' }).click();
  await openUtilityTab(frame, 'Preview package');
}

function headingField(block: Locator): Locator {
  return block.getByRole('textbox', { name: 'Heading' });
}

function buttonActionSelect(block: Locator): Locator {
  return block.locator('select[data-action="set-action"]');
}

function previewRecord(frame: FrameLocator): Locator {
  return frame.locator('pre.compiled-output');
}

function activityLog(frame: FrameLocator): Locator {
  return frame.locator('pre.metrics-output');
}

function visibleInlineMenu(frame: FrameLocator): Locator {
  return frame.locator('.inline-command-menu:not([hidden])');
}

function targetMenu(frame: FrameLocator): Locator {
  return frame.locator('.target-menu:visible');
}

async function openTargetActions(
  frame: FrameLocator,
  block: Locator,
  targetLabel: string,
): Promise<void> {
  await block.getByRole('button', { name: `Placement ${targetLabel} actions` }).click();
  await expect(targetMenu(frame)).toBeVisible();
}

async function dispatchBlockDrag(
  frame: FrameLocator,
  sourceIndex: number,
  targetIndex: number,
): Promise<void> {
  const targetHandle = await frame.locator('.block').nth(targetIndex).elementHandle();
  if (!targetHandle) throw new Error('Block drop target missing');

  try {
    await frame
      .locator('.block')
      .nth(sourceIndex)
      .evaluate((sourceElement, targetElement) => {
        if (!(targetElement instanceof HTMLElement)) {
          throw new Error('Block drop target is not an element');
        }
        const sourceHandle = sourceElement.querySelector('.block-grip');
        if (!(sourceHandle instanceof HTMLElement)) {
          throw new Error('Block drag handle missing');
        }
        const dataTransfer = new DataTransfer();
        sourceHandle.dispatchEvent(
          new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }),
        );
        targetElement.dispatchEvent(
          new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }),
        );
        targetElement.dispatchEvent(
          new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }),
        );
      }, targetHandle);
  } finally {
    await targetHandle.dispose();
  }
}

async function attachTarget(
  page: Page,
  frame: FrameLocator,
  target: Locator,
  expectedLabels: string[],
): Promise<void> {
  await startTargetPick(frame);
  const panel = page.locator('lodariq-authoring-panel');
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
  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(0);
}

async function startTargetPick(frame: FrameLocator, block?: Locator): Promise<void> {
  const scope = block ?? frame.locator('.block').last();
  const pickButton = scope.getByRole('button', { name: /choose placement/i }).first();
  if ((await pickButton.count()) > 0) {
    await pickButton.click();
    return;
  }

  await scope.getByRole('button', { name: /^Placement .+ actions$/ }).first().click();
  await targetMenu(frame).getByRole('button', { name: 'Change placement' }).click();
}

interface BlockIdNode {
  id: string;
  content?: string;
  children?: BlockIdNode[];
}

function collectBlockIds(blocks: BlockIdNode[]): string[] {
  return blocks.flatMap((block) => [block.id, ...collectBlockIds(block.children ?? [])]);
}
