import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';
import type { CompiledDocument } from '@lodariq/schema';

const LOCAL_TOUR_DOCUMENT_ID = 'doc_tour_welcome';

test('fixture host installs the local SDK build and plays a tour', async ({ page }) => {
  const loadedUrls: string[] = [];
  page.on('request', (request) => loadedUrls.push(request.url()));

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));

  expect(loadedUrls.some((url) => url.includes('/src/lodariq-loader.ts'))).toBe(true);

  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Create your first project',
  );
});

test('launcher creates a distinct Tour and keeps page experiences in product', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));

  await page.getByRole('button', { name: 'Open Lodariq actions' }).click();
  await page.getByRole('button', { name: 'New experience' }).click();
  const typeChoices = page.locator('[data-lodariq-experience-type]');
  await expect(typeChoices).toHaveCount(1);
  await expect(typeChoices).toHaveAttribute('data-lodariq-experience-type', 'tour');
  await page.getByRole('button', { name: 'Create Tour' }).click();

  await expect(page.locator('lodariq-authoring-panel')).toBeVisible();
  await expect(page.getByLabel('Experience title')).toHaveValue('Untitled tour');
  const createdDocumentId = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith('lodariq:doc:doc_local_'),
    );
    if (!key) return null;
    return (JSON.parse(localStorage.getItem(key) ?? '{}') as { id?: string }).id ?? null;
  });
  expect(createdDocumentId).toMatch(/^doc_local_/);
  expect(createdDocumentId).not.toBe(LOCAL_TOUR_DOCUMENT_ID);

  await page.getByRole('button', { name: 'Close authoring' }).click();
  await expect(page.locator('lodariq-authoring-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Lodariq actions' }).click();
  await page.getByRole('button', { name: 'Experiences on this page' }).click();
  await expect(
    page.locator(`[data-lodariq-experience-id="${LOCAL_TOUR_DOCUMENT_ID}"]`),
  ).toBeVisible();
  await expect(
    page.locator(`[data-lodariq-experience-id="${createdDocumentId ?? 'missing'}"]`),
  ).toBeVisible();
});

test('creator authors and replays passive, button, delegated-link, and post-route steps', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lodariq actions' }).click();
  await page.getByRole('button', { name: 'New experience' }).click();
  await page.getByRole('button', { name: 'Create Tour' }).click();

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(frame.getByRole('main')).toBeVisible();

  await frame.getByRole('button', { name: 'Fix placement for step 1' }).click();
  await chooseCurrentTarget(page, frame, page.locator('article', { hasText: 'Active projects' }), [
    'Article',
  ]);

  await frame.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, frame, page.getByRole('button', { name: 'Open import modal' }), [
    'Open import modal',
  ]);

  await frame.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, frame, page.locator('[data-route="projects"]'), ['Projects']);
  await expect(frame.getByText('Projects · Placed').last()).toBeVisible();
  await frame.getByRole('button', { name: 'Clicks target' }).click();

  await page.locator('[data-route="projects"]').click();
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await frame.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(
    page,
    frame,
    page.locator('article', { hasText: 'Project workspace' }),
    ['Article'],
  );
  await expect(frame.locator('.tour-step-row')).toHaveCount(4);

  const delegatedTarget = await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('lodariq:doc:doc_local_')) continue;
      const document = JSON.parse(localStorage.getItem(key) ?? '{}') as {
        targets?: Array<{
          identity?: {
            captureEvidence?: { quality?: string; uniqueCandidateCount?: number };
            display?: { authorLabel?: string };
            intent?: { elementKind?: string; requiredAction?: string; resolutionMode?: string };
            localizedEvidence?: Array<{ accessibleName?: string }>;
          };
        }>;
      };
      const target = document.targets?.find(
        (candidate) => candidate.identity?.display?.authorLabel === 'Projects',
      );
      if (target) return target;
    }
    return null;
  });
  expect(delegatedTarget).toEqual(
    expect.objectContaining({
      identity: expect.objectContaining({
        intent: {
          elementKind: 'control',
          requiredAction: 'anchor',
          resolutionMode: 'semantic',
        },
        localizedEvidence: [expect.objectContaining({ accessibleName: 'Projects' })],
        captureEvidence: expect.objectContaining({ uniqueCandidateCount: 1 }),
      }),
    }),
  );
  expect(delegatedTarget?.identity?.captureEvidence?.quality).not.toBe('weak');

  await page.locator('[data-route="dashboard"]').click();
  await page.getByRole('button', { name: 'Close authoring' }).click();
  await page.getByRole('button', { name: 'Open Lodariq actions' }).click();
  await page.getByRole('button', { name: 'Preview as user' }).click();

  const tour = page.getByRole('dialog', { name: 'Lodariq tour' });
  await expect(tour).toBeVisible();
  await tour.getByRole('button', { name: 'Continue' }).click();
  await expect(tour).toBeVisible();
  await tour.getByRole('button', { name: 'Continue' }).click();
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const link = document.querySelector<HTMLElement>('[data-route="projects"]');
        const card = document
          .querySelector('lodariq-tour')
          ?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
        if (!link || !card || card.hidden) return false;
        const linkRect = link.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const horizontalGap = Math.max(
          0,
          Math.max(linkRect.left, cardRect.left) - Math.min(linkRect.right, cardRect.right),
        );
        const verticalGap = Math.max(
          0,
          Math.max(linkRect.top, cardRect.top) - Math.min(linkRect.bottom, cardRect.bottom),
        );
        return Math.min(horizontalGap, verticalGap) <= 12;
      });
    })
    .toBe(true);

  await page.locator('[data-route="projects"]').click();
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await expect(tour).toBeVisible();
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const target = [...document.querySelectorAll<HTMLElement>('article')].find((element) =>
          element.textContent?.includes('Project workspace'),
        );
        const card = document
          .querySelector('lodariq-tour')
          ?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
        if (!target || !card || card.hidden) return false;
        const gap = Math.round(
          card.getBoundingClientRect().top - target.getBoundingClientRect().bottom,
        );
        return gap >= 8 && gap <= 12;
      });
    })
    .toBe(true);
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

test('creator can display a themed outline around the selected tour target', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await openAuthoringPanel(page);

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const targetOutline = page.locator('[data-lodariq-target-outline]');
  await expect(targetOutline).toBeVisible();

  await frame.getByRole('button', { name: 'Customize' }).click();
  await expect(frame.getByRole('region', { name: 'Feel native to this product' })).toBeVisible();
  await expect(frame.locator('[data-appearance-step="3"]')).toContainText(
    'Adjust this experience only',
  );

  const outlineChoice = frame.getByRole('group', { name: 'Display target outline' });
  const outlineOff = outlineChoice.getByRole('button', { name: 'Off', exact: true });
  const outlineOn = outlineChoice.getByRole('button', { name: 'On', exact: true });
  await expect(outlineOn).toHaveAttribute('aria-pressed', 'true');
  await expect(outlineOff).toHaveAttribute('aria-pressed', 'false');

  await outlineOff.click();
  await expect(outlineOff).toHaveAttribute('aria-pressed', 'true');
  await expect(targetOutline).toHaveCount(0);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? '{}') as {
          appearance?: { displayTargetOutline?: boolean };
        };
        return stored.appearance?.displayTargetOutline;
      }),
    )
    .toBe(false);

  await page.reload();
  await openAuthoringPanel(page);
  await expect(targetOutline).toHaveCount(0);

  const reopenedFrame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await reopenedFrame.getByRole('button', { name: 'Customize' }).click();
  await expect(reopenedFrame.locator('[data-appearance-step="3"]')).toContainText(
    'Adjust this experience only',
  );
  const reopenedOutlineChoice = reopenedFrame.getByRole('group', {
    name: 'Display target outline',
  });
  await expect(
    reopenedOutlineChoice.getByRole('button', { name: 'Off', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  await reopenedOutlineChoice.getByRole('button', { name: 'On', exact: true }).click();
  await expect(targetOutline).toBeVisible();
  await expect(targetOutline).toHaveAttribute('aria-hidden', 'true');

  const target = page.getByRole('button', { name: 'New project', exact: true });
  const [targetBox, outlineBox] = await Promise.all([
    target.boundingBox(),
    targetOutline.boundingBox(),
  ]);
  if (!targetBox || !outlineBox) throw new Error('Tour target or target outline is missing');

  const leftGap = targetBox.x - outlineBox.x;
  const topGap = targetBox.y - outlineBox.y;
  const rightGap = outlineBox.x + outlineBox.width - (targetBox.x + targetBox.width);
  const bottomGap = outlineBox.y + outlineBox.height - (targetBox.y + targetBox.height);
  for (const gap of [leftGap, topGap, rightGap, bottomGap]) {
    expect(gap).toBeGreaterThanOrEqual(2);
    expect(gap).toBeLessThanOrEqual(4);
  }

  const outlineStyle = await targetOutline.evaluate((element) => {
    const style = getComputedStyle(element);
    const focusColor = style.getPropertyValue('--lq-tour-focus-color').trim();
    const colorProbe = document.createElement('span');
    colorProbe.style.color = focusColor;
    document.body.appendChild(colorProbe);
    const resolvedFocusColor = getComputedStyle(colorProbe).color;
    colorProbe.remove();
    return {
      borderColor: style.borderTopColor,
      boxShadow: style.boxShadow,
      focusColor: resolvedFocusColor,
      pointerEvents: style.pointerEvents,
    };
  });
  expect(outlineStyle.pointerEvents).toBe('none');
  expect(outlineStyle.borderColor).toBe(outlineStyle.focusColor);
  expect(outlineStyle.boxShadow).not.toBe('none');

  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? '{}') as {
          appearance?: { displayTargetOutline?: boolean };
        };
        return stored.appearance?.displayTargetOutline;
      }),
    )
    .toBe(true);

  await closeAuthoringPanel(page);
  await page.reload();
  await expect(page.locator('[data-lodariq-target-outline]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start tour' }).click();
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toBeVisible();
  await expect(page.locator('[data-lodariq-target-outline]')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Edit heading in preview' })).toHaveCount(0);
});

test('creator authors an editable tour step, chooses placement, and replays it', async ({
  page,
}) => {
  await page.goto('/');

  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  await page.getByLabel('Experience title').fill('Customer onboarding tour');
  await page.getByLabel('Experience title').blur();
  const saveState = frame.locator('[data-save-state-label]');
  await expect
    .poll(async () => ({
      saveState: await saveState.textContent(),
      stored: await page.evaluate(() =>
        (localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? '').includes(
          'Customer onboarding tour',
        ),
      ),
    }))
    .toEqual({ saveState: 'Draft saved', stored: true });

  const rail = frame.getByRole('complementary', { name: 'Tour steps' });
  await expect(rail).toBeVisible();
  await expect(frame.locator('.tour-step-row')).toHaveCount(1);
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await expect(frame.locator('.block')).toHaveCount(0);

  await moveAuthoringPanelOverTarget(
    page,
    page.getByRole('button', { name: 'New project', exact: true }),
  );
  const coveredTarget = await authoringPopupRects(page);
  expect(pageRectsOverlap(coveredTarget.host, coveredTarget.target)).toBe(true);

  await rail.getByRole('button', { name: 'Add step' }).click();
  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toHaveCount(0);
  const collapsedPicker = await authoringPopupRects(page);
  expect(collapsedPicker.host.height).toBe(44);
  expect(pageRectsOverlap(collapsedPicker.host, collapsedPicker.target)).toBe(false);
  await chooseCurrentTarget(page, frame, page.getByRole('button', { name: 'New project' }), [
    'New project',
  ]);

  await expect(frame.locator('.tour-step-row')).toHaveCount(2);
  const activeStep = frame.locator('.tour-step-row').last();
  await expect(activeStep.getByRole('button', { name: /^Edit step 2:/ })).toHaveAttribute(
    'aria-current',
    'step',
  );

  const inlineHeading = page.getByRole('textbox', { name: 'Edit heading in preview' });
  const inlineBody = page.getByRole('textbox', { name: 'Edit body text in preview' });
  const inlineButton = page.getByRole('textbox', { name: 'Edit button label in preview' });
  await expect(inlineHeading).toBeFocused();
  await moveAuthoringPanelAside(page);
  await replaceInlineContent(page, inlineHeading, 'Invite teammates');
  await replaceInlineContent(page, inlineBody, 'Share access so your team can collaborate.');
  await replaceInlineContent(page, inlineButton, 'Finish');

  const toolbar = page.getByRole('toolbar', { name: 'Step controls' });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole('combobox', { name: 'Button action' }).click();
  await toolbar.getByRole('option', { name: 'Complete', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain('"type":"complete"');
  await expect(activeStep).toContainText('Invite teammates');
  await expect(activeStep).toContainText('New project');

  await openAdvanced(frame);
  const stepBlock = frame.locator('.block').first();
  await expect(headingField(stepBlock)).toHaveValue('Invite teammates');
  await expect(stepBlock.getByLabel('Body text')).toHaveValue(
    'Share access so your team can collaborate.',
  );
  await expect(stepBlock.getByLabel('Button label')).toHaveValue('Finish');
  await expect(buttonActionSelect(stepBlock)).toHaveValue('complete');
  await expect(stepBlock.locator('.target-chip')).toContainText('New project');
  await openTargetActions(frame, stepBlock, 'New project');
  await openPlacementTroubleshooting(frame);
  await targetMenu(frame).getByRole('button', { name: 'Check placement' }).click();
  await expect(stepBlock.locator('.target-chip')).toContainText('Verified');
  await expect(frame.locator('#status')).toContainText(/Placement (?:check passed|verified)\./);
  await expect(targetMenu(frame)).toBeVisible();
  await targetMenu(frame).getByRole('button', { name: 'Show element on page' }).click();
  await expect(page.locator('[data-lodariq-bridge="target-reveal"]')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Invite teammates',
  );
  await expect(page.getByRole('textbox', { name: 'Edit button label in preview' })).toHaveText(
    'Finish',
  );

  await expect(await documentJson(frame)).toHaveValue(/Customer onboarding tour/);
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

test('creator places the popup beside a repeated passive summary card without drift', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const panel = page.locator('lodariq-authoring-panel');
  const summaryCard = page.locator('.project-summary article').first();
  const visibleValue = summaryCard.locator('strong');

  await frame.getByRole('button', { name: 'Change target for step 1' }).click();
  await expect(panel).toHaveAttribute('data-lodariq-target-picking', /^(?:true)?$/);
  await visibleValue.hover();
  await expect(page.locator('[data-lodariq-bridge="target-label-text"]')).toContainText('Article');
  await visibleValue.click({ force: true });

  await expect(page.getByRole('dialog', { name: 'Review placement' })).toHaveCount(0);
  await expect(panel).not.toHaveAttribute('data-lodariq-target-picking', 'true');
  await expect(frame.locator('#status')).toContainText('Placement verified.');
  await expect(frame.getByText('Drift detected', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toBeVisible();

  const [cardBox, popupBox] = await Promise.all([
    summaryCard.boundingBox(),
    page.getByRole('dialog', { name: 'Lodariq tour' }).boundingBox(),
  ]);
  if (!cardBox || !popupBox) throw new Error('Passive card or popup is missing');
  expect(pageRectsOverlap(rectFromBoundingBox(cardBox), rectFromBoundingBox(popupBox))).toBe(false);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? '{}') as {
          targets?: Array<{
            identity?: {
              intent?: { resolutionMode?: string };
              visualFingerprints?: Array<{
                layoutSlot?: { siblingIndex: number; siblingCount: number };
              }>;
            };
          }>;
        };
        const layoutTarget = stored.targets?.find(
          (target) => target.identity?.intent?.resolutionMode === 'layout-slot',
        );
        return layoutTarget?.identity?.visualFingerprints?.[0]?.layoutSlot ?? null;
      }),
    )
    .toEqual({ siblingIndex: 0, siblingCount: 3 });
});

test('creator edits rendered content directly and keeps the rail, JSON, and autosave synchronized', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const inlineHeading = page.getByRole('textbox', { name: 'Edit heading in preview' });
  const inlineBody = page.getByRole('textbox', { name: 'Edit body text in preview' });
  const inlineButton = page.getByRole('textbox', { name: 'Edit button label in preview' });
  const toolbar = page.getByRole('toolbar', { name: 'Step controls' });

  await expect(frame.getByRole('complementary', { name: 'Tour steps' })).toBeVisible();
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await expect(frame.locator('.block')).toHaveCount(0);
  await expect(inlineHeading).toBeVisible();
  await expect(inlineHeading).toHaveAttribute('contenteditable', 'plaintext-only');
  await expect(inlineBody).toBeVisible();
  await expect(inlineButton).toBeVisible();
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole('combobox', { name: 'Tooltip placement' })).toBeVisible();
  const actionCombobox = toolbar.getByRole('combobox', { name: 'Button action' });
  await expect(actionCombobox).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Open advanced step settings' })).toBeVisible();
  await actionCombobox.click();
  const actionListbox = toolbar.locator('[role="listbox"]:not([hidden])');
  await expect(actionListbox).toBeVisible();
  await expect
    .poll(() => actionListbox.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(255, 255, 255)');
  await actionCombobox.click();

  await moveAuthoringPanelIfCovering(page, inlineHeading);
  await inlineHeading.click();
  await expect(inlineHeading).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('Launch your');
  await page.waitForTimeout(450);
  await expect(inlineHeading).toBeFocused();
  await page.keyboard.insertText(' first project');
  await page.keyboard.press('Enter');
  await expect(inlineHeading).toHaveText('Launch your first project');
  await replaceInlineContent(page, inlineBody, 'Open a project and invite your team.');
  await replaceInlineContent(page, inlineButton, 'Create project');

  await openAdvanced(frame);
  const stepBlock = frame.locator('.block').first();
  await openTargetActions(frame, stepBlock, 'New project');
  const targetSurface = frame.locator('.target-popover:visible');
  await expect
    .poll(() => targetSurface.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(255, 255, 255)');
  await targetMenu(frame).getByRole('button', { name: 'Choose another element' }).press('Escape');
  await stepBlock.getByLabel('Step composer').fill('/link');
  const slashMenu = frame.locator('.step-command-menu:not([hidden])');
  await expect(slashMenu).toBeVisible();
  await expect
    .poll(() => slashMenu.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(255, 255, 255)');
  await stepBlock.getByLabel('Step composer').press('Enter');
  await expect(stepBlock.locator('.step-child-link')).toHaveCount(1);
  await stepBlock.getByLabel('Link label').fill('Learn more');
  await stepBlock.getByLabel('Link label').blur();
  await frame.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(frame.locator('.document-main')).toHaveCount(0);

  const inlineLink = page.getByRole('textbox', { name: 'Edit link label in preview' });
  await expect(inlineLink).toHaveText('Learn more');
  await expect(inlineLink).toHaveAttribute('contenteditable', 'plaintext-only');
  await replaceInlineContent(page, inlineLink, 'Read the launch notes');

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain('Launch your first project');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain('Open a project and invite your team.');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain('Create project');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain('Read the launch notes');

  await openAdvanced(frame);
  await expect(headingField(stepBlock)).toHaveValue('Launch your first project');
  await expect(stepBlock.getByLabel('Body text')).toHaveValue(
    'Open a project and invite your team.',
  );
  await expect(stepBlock.getByLabel('Button label')).toHaveValue('Create project');
  await expect(stepBlock.getByLabel('Link label')).toHaveValue('Read the launch notes');
  await expect(await documentJson(frame)).toHaveValue(/Read the launch notes/);

  await page.reload();
  await openAuthoringPanel(page);
  const reloadedFrame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(reloadedFrame.locator('.document-main')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Edit heading in preview' })).toHaveText(
    'Launch your first project',
  );
  await expect(page.getByRole('textbox', { name: 'Edit button label in preview' })).toHaveText(
    'Create project',
  );
  await expect(page.getByRole('textbox', { name: 'Edit link label in preview' })).toHaveText(
    'Read the launch notes',
  );
  await openAdvanced(reloadedFrame);
  const reloadedStep = reloadedFrame.locator('.block').first();
  await expect(headingField(reloadedStep)).toHaveValue('Launch your first project');
  await expect(reloadedStep.getByLabel('Body text')).toHaveValue(
    'Open a project and invite your team.',
  );
  await expect(reloadedStep.getByLabel('Button label')).toHaveValue('Create project');
  await expect(reloadedStep.getByLabel('Link label')).toHaveValue('Read the launch notes');
});

test('creator can add an editable tour step from the primary action', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const rail = frame.getByRole('complementary', { name: 'Tour steps' });
  await expect(rail).toBeVisible();
  await expect(frame.locator('.tour-step-row')).toHaveCount(1);
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await expect(frame.locator('.block')).toHaveCount(0);

  await rail.getByRole('button', { name: 'Add step' }).click();

  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(1);
  await chooseCurrentTarget(page, frame, page.getByRole('button', { name: 'New project' }), [
    'New project',
  ]);
  await expect(frame.locator('.tour-step-row')).toHaveCount(2);
  await expect(
    frame
      .locator('.tour-step-row')
      .last()
      .getByRole('button', { name: /^Edit step 2:/ }),
  ).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('textbox', { name: 'Edit heading in preview' })).toHaveText(
    'Untitled step',
  );
  await expect(page.getByRole('textbox', { name: 'Edit heading in preview' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Edit body text in preview' })).toHaveText(
    'Write supporting copy',
  );
  await expect(page.getByRole('textbox', { name: 'Edit button label in preview' })).toHaveText(
    'Continue',
  );
  await expect(page.getByRole('toolbar', { name: 'Step controls' })).toBeVisible();
  await expect(frame.locator('.document-main')).toHaveCount(0);
});

test('rail additions preserve the authored step order in the preview record', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const addStep = frame.getByRole('button', { name: 'Add step' });

  await addStep.click();
  await chooseCurrentTarget(page, frame, page.getByRole('button', { name: 'New project' }), [
    'New project',
  ]);
  await replaceInlineContent(
    page,
    page.getByRole('textbox', { name: 'Edit heading in preview' }),
    'Middle rail step',
  );

  await addStep.click();
  await chooseCurrentTarget(page, frame, page.getByRole('button', { name: 'New project' }), [
    'New project',
  ]);
  await replaceInlineContent(
    page,
    page.getByRole('textbox', { name: 'Edit heading in preview' }),
    'Last rail step',
  );

  const steps = frame.locator('.tour-step-row');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText('Create your first project');
  await expect(steps.nth(1)).toContainText('Middle rail step');
  await expect(steps.nth(2)).toContainText('Last rail step');

  await compilePreview(frame);
  const compiledPreview = (await previewRecord(frame).textContent()) ?? '';
  expect(compiledPreview.indexOf('Create your first project')).toBeLessThan(
    compiledPreview.indexOf('Middle rail step'),
  );
  expect(compiledPreview.indexOf('Middle rail step')).toBeLessThan(
    compiledPreview.indexOf('Last rail step'),
  );
});

test('creator can insert nested step content inline', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  await frame.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, frame, page.getByRole('button', { name: 'New project' }), [
    'New project',
  ]);
  await openAdvanced(frame);
  const stepBlock = frame.locator('.block').first();

  await stepBlock.hover();
  await stepBlock.getByLabel('Insert content at start of step').click();
  await visibleInlineMenu(frame).getByRole('menuitem', { name: /Text/ }).click();
  await expect(stepBlock.getByLabel('Body text')).toHaveCount(2);

  await stepBlock.hover();
  await stepBlock.getByLabel('Insert content at end of step').click();
  await visibleInlineMenu(frame).getByRole('menuitem', { name: /Media/ }).click();
  await expect(stepBlock.getByLabel('Media placeholder')).toHaveValue('Media placeholder');
  await expect(stepBlock).toContainText('Add media later');

  const composer = stepBlock.getByLabel('Step composer');
  await composer.fill('A composer-added note');
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue('A composer-added note');
  await composer.press('Enter');
  await expect(composer).toHaveValue('');
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
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await openAdvanced(frame);
  const stepBlock = frame.locator('.block').first();
  await expect(stepBlock.locator('.target-chip')).toContainText('New project');
  const initialChipCount = await frame.locator('.target-chip').count();

  await startTargetPick(frame, stepBlock);
  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(1);
  await expect(page.locator('[data-lodariq-bridge="target-veil"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel placement selection' })).toBeVisible();

  const candidate = page.locator('[data-lodariq-bridge="target-controls"]');
  await expect(candidate).toBeHidden();
  const guidance = page.locator('[data-lodariq-bridge="target-label"]');
  await expect(guidance).toBeVisible();
  await expect(guidance).toContainText(/Click to (attach|keep)/);
  await expect(page.getByRole('button', { name: 'Interact with the page once' })).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(0);
  await expect(page.locator('[data-lodariq-bridge="target-veil"]')).toHaveCount(0);
  await expect(page.locator('[data-lodariq-bridge="target-label"]')).toHaveCount(0);
  await expect(page.locator('[data-lodariq-bridge="target-cancel"]')).toHaveCount(0);
  await expect(frame.locator('#status')).toContainText('Placement selection canceled');

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(frame.locator('.target-chip')).toHaveCount(initialChipCount);
  await expect(stepBlock.locator('.target-chip')).toContainText('New project');
});

test('creator chooses, persists, reloads, and clears an exact area inside a placement', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  let frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await openAdvanced(frame);
  let stepBlock = frame.locator('.block').first();
  const panel = page.locator('lodariq-authoring-panel');

  await openTargetActions(frame, stepBlock, 'New project');
  await targetMenu(frame).getByRole('button', { name: 'Use exact area' }).click();

  const keyboardPicker = page.getByRole('group', {
    name: 'Choose an exact area inside the selected element',
  });
  await expect(panel).toHaveAttribute('data-lodariq-target-picking', 'true');
  await expect(panel.locator('.target-picking-label')).toHaveText(
    'Choose an exact area · Esc to cancel',
  );
  await expect(keyboardPicker).toBeFocused();
  expect((await authoringPopupRects(page)).host.height).toBe(44);

  await keyboardPicker.press('ArrowRight');
  await expect(page.locator('[data-lodariq-bridge="presentation-anchor-status"]')).toContainText(
    'Point moved',
  );
  await expect(keyboardPicker).toBeFocused();
  await keyboardPicker.press('Escape');

  await expect(keyboardPicker).toHaveCount(0);
  await expect(panel).not.toHaveAttribute('data-lodariq-target-picking', 'true');
  await expect.poll(async () => (await panel.boundingBox())?.height ?? 0).toBeGreaterThan(200);
  await expect(frame.locator('#status')).toContainText('Exact area selection canceled');
  await expect
    .poll(async () => (await storedTargetPresentation(page)).hasPresentationAnchor)
    .toBe(false);

  await openTargetActions(frame, stepBlock, 'New project');
  await targetMenu(frame).getByRole('button', { name: 'Use exact area' }).click();
  const pointerPicker = page.getByRole('group', {
    name: 'Choose an exact area inside the selected element',
  });
  const owner = page.getByRole('button', { name: 'New project', exact: true });
  await expect(pointerPicker).toBeVisible();
  await expect(panel).toHaveAttribute('data-lodariq-target-picking', 'true');
  const [ownerBox, pickerBox] = await Promise.all([
    owner.boundingBox(),
    pointerPicker.boundingBox(),
  ]);
  if (!ownerBox || !pickerBox) throw new Error('Exact-area owner or picker is missing');
  expect(ownerBox.width).toBeGreaterThan(20);
  expect(ownerBox.height).toBeGreaterThan(20);
  expect(pageRectsOverlap(rectFromBoundingBox(ownerBox), rectFromBoundingBox(pickerBox))).toBe(
    true,
  );

  const start = {
    x: ownerBox.x + ownerBox.width * 0.25,
    y: ownerBox.y + ownerBox.height * 0.25,
  };
  const end = {
    x: ownerBox.x + ownerBox.width * 0.75,
    y: ownerBox.y + ownerBox.height * 0.75,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();

  await expect(pointerPicker).toHaveCount(0);
  await expect(panel).not.toHaveAttribute('data-lodariq-target-picking', 'true');
  await expect.poll(async () => (await panel.boundingBox())?.height ?? 0).toBeGreaterThan(200);
  await expect(stepBlock.locator('.target-chip-anchor-mode')).toHaveText('Exact area');
  await expect(frame.locator('#status')).toContainText('Exact area set');
  await expect
    .poll(async () => (await storedTargetPresentation(page)).presentationAnchor?.kind ?? null)
    .toBe('region');

  const stored = await storedTargetPresentation(page);
  expect(stored.blockType).toBe('tooltip');
  expect(stored.targetId).toBe('target_new_project');
  expectNormalizedStoredRegion(stored.presentationAnchor);

  await page.reload();
  await openAuthoringPanel(page);
  frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await openAdvanced(frame);
  stepBlock = frame.locator('.block').first();
  await expect(stepBlock.locator('.target-chip-anchor-mode')).toHaveText('Exact area');

  await openTargetActions(frame, stepBlock, 'New project');
  const useWholeElement = targetMenu(frame).getByRole('button', { name: 'Use whole element' });
  await expect(useWholeElement).toBeVisible();
  await useWholeElement.click();

  await expect(stepBlock.locator('.target-chip-anchor-mode')).toHaveCount(0);
  await expect(frame.locator('#status')).toContainText('Using the whole element');
  await expect
    .poll(async () => (await storedTargetPresentation(page)).hasPresentationAnchor)
    .toBe(false);
});

test('local authoring and tour playback pass accessibility smoke checks', async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1500 });
  await page.goto('/');

  const authoringTrigger = page.getByRole('button', { name: 'Open Lodariq actions' });
  await expect(authoringTrigger).toBeVisible();
  await authoringTrigger.focus();
  await expect(authoringTrigger).toBeFocused();
  await authoringTrigger.press('Enter');
  await expect(authoringTrigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'New experience' })).toBeFocused();
  await page.keyboard.press('Tab');
  const experiencesOnPage = page.getByRole('button', {
    name: 'Experiences on this page',
  });
  await expect(experiencesOnPage).toBeFocused();
  await page.keyboard.press('Enter');
  const currentExperience = page.locator(
    `[data-lodariq-experience-id="${LOCAL_TOUR_DOCUMENT_ID}"]`,
  );
  await expect(currentExperience).toBeFocused();
  await page.keyboard.press('Enter');
  const authoringTriggerElement = page.locator('[data-lodariq-authoring-trigger="true"]');
  await expect(authoringTriggerElement).toHaveAttribute(
    'data-lodariq-authoring-panel-expanded',
    'true',
  );
  await expect(authoringTriggerElement).toHaveAttribute('aria-label', 'Minimize Lodariq authoring');
  await authoringTriggerElement.hover();
  await expect(page.getByRole('button', { name: 'New experience' })).toBeVisible();
  await expect(experiencesOnPage).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview as user' })).toBeVisible();
  const authoringPopup = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('[data-lodariq-authoring-trigger="true"]');
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const bar = host?.shadowRoot?.querySelector<HTMLElement>('.authoring-bar');
    const surface = host?.shadowRoot?.querySelector<HTMLElement>('.panel-surface');
    const rectOf = (element: Element | null | undefined) => {
      const rect = element?.getBoundingClientRect();
      return {
        height: rect?.height ?? Number.NaN,
        left: rect?.left ?? Number.NaN,
        top: rect?.top ?? Number.NaN,
        width: rect?.width ?? Number.NaN,
      };
    };
    return {
      bar: rectOf(bar),
      host: rectOf(host),
      surface: rectOf(surface),
      triggerPointerEvents: trigger ? getComputedStyle(trigger).pointerEvents : 'missing',
      triggerVisibility: trigger ? getComputedStyle(trigger).visibility : 'missing',
    };
  });
  expect(authoringPopup.host).toMatchObject({ width: 700, height: 620 });
  expect(authoringPopup.host.left).toBeGreaterThanOrEqual(18);
  expect(authoringPopup.host.top).toBeGreaterThanOrEqual(18);
  expect(authoringPopup.host.left + authoringPopup.host.width).toBeLessThanOrEqual(1080 - 18);
  expect(authoringPopup.bar).toMatchObject({
    left: authoringPopup.host.left,
    top: authoringPopup.host.top,
    width: 700,
    height: 50,
  });
  expect(authoringPopup.surface).toMatchObject({
    left: authoringPopup.host.left,
    top: authoringPopup.host.top + 50,
    width: 700,
    height: 570,
  });
  expect(authoringPopup.triggerVisibility).toBe('visible');
  expect(authoringPopup.triggerPointerEvents).toBe('auto');

  await authoringTriggerElement.click();
  await expect(page.locator('lodariq-authoring-panel')).toHaveAttribute(
    'data-lodariq-panel-minimized',
    'true',
  );
  await expect(authoringTriggerElement).toHaveAttribute('aria-label', 'Restore Lodariq authoring');
  await authoringTriggerElement.click();
  await expect(page.locator('lodariq-authoring-panel')).not.toHaveAttribute(
    'data-lodariq-panel-minimized',
    'true',
  );

  const tourDialog = page.getByRole('dialog', { name: 'Lodariq tour' });
  await expect(tourDialog).toBeVisible();
  const inlineButton = page.getByRole('textbox', { name: 'Edit button label in preview' });
  await expect(inlineButton).toBeVisible();

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const rail = frame.getByRole('complementary', { name: 'Tour steps' });
  await expect(rail).toBeVisible();
  const stepInspector = frame.getByRole('region', { name: 'Step 1 details' });
  await expect(stepInspector).toBeVisible();
  await expect(stepInspector).toContainText('Placement');
  await expect(stepInspector).toContainText('New project');
  await expect(stepInspector).toContainText('Content');
  await expect(
    stepInspector.getByRole('button', { name: 'Change target for step 1' }),
  ).toBeVisible();
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await expect(frame.locator('.block')).toHaveCount(0);
  const firstStep = frame.getByRole('button', { name: /Edit step 1:/ });
  await firstStep.focus();
  await expect(firstStep).toBeFocused();
  await expect(page.getByRole('toolbar', { name: 'Step controls' })).toBeVisible();

  await openAdvanced(frame);
  await expect(frame.locator('.panel-advanced-editor')).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
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
  await expect(frame.getByRole('button', { name: 'Back', exact: true })).toBeVisible();

  await expect(tourDialog).toBeVisible();
});

test('authoring stays modeless, draggable, and clamped inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openAuthoringPanel(page);
  await expect(page.locator('lodariq-authoring-panel')).toBeVisible();
  const initial = await authoringPopupRects(page);
  expect(initial.host).toMatchObject({ width: 700, height: 620 });
  expect(initial.host.left).toBeGreaterThanOrEqual(18);
  expect(initial.host.top).toBeGreaterThanOrEqual(18);
  expect(initial.bodyPaddingLeft).toBe('0px');

  await moveAuthoringPanelAside(page);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.locator('#settings-drawer')).toHaveClass(/open/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('#settings-drawer')).not.toHaveClass(/open/);

  await dragAuthoringPanel(page, { left: 842, top: 96 });
  await page.locator('[data-route="billing"]').click();
  await expect(page.locator('[data-view="billing"]')).toBeVisible();
  await page.locator('[data-route="dashboard"]').click();
  await expect(page.locator('[data-view="dashboard"]')).toBeVisible();

  await moveAuthoringPanelAside(page);
  const moved = await authoringPopupRects(page);
  expect(moved.host.left).toBeCloseTo(72, 0);
  expect(moved.host.top).toBeCloseTo(128, 0);
  expect(moved.target.left).toBeGreaterThan(moved.host.left + moved.host.width);
  const moveHandle = page.getByRole('button', { name: /Move Lodariq authoring panel/ });
  await moveHandle.focus();
  await moveHandle.press('ArrowRight');
  expect((await authoringPopupRects(page)).host.left).toBeCloseTo(88, 0);
  await moveHandle.press('ArrowLeft');
  expect((await authoringPopupRects(page)).host.left).toBeCloseTo(72, 0);

  await page.setViewportSize({ width: 900, height: 800 });
  await expect
    .poll(async () => {
      const { host } = await authoringPopupRects(page);
      return host.top + host.height;
    })
    .toBeLessThanOrEqual(800 - 18);
  const resized = await authoringPopupRects(page);
  expect(resized.host.width).toBe(700);
  expect(resized.host.left).toBeGreaterThanOrEqual(18);
  expect(resized.host.top).toBeGreaterThanOrEqual(18);
  expect(resized.host.left + resized.host.width).toBeLessThanOrEqual(900 - 18);
  expect(resized.host.top + resized.host.height).toBeLessThanOrEqual(800 - 18);
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator('lodariq-authoring-panel')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(320);
  const mobile = await authoringPopupRects(page);
  expect(mobile.host.width).toBe(320);
  expect(mobile.host.height).toBeCloseTo(480, 1);
  expect(mobile.host.left).toBeGreaterThanOrEqual(12);
  expect(mobile.host.top).toBeGreaterThanOrEqual(12);
  expect(mobile.host.left + mobile.host.width).toBeLessThanOrEqual(390 - 12);
  expect(mobile.host.top + mobile.host.height).toBeLessThanOrEqual(844 - 12);
  expect(mobile.bodyPaddingLeft).toBe('0px');
  const mobileOverflow = await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Lodariq authoring"]');
    const frameRoot = frame?.contentDocument?.documentElement;
    return {
      frame: frameRoot ? frameRoot.scrollWidth - frameRoot.clientWidth : Number.NaN,
      host: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(mobileOverflow).toEqual({ frame: 0, host: 0 });

  await page.setViewportSize({ width: 320, height: 568 });
  await expect
    .poll(() =>
      page
        .locator('lodariq-authoring-panel')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(296);
  const compact = await authoringPopupRects(page);
  expect(compact.host.height).toBeCloseTo(568 * 0.72, 1);
  expect(compact.host.left).toBeGreaterThanOrEqual(12);
  expect(compact.host.top).toBeGreaterThanOrEqual(12);
  expect(compact.host.left + compact.host.width).toBeLessThanOrEqual(320 - 12);
  expect(compact.host.top + compact.host.height).toBeLessThanOrEqual(568 - 12);
});

test('authoring chrome keeps workspace controls clear and primary actions in the footer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openAuthoringPanel(page);

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(page.locator('[data-panel-action="options"]')).toHaveCount(0);
  await expect(page.locator('.panel-options-menu')).toHaveCount(0);

  const layoutTrigger = page.locator('[data-panel-action="layout"]');
  await expect(layoutTrigger).toBeVisible();
  await expect(layoutTrigger).toHaveAttribute('role', 'combobox');
  await expect(layoutTrigger).toHaveAttribute('aria-label', 'Workspace width: Standard');
  await expect(layoutTrigger.locator('.panel-layout-trigger-icon')).toBeVisible();
  await expect(layoutTrigger.locator('.panel-layout-value')).toHaveText('Standard');
  await expect(layoutTrigger.locator('.panel-layout-chevron')).toBeVisible();

  await layoutTrigger.click();
  const visibleLayoutOptions = page.locator('.panel-layout-option:visible');
  await expect(visibleLayoutOptions).toHaveCount(2);
  await expect(visibleLayoutOptions.locator('.panel-layout-option-icon')).toHaveCount(2);
  await expect(page.locator('[data-panel-layout="compact"]:visible')).toContainText('Compact');
  await expect(page.locator('[data-panel-layout="focus"]:visible')).toContainText('Focused');
  await expect(page.locator('[data-panel-layout="standard"]:visible')).toHaveCount(0);

  const footer = frame.locator('.panel-workspace-footer');
  await expect(footer.getByRole('button', { name: 'Customize', exact: true })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Save & exit', exact: true })).toBeVisible();
  await expect(page.locator('.authoring-bar [data-save-state-label]')).toHaveCount(0);
  await expectAuthoringFooterStatusLayout(frame, 36);

  const zoomTrigger = page.locator('[data-panel-action="zoom"]');
  await expect(page.locator('select[aria-label="Editor zoom"]')).toHaveCount(0);
  await expect(zoomTrigger).toBeVisible();
  await expect(zoomTrigger).toHaveAttribute('role', 'combobox');
  await expect(zoomTrigger).toHaveAttribute('aria-label', 'Canvas zoom: 100%');
  await expect(zoomTrigger.locator('.panel-zoom-value')).toHaveText('100%');
  expect(await zoomTrigger.evaluate((element) => element.tagName)).toBe('BUTTON');
  expect(
    await zoomTrigger.evaluate(
      (element) => element.closest('.authoring-bar-actions') !== null,
    ),
  ).toBe(true);
  expect(
    await zoomTrigger.evaluate(
      (element) =>
        element.parentElement?.nextElementSibling?.querySelector(
          '[data-panel-action="layout"]',
        ) !== null,
    ),
  ).toBe(true);

  const [zoomBox, layoutBox] = await Promise.all([
    zoomTrigger.boundingBox(),
    layoutTrigger.boundingBox(),
  ]);
  if (!zoomBox || !layoutBox) throw new Error('Authoring zoom or width control is missing');
  expect(zoomBox.x + zoomBox.width).toBeLessThanOrEqual(layoutBox.x);
  expect(Math.abs(zoomBox.y + zoomBox.height / 2 - (layoutBox.y + layoutBox.height / 2))).toBeLessThan(
    1,
  );

  await zoomTrigger.click();
  const visibleZoomOptions = page.locator('.panel-zoom-option:visible');
  await expect(visibleZoomOptions).toHaveCount(3);
  await expect(page.locator('[data-panel-zoom="50"]:visible')).toHaveText('50%');
  await expect(page.locator('[data-panel-zoom="62"]:visible')).toHaveText('62%');
  await expect(page.locator('[data-panel-zoom="75"]:visible')).toHaveText('75%');
  await expect(page.locator('[data-panel-zoom="100"]:visible')).toHaveCount(0);
  await page.locator('[data-panel-zoom="62"]:visible').click();

  const iframe = page.locator('iframe[title="Lodariq authoring"]');
  await expect(zoomTrigger).toHaveAttribute('aria-label', 'Canvas zoom: 62%');
  await expect(zoomTrigger.locator('.panel-zoom-value')).toHaveText('62%');
  await expect
    .poll(() =>
      iframe.evaluate((element) => ({
        transform: element.style.transform,
        zoom: element.dataset['lodariqEditorZoom'],
      })),
    )
    .toEqual({
      transform: 'scale(0.62)',
      zoom: '62',
    });
  const zoomedDimensions = await iframe.evaluate((element) => ({
    height: Number.parseFloat(element.style.height),
    width: Number.parseFloat(element.style.width),
  }));
  expect(zoomedDimensions.height).toBeCloseTo(100 / 0.62, 2);
  expect(zoomedDimensions.width).toBeCloseTo(100 / 0.62, 2);

  await zoomTrigger.click();
  await expect(page.locator('[data-panel-zoom="100"]:visible')).toHaveText('100%');
  await expect(page.locator('[data-panel-zoom="62"]:visible')).toHaveCount(0);
  await zoomTrigger.press('Escape');
});

test('hybrid workspace keeps details stable, compacts, restores, and resizes accessibly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openAuthoringPanel(page);

  const host = page.locator('lodariq-authoring-panel');
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const inspector = frame.getByRole('region', { name: 'Step 1 details' });
  const accordion = frame.locator('.tour-step-accordion').first();

  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'standard');
  expect((await authoringPopupRects(page)).host).toMatchObject({ width: 700, height: 620 });
  await expect(inspector).toBeVisible();
  await expect(accordion).toBeHidden();
  await expect(inspector.getByText('Advance behavior', { exact: true })).toBeVisible();
  await expect(inspector.getByText('Next button', { exact: true })).toBeVisible();
  await expect(frame.locator('.tour-workspace-toggle')).toHaveCount(0);
  await expect(frame.locator('.tour-appearance-entry')).toHaveCount(0);
  await expect(frame.locator('.tour-step-position')).toHaveCount(0);
  await expect(frame.locator('.tour-step-advance')).toHaveCount(0);

  await selectAuthoringLayout(page, 'compact');
  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'compact');
  await expect.poll(async () => (await authoringPopupRects(page)).host.width).toBe(320);
  await expect.poll(async () => (await authoringPopupRects(page)).host.height).toBe(520);
  await expect(inspector).toBeHidden();
  await expect(accordion).toBeVisible();
  await expect(accordion.getByText('Behavior', { exact: true })).toBeVisible();
  await expect(accordion.getByText('Below · Next button', { exact: true })).toBeVisible();
  await expectAuthoringFooterStatusLayout(frame, 36);

  await selectAuthoringLayout(page, 'standard');
  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'standard');
  await expect.poll(async () => (await authoringPopupRects(page)).host.width).toBe(700);
  await expect(inspector).toBeVisible();

  await inspector.getByRole('button', { name: /Advanced settings/ }).click();
  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'standard');
  await expect.poll(async () => (await authoringPopupRects(page)).host.width).toBe(700);
  await expect.poll(async () => (await authoringPopupRects(page)).host.height).toBe(620);
  await expect(frame.locator('.panel-advanced-editor')).toBeVisible();
  await expect(frame.getByRole('complementary', { name: 'Tour steps' })).toBeVisible();

  const collapsedReviewWidth = await frame
    .locator('.review-drawer')
    .evaluate((element) => element.getBoundingClientRect().width);
  await frame.getByLabel('Review and preview details').click();
  await expect(frame.locator('.review-drawer')).toHaveAttribute('open', '');
  const expandedReviewWidth = await frame
    .locator('.review-drawer')
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(expandedReviewWidth).toBeCloseTo(collapsedReviewWidth, 1);

  await frame.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'standard');
  await expect.poll(async () => (await authoringPopupRects(page)).host.width).toBe(700);
  await expect(inspector).toBeVisible();

  const resizeHandle = page.getByRole('button', { name: /Resize Lodariq authoring panel/ });
  const resizeGrip = resizeHandle.locator('svg.panel-resize-icon path');
  await expect(resizeGrip).toHaveCount(1);
  expect(((await resizeGrip.getAttribute('d'))?.match(/M/g) ?? []).length).toBe(3);
  const [hostBox, resizeBox] = await Promise.all([host.boundingBox(), resizeHandle.boundingBox()]);
  if (!hostBox || !resizeBox) throw new Error('Authoring panel or resize grip is missing');
  expect(resizeBox.x + resizeBox.width).toBeCloseTo(hostBox.x + hostBox.width, 0);
  expect(resizeBox.y + resizeBox.height).toBeCloseTo(hostBox.y + hostBox.height, 0);
  await resizeHandle.focus();
  await resizeHandle.press('ArrowRight');
  await resizeHandle.press('Shift+ArrowDown');
  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'custom');
  const resized = (await authoringPopupRects(page)).host;
  expect(resized.width).toBe(708);
  expect(resized.height).toBe(660);

  await moveAuthoringPanelAside(page);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.locator('#settings-drawer')).toHaveClass(/open/);
});

test('resizing the rich-text editor keeps the inspector scrollable without resizing the panel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openAuthoringPanel(page);

  const host = page.locator('lodariq-authoring-panel');
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const inspector = frame.getByRole('region', { name: 'Step 1 details' });
  const editor = inspector.locator('.rich-step-content');
  const bottomControl = inspector.getByRole('button', { name: /Advanced settings/ });
  const initialPanel = (await authoringPopupRects(page)).host;

  await editor.evaluate((element) => {
    element.style.height = '400px';
  });
  const standardPanelAfterEditorResize = (await authoringPopupRects(page)).host;
  expect(standardPanelAfterEditorResize.width).toBe(initialPanel.width);
  expect(standardPanelAfterEditorResize.height).toBe(initialPanel.height);

  for (const workspace of ['standard', 'focus'] as const) {
    if (workspace === 'focus') {
      await selectAuthoringLayout(page, 'focus');
    }
    await expect(host).toHaveAttribute('data-lodariq-panel-layout', workspace);

    const metrics = await inspector.evaluate((element) => ({
      clientHeight: element.clientHeight,
      parentHeight: element.parentElement?.clientHeight ?? 0,
      scrollHeight: element.scrollHeight,
    }));
    expect(metrics.clientHeight).toBeLessThanOrEqual(metrics.parentHeight + 1);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    await inspector.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect
      .poll(async () =>
        bottomControl.evaluate((element) => {
          const control = element.getBoundingClientRect();
          const scrollContainer = element.closest('.tour-step-inspector')?.getBoundingClientRect();
          return Boolean(
            scrollContainer &&
            control.top >= scrollContainer.top - 1 &&
            control.bottom <= scrollContainer.bottom + 1,
          );
        }),
      )
      .toBe(true);
  }
});

test('Step Details add-content menu overlays every workspace without resizing the step', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openAuthoringPanel(page);

  const host = page.locator('lodariq-authoring-panel');
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await openAdvanced(frame);

  const composer = frame.getByRole('textbox', { name: 'Step composer' }).first();
  const openContentMenu = frame.getByRole('button', { name: 'Open add content menu' }).first();
  const commandMenu = frame.getByRole('listbox', { name: 'Step insert commands' });
  const stepDocument = frame.locator('.step-document').first();
  const workspaceModes = [
    { layout: 'standard', select: false },
    { layout: 'compact', select: true },
    { layout: 'focus', select: true },
  ] as const;

  for (const workspace of workspaceModes) {
    if (workspace.select) await selectAuthoringLayout(page, workspace.layout);
    await expect(host).toHaveAttribute('data-lodariq-panel-layout', workspace.layout);

    const closedStepHeight = await stepDocument.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    await composer.fill('/');
    await expect(commandMenu).toBeVisible();
    const geometry = await commandMenu.evaluate((element) => {
      const menu = element.getBoundingClientRect();
      return {
        frameWidth: element.ownerDocument.documentElement.clientWidth,
        iconWidth: element.querySelector('.command-icon')?.getBoundingClientRect().width ?? 0,
        labelFontSize: element.querySelector('.command-copy strong')
          ? getComputedStyle(element.querySelector('.command-copy strong')!).fontSize
          : '',
        menu: {
          clientWidth: element.clientWidth,
          left: menu.left,
          position: getComputedStyle(element).position,
          right: menu.right,
          scrollWidth: element.scrollWidth,
          width: menu.width,
        },
      };
    });

    expect(geometry.menu.position).toBe('fixed');
    expect(geometry.menu.width).toBeLessThanOrEqual(237);
    expect(geometry.menu.left).toBeGreaterThanOrEqual(8);
    expect(geometry.menu.right).toBeLessThanOrEqual(geometry.frameWidth - 8);
    expect(geometry.menu.scrollWidth).toBeLessThanOrEqual(geometry.menu.clientWidth);
    expect(geometry.iconWidth).toBeLessThanOrEqual(22);
    expect(geometry.labelFontSize).toBe('12px');
    expect(await stepDocument.evaluate((element) => element.getBoundingClientRect().height)).toBe(
      closedStepHeight,
    );

    await composer.fill('');
    await expect(commandMenu).toBeHidden();
    const closedBeforeButtonOpen = await stepDocument.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    await openContentMenu.click();
    await expect(commandMenu).toBeVisible();
    expect(await stepDocument.evaluate((element) => element.getBoundingClientRect().height)).toBe(
      closedBeforeButtonOpen,
    );
    await openContentMenu.click();
    await expect(commandMenu).toBeHidden();
  }
});

test('creator can save an incomplete button action without data loss', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  let frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  await openAdvanced(frame);
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
  await openAuthoringPanel(page);
  frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await openAdvanced(frame);
  const reloadedStep = frame.locator('.block').first();
  const reloadedButton = reloadedStep.locator('.step-child-button').last();

  await expect(reloadedButton.getByLabel('Button label')).toHaveValue('Learn more');
  await expect(buttonActionSelect(reloadedButton)).toHaveValue('');
  await expect(reloadedButton.locator('.button-field-shell.incomplete')).toHaveCount(1);
});

test('creator can remove a placement without losing step content', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await openAdvanced(frame);
  const stepBlock = frame.locator('.block').first();

  await expect(headingField(stepBlock)).toHaveValue('Create your first project');
  await startTargetPick(frame, stepBlock);
  await chooseCurrentTarget(
    page,
    frame,
    page.getByRole('button', { name: 'New project', exact: true }),
    ['New project'],
  );

  await expect(stepBlock.locator('.target-chip')).toContainText('New project');

  await openTargetActions(frame, stepBlock, 'New project');
  await openPlacementTroubleshooting(frame);
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
  await openAuthoringPanel(page);
  const reloadedFrame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const reloadedStep = reloadedFrame.locator('.tour-step-row').first();
  await expect(reloadedFrame.locator('.document-main')).toHaveCount(0);
  await expect(reloadedStep).toContainText('Create your first project');
  await expect(reloadedStep).toContainText('Not placed yet');
  await expect(
    reloadedFrame.getByRole('button', { name: 'Fix placement for step 1' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain("Projects help organize your team's work.");
});

test('tour advances after a real product target click opens a modal', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
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

  await closeAuthoringPanel(page);
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
  await openAuthoringPanel(page);
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
  await openReviewPanel(frame);
  await frame.getByRole('button', { name: 'Save draft', exact: true }).click();
  await compilePreview(frame);
  await expect(previewRecord(frame)).toContainText('clickTarget');

  await closeAuthoringPanel(page);
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
  await openAuthoringPanel(page);
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
  await updatePreviewPackage(frame);
  await expect(previewRecord(frame)).toContainText('openPanel');

  await closeAuthoringPanel(page);
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

  await openAuthoringPanel(page);
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
  await closeAuthoringPanel(page);

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

  await openAuthoringPanel(page);
  await selectAuthoringLayout(page, 'compact');
  await expect(page.locator('lodariq-authoring-panel')).toHaveAttribute(
    'data-lodariq-panel-layout',
    'compact',
  );
  await moveAuthoringPanelAside(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  const list = page.locator('#project-list');
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const finalProjectRow = page.locator('[data-view="projects"]:not([hidden]) .row', {
    hasText: 'Project 40',
  });
  await finalProjectRow.scrollIntoViewIfNeeded();
  const finalProjectButton = finalProjectRow.getByRole('button', { name: 'Open project' });
  await expect(finalProjectButton).toBeVisible();
  await attachTarget(page, frame, finalProjectButton, ['Open project']);

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

  await page.goto(`http://127.0.0.1:${process.env.LODARIQ_E2E_CUSTOMER_LIKE_HOST_PORT ?? '4188'}/`);
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));

  expect(loadedUrls.some((url) => url.includes('/src/lodariq-loader.ts'))).toBe(true);

  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();

  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await frame.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, frame, page.getByRole('button', { name: 'New project' }), [
    'New project',
  ]);
  await expect(frame.locator('.tour-step-row')).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Edit heading in preview' })).toBeFocused();
  await moveAuthoringPanelAside(page);
  await openUtilityTab(frame, 'Activity report');
  await expect(activityLog(frame)).toContainText('"timeToAttachFirstTargetMs"');
  await frame.getByRole('button', { name: 'Create activity report' }).click();
  await expect(activityLog(frame)).toContainText('"sessions"');
  await expect(activityLog(frame)).toContainText('"sessionId"');
  await closeAuthoringPanel(page);

  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Create your first project',
  );
});

async function moveAuthoringPanelAside(page: Page): Promise<void> {
  await dragAuthoringPanel(page, { left: 72, top: 128 });
}

async function moveAuthoringPanelOverTarget(page: Page, target: Locator): Promise<void> {
  const hostBox = await page.locator('lodariq-authoring-panel').boundingBox();
  const targetBox = await target.boundingBox();
  if (!hostBox || !targetBox) throw new Error('Authoring popup or product target missing');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Viewport size unavailable');
  const left = Math.min(
    Math.max(18, targetBox.x + targetBox.width / 2 - hostBox.width / 2),
    viewport.width - hostBox.width - 18,
  );
  await dragAuthoringPanel(page, {
    left,
    top: Math.max(82, targetBox.y - 10),
  });
}

async function dragAuthoringPanel(
  page: Page,
  target: { left: number; top: number },
): Promise<void> {
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });
      }),
  );

  const host = page.locator('lodariq-authoring-panel');
  const handle = page.getByRole('button', { name: /Move Lodariq authoring panel/ });
  const grip = host.locator('.panel-drag-grip');
  const hostBox = await host.boundingBox();
  const [handleBox, gripBox] = await Promise.all([handle.boundingBox(), grip.boundingBox()]);
  if (!hostBox || !handleBox || !gripBox) throw new Error('Draggable authoring popup missing');

  const deltaX = target.left - hostBox.x;
  const deltaY = target.top - hostBox.y;
  const startX = gripBox.x + gripBox.width / 2;
  const startY = gripBox.y + gripBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 });
  await page.mouse.up();

  const movedBox = await host.boundingBox();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Viewport size unavailable');
  const margin = viewport.width <= 600 ? 12 : 18;
  const expectedLeft = Math.min(
    Math.max(target.left, margin),
    viewport.width - hostBox.width - margin,
  );
  const expectedTop = Math.min(
    Math.max(target.top, margin),
    viewport.height - hostBox.height - margin,
  );
  expect(movedBox?.x).toBeCloseTo(expectedLeft, 0);
  expect(movedBox?.y).toBeCloseTo(expectedTop, 0);
}

interface PageRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

function rectFromBoundingBox(rect: {
  height: number;
  width: number;
  x: number;
  y: number;
}): PageRect {
  return { height: rect.height, left: rect.x, top: rect.y, width: rect.width };
}

function pageRectsOverlap(first: PageRect, second: PageRect): boolean {
  return !(
    first.left + first.width <= second.left ||
    second.left + second.width <= first.left ||
    first.top + first.height <= second.top ||
    second.top + second.height <= first.top
  );
}

async function authoringPopupRects(page: Page): Promise<{
  bodyPaddingLeft: string;
  host: PageRect;
  surface: PageRect;
  target: PageRect;
}> {
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const surface = host?.shadowRoot?.querySelector<HTMLElement>('.panel-surface');
    const target = document.querySelector<HTMLElement>('[data-lodariq-id="new-project"]');
    if (!host || !surface || !target) {
      throw new Error('Authoring popup or target missing');
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
      bodyPaddingLeft: getComputedStyle(document.body).paddingLeft,
      host: rectOf(host),
      surface: rectOf(surface),
      target: rectOf(target),
    };
  });
}

interface StoredPresentationAnchor {
  heightRatio?: number;
  kind?: string;
  widthRatio?: number;
  xRatio?: number;
  yRatio?: number;
}

interface StoredTargetPresentation {
  blockType: string | null;
  hasPresentationAnchor: boolean;
  presentationAnchor: StoredPresentationAnchor | null;
  targetId: string | null;
}

async function storedTargetPresentation(page: Page): Promise<StoredTargetPresentation> {
  return page.evaluate((storageKey) => {
    interface StoredBlock {
      children?: StoredBlock[];
      props?: Record<string, unknown>;
      type?: string;
    }

    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return {
        blockType: null,
        hasPresentationAnchor: false,
        presentationAnchor: null,
        targetId: null,
      };
    }
    const storedDocument = JSON.parse(raw) as { blocks?: StoredBlock[] };
    const findTargetTooltip = (blocks: StoredBlock[]): StoredBlock | null => {
      for (const block of blocks) {
        if (block.type === 'tooltip' && block.props?.['targetId'] === 'target_new_project') {
          return block;
        }
        const nested = findTargetTooltip(block.children ?? []);
        if (nested) return nested;
      }
      return null;
    };
    const tooltip = findTargetTooltip(storedDocument.blocks ?? []);
    const props = tooltip?.props;
    const presentationAnchor = props?.['presentationAnchor'];
    return {
      blockType: tooltip?.type ?? null,
      hasPresentationAnchor: Boolean(
        props && Object.prototype.hasOwnProperty.call(props, 'presentationAnchor'),
      ),
      presentationAnchor:
        presentationAnchor && typeof presentationAnchor === 'object'
          ? (presentationAnchor as StoredPresentationAnchor)
          : null,
      targetId: typeof props?.['targetId'] === 'string' ? props['targetId'] : null,
    };
  }, `lodariq:doc:${LOCAL_TOUR_DOCUMENT_ID}`);
}

function expectNormalizedStoredRegion(anchor: StoredPresentationAnchor | null): void {
  expect(anchor?.kind).toBe('region');
  const ratios = [anchor?.xRatio, anchor?.yRatio, anchor?.widthRatio, anchor?.heightRatio];
  for (const ratio of ratios) {
    expect(typeof ratio).toBe('number');
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
  }
  expect(anchor?.widthRatio).toBeGreaterThan(0);
  expect(anchor?.heightRatio).toBeGreaterThan(0);
  expect((anchor?.xRatio ?? 1) + (anchor?.widthRatio ?? 1)).toBeLessThanOrEqual(1);
  expect((anchor?.yRatio ?? 1) + (anchor?.heightRatio ?? 1)).toBeLessThanOrEqual(1);
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

async function openAuthoringPanel(page: Page): Promise<void> {
  const launcher = page.getByRole('button', { name: 'Open Lodariq actions' });
  await launcher.click();
  await page.getByRole('button', { name: 'Experiences on this page' }).click();
  await page.locator(`[data-lodariq-experience-id="${LOCAL_TOUR_DOCUMENT_ID}"]`).click();
  await expect(page.locator('lodariq-authoring-panel')).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Lodariq authoring"]').getByRole('main'),
  ).toBeVisible();
}

async function closeAuthoringPanel(page: Page): Promise<void> {
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const footer = frame.locator('.panel-workspace-footer');
  for (let attempt = 0; attempt < 3 && !(await footer.isVisible()); attempt += 1) {
    const back = frame
      .getByRole('button', { name: /^Back(?: to authoring)?$/ })
      .filter({ visible: true })
      .first();
    await expect(back).toBeVisible();
    await back.click();
  }
  await footer.getByRole('button', { name: 'Save & exit', exact: true }).click();
  await expect(page.locator('lodariq-authoring-panel')).toHaveCount(0);
}

async function expectAuthoringFooterStatusLayout(
  frame: FrameLocator,
  expectedControlHeight: number,
): Promise<void> {
  const footer = frame.locator('.panel-workspace-footer');
  const footerState = frame.locator('.panel-footer-state');
  const saveButton = footerState.getByRole('button', { name: 'Save & exit', exact: true });
  const saveStatus = footerState.locator('.panel-save-status[data-save-state]');
  const statusCopy = saveStatus.locator('.panel-save-status-copy');
  const draftLabel = statusCopy.locator('[data-save-state-label]');
  const releaseSummary = statusCopy.locator('.panel-release-summary');

  await expect(saveStatus).toHaveAttribute('data-state', 'saved');
  await expect(draftLabel).toBeVisible();
  await expect(draftLabel).toHaveText('Draft saved');
  await expect(releaseSummary).toContainText('Release unavailable');
  expect(
    await footerState.evaluate((element) =>
      Array.from(element.children).map((child) => child.className),
    ),
  ).toEqual(['panel-save-exit', 'panel-save-status']);
  expect(
    await statusCopy.evaluate((element) =>
      Array.from(element.children).map((child) => child.className),
    ),
  ).toEqual(['', 'panel-release-summary']);

  const saveStyle = await saveButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      color: style.color,
    };
  });
  expect(saveStyle).toEqual({
    backgroundColor: 'rgb(255, 247, 237)',
    borderColor: 'rgb(217, 119, 6)',
    color: 'rgb(154, 52, 18)',
  });

  const [saveBox, statusBox, draftBox, releaseBox] = await Promise.all([
    saveButton.boundingBox(),
    saveStatus.boundingBox(),
    draftLabel.boundingBox(),
    releaseSummary.boundingBox(),
  ]);
  if (!saveBox || !statusBox || !draftBox || !releaseBox) {
    throw new Error('Authoring footer save status is missing');
  }

  expect(saveBox.height).toBeCloseTo(expectedControlHeight, 0);
  expect(
    Math.abs(saveBox.y + saveBox.height / 2 - (statusBox.y + statusBox.height / 2)),
  ).toBeLessThan(
    1,
  );
  expect(statusBox.x - (saveBox.x + saveBox.width)).toBeCloseTo(
    expectedControlHeight === 36 ? 12 : 10,
    0,
  );
  expect(releaseBox.x).toBeCloseTo(draftBox.x, 0);
  expect(releaseBox.y).toBeGreaterThanOrEqual(draftBox.y + draftBox.height);

  const footerPadding = await footer.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      left: style.paddingLeft,
      right: style.paddingRight,
    };
  });
  expect(footerPadding.left).toBe(footerPadding.right);
}

async function selectAuthoringLayout(
  page: Page,
  mode: 'compact' | 'standard' | 'focus',
): Promise<void> {
  await page.locator('[data-panel-action="layout"]').click();
  const option = page.locator(`[data-panel-layout="${mode}"]:visible`);
  await expect(option).toBeVisible();
  await option.click();
}

async function openUtilityTab(
  frame: FrameLocator,
  name: 'Preview package' | 'Restore backup' | 'Activity report',
): Promise<void> {
  await openSupportDetails(frame);
  await frame.getByRole('tab', { name }).click();
}

async function openAdvanced(frame: FrameLocator): Promise<void> {
  const page = frame.owner().page();
  const advancedEditor = frame.locator('.panel-advanced-editor');
  if (await advancedEditor.isVisible()) return;

  const inlineDetails = page.getByRole('button', {
    name: 'Open advanced step settings',
    exact: true,
  });
  if (await inlineDetails.isVisible()) {
    await moveAuthoringPanelIfCovering(page, inlineDetails);
    await inlineDetails.click();
    await expect(advancedEditor).toBeVisible();
    await expect(frame.locator('.document-main')).toBeVisible();
    return;
  }

  const openDetails = frame
    .getByRole('button', { name: /^(?:Advanced settings|Edit details)/ })
    .filter({ visible: true })
    .first();
  await expect(openDetails).toBeVisible();
  await openDetails.click();
  await expect(advancedEditor).toBeVisible();
  await expect(frame.locator('.document-main')).toBeVisible();
}

async function openReviewPanel(frame: FrameLocator): Promise<void> {
  await openAdvanced(frame);
  const reviewDrawer = frame.locator('details.review-drawer');
  const reviewOpen = await reviewDrawer.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!reviewOpen) {
    await reviewDrawer.locator('summary').first().click();
  }
  await expect(reviewDrawer).toHaveAttribute('open', '');
}

async function openSupportDetails(frame: FrameLocator): Promise<void> {
  await openReviewPanel(frame);

  const drawer = frame.locator('details.utilities-drawer');
  const isOpen = await drawer.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await drawer.locator('summary').click();
  }
  await expect(drawer).toHaveAttribute('open', '');
}

async function documentJson(frame: FrameLocator): Promise<Locator> {
  await openUtilityTab(frame, 'Restore backup');
  return frame.locator('textarea[data-action="edit-draft-backup"]');
}

async function compilePreview(frame: FrameLocator): Promise<void> {
  await openReviewPanel(frame);
  await frame.getByRole('button', { name: 'Preview full tour' }).click();
  const panel = frame.owner().page().locator('lodariq-authoring-panel');
  await expect(panel).toHaveAttribute('data-lodariq-panel-minimized', 'true');
  await panel.getByRole('button', { name: 'Restore authoring panel', exact: true }).click();
  await expect(panel).not.toHaveAttribute('data-lodariq-panel-minimized', 'true');
  await openUtilityTab(frame, 'Preview package');
}

async function updatePreviewPackage(frame: FrameLocator): Promise<void> {
  await openUtilityTab(frame, 'Preview package');
  await frame.getByRole('button', { name: 'Update package' }).click();
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

async function openPlacementTroubleshooting(frame: FrameLocator): Promise<void> {
  const menu = targetMenu(frame);
  await menu.locator('summary[data-action="target-more-options"]').click();
  await menu.getByRole('tab', { name: 'Troubleshoot' }).click();
}

async function attachTarget(
  page: Page,
  frame: FrameLocator,
  target: Locator,
  expectedLabels: string[],
): Promise<void> {
  await startTargetPick(frame);
  await chooseCurrentTarget(page, frame, target, expectedLabels);
}

async function chooseCurrentTarget(
  page: Page,
  frame: FrameLocator,
  target: Locator,
  expectedLabels: string[],
): Promise<void> {
  const panel = page.locator('lodariq-authoring-panel');
  await expect(panel).toHaveAttribute('data-lodariq-target-picking', 'true');
  await target.hover();
  const pickerLabel = page.locator('[data-lodariq-bridge="target-label-text"]');
  for (const label of expectedLabels) {
    await expect(pickerLabel).toContainText(label);
  }
  // The picker intentionally cancels product pointer events. Hover first proves
  // the real hit target, then force the captured click past Playwright's own
  // click interceptor so Firefox and WebKit exercise the picker itself.
  await target.click({ force: true });
  const weakPlacementReview = page.getByRole('dialog', { name: 'Review placement' });
  if (await weakPlacementReview.isVisible()) {
    await weakPlacementReview.getByRole('button', { name: 'Keep in draft' }).click();
  }
  await expect(panel).not.toHaveAttribute('data-lodariq-target-picking', 'true');
  const chips = frame.locator('.target-chip');
  if ((await chips.count()) > 0) {
    for (const label of expectedLabels) {
      await expect(chips.last()).toContainText(label);
    }
  } else {
    const activeStep = frame.locator('.tour-step-select[aria-current="step"]');
    const activePlacement = frame.getByRole('region', { name: 'Placement' }).last();
    for (const label of expectedLabels) {
      const stepText = await activeStep.textContent();
      if (stepText?.includes(label)) {
        await expect(activeStep).toContainText(label);
      } else {
        await expect(activePlacement).toContainText(label);
      }
    }
  }
  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function startTargetPick(frame: FrameLocator, block?: Locator): Promise<void> {
  if (!block && !(await frame.locator('.panel-advanced-editor').isVisible())) {
    await frame
      .locator('.tour-step-row.active .tour-step-accordion')
      .getByRole('button', {
        name: /^(?:Choose|Change|Fix) element for step \d+$/,
      })
      .click();
    return;
  }

  const scope = block ?? frame.locator('.block').last();
  const pickButton = scope.getByRole('button', { name: /choose placement/i }).first();
  if ((await pickButton.count()) > 0) {
    await pickButton.click();
    return;
  }

  await scope
    .getByRole('button', { name: /^Placement .+ actions$/ })
    .first()
    .click();
  await targetMenu(frame).getByRole('button', { name: 'Choose another element' }).click();
}

async function replaceInlineContent(page: Page, field: Locator, value: string): Promise<void> {
  await moveAuthoringPanelIfCovering(page, field);
  if ((await field.getAttribute('aria-disabled')) === 'true') {
    await field.click({ force: true });
  } else {
    await field.click();
  }
  await expect(field).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
  await page.keyboard.press('Enter');
  await expect(field).toHaveText(value);
}

async function moveAuthoringPanelIfCovering(page: Page, target: Locator): Promise<void> {
  const panel = page.locator('lodariq-authoring-panel');
  const [panelBox, targetBox] = await Promise.all([panel.boundingBox(), target.boundingBox()]);
  if (!panelBox || !targetBox) return;
  const overlaps = !(
    panelBox.x + panelBox.width <= targetBox.x ||
    targetBox.x + targetBox.width <= panelBox.x ||
    panelBox.y + panelBox.height <= targetBox.y ||
    targetBox.y + targetBox.height <= panelBox.y
  );
  if (overlaps) await moveAuthoringPanelAside(page);
}

interface BlockIdNode {
  id: string;
  content?: string;
  children?: BlockIdNode[];
}

function collectBlockIds(blocks: BlockIdNode[]): string[] {
  return blocks.flatMap((block) => [block.id, ...collectBlockIds(block.children ?? [])]);
}
