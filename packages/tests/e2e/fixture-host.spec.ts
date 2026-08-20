import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { compileDocument } from '@lodariq/compiler';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type CompiledDocument,
  type LodariqBlock,
  type LodariqDocument,
} from '@lodariq/schema';

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

  await frame.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, frame, page.locator('article', { hasText: 'Active projects' }), [
    'Article',
  ]);

  await frame.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, frame, page.getByRole('button', { name: 'Open import modal' }), [
    'Open import modal',
  ]);

  await frame.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, frame, page.locator('[data-route="projects"]'), ['Projects']);
  await setInlineButtonAction(page, 'Click target');

  const panelMinimized = await minimizeAuthoringPanelIfCovering(
    page,
    page.locator('[data-route="projects"]'),
  );
  await page.locator('[data-route="projects"]').click();
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  if (panelMinimized) await restoreAuthoringPanel(page);
  await frame.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(
    page,
    frame,
    page.locator('article', { hasText: 'Project workspace' }),
    ['Article'],
  );
  await expect(frame.locator('.tour-storyboard-step')).toHaveCount(4);

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

  const panelMinimizedForDashboard = await minimizeAuthoringPanelIfCovering(
    page,
    page.locator('[data-route="dashboard"]'),
  );
  await page.locator('[data-route="dashboard"]').click();
  if (panelMinimizedForDashboard) await restoreAuthoringPanel(page);
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

test('runtime preserves recovery, flow, responsive, reduced-motion, accessible media, and focus paths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));
  const compiled = await compileDocument({
    document: capabilityTourDocument(),
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
  const focusReturnTarget = page.getByRole('button', { name: 'New project', exact: true });
  await focusReturnTarget.focus();
  await expect(focusReturnTarget).toBeFocused();

  await page.evaluate((document) => {
    return (
      window as {
        Lodariq: {
          playTour: (
            tour: CompiledDocument,
            options: { resolveMediaAsset: () => string },
          ) => Promise<void>;
        };
      }
    ).Lodariq.playTour(document, { resolveMediaAsset: () => '/favicon.svg' });
  }, compiled);

  const tour = page.getByRole('dialog', { name: 'Lodariq tour' });
  await expect(tour).toContainText('Waiting for recovery');
  await expect(tour).toContainText('Choose a path', { timeout: 5_000 });
  await expect(tour).toHaveAttribute('data-lodariq-popup-width', 'custom');
  await expect(tour).toHaveAttribute('data-lodariq-action-layout', 'stack');
  await expect(tour).toHaveAttribute('data-lodariq-motion', 'lift');
  await expect(tour).toHaveCSS('animation-name', 'none');
  await expect(tour).toHaveCSS('--lq-popup-width', '296px');
  await expect(page.getByRole('img', { name: 'Product preview' })).toBeVisible();

  const chooseBranch = tour.getByRole('button', { name: 'Choose branch' });
  await expect(chooseBranch).toBeFocused();
  await chooseBranch.press('Enter');
  await expect(tour).toContainText('English branch selected');
  await tour.getByRole('button', { name: 'Finish' }).press('Enter');
  await expect(tour).toHaveCount(0);
  await expect(focusReturnTarget).toBeFocused();
  await expect(page.locator('[data-lodariq-tour-completion-announcement]')).toHaveText(
    'Tour complete',
  );
});

test('creator can display a themed outline around the selected tour target', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await openAuthoringPanel(page);

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const targetOutline = page.locator('[data-lodariq-target-outline]');
  await expect(targetOutline).toBeVisible();

  await openCustomize(frame);
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
  await openCustomize(reopenedFrame);
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

  const rail = frame.getByRole('navigation', { name: 'Tour steps' });
  await expect(rail).toBeVisible();
  await expect(frame.locator('.tour-storyboard-step')).toHaveCount(1);
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

  await expect(frame.locator('.tour-storyboard-step')).toHaveCount(2);
  const activeStep = frame.locator('.tour-storyboard-step').last();
  await expect(activeStep.getByRole('button', { name: /^Edit step 2:/ })).toHaveAttribute(
    'aria-current',
    'step',
  );

  const richContent = await openRichContentEditor(frame);
  await replaceRichContentBlock(page, richContent.locator('h2').first(), 'Invite teammates');
  await replaceRichContentBlock(
    page,
    richContent.locator('p').first(),
    'Share access so your team can collaborate.',
  );
  await replaceCanvasButtonLabel(frame, 'Finish');

  const toolbar = page.getByRole('toolbar', { name: 'Step controls' });
  await expect(toolbar).toBeVisible();
  await setInlineButtonAction(page, 'Complete');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain('"type":"complete"');
  await expect(activeStep).toContainText('Invite teammates');
  await expect(activeStep.getByRole('button', { name: /^Edit step 2:/ })).toHaveAttribute(
    'aria-current',
    'step',
  );

  const canvasEditor = frame.getByRole('group', { name: 'Step content editor' });
  await expect(
    canvasEditor.locator('.rich-content-canvas').filter({ hasText: 'Invite teammates' }),
  ).toHaveCount(1);
  await expect(
    canvasEditor
      .locator('.rich-content-canvas')
      .filter({ hasText: 'Share access so your team can collaborate.' }),
  ).toHaveCount(1);
  await expect(canvasEditor.locator('.rich-content-button-preview')).toContainText('Finish');
  await openCanvasTargetActions(frame, 'New project');
  await openPlacementTroubleshooting(frame);
  await targetMenu(frame).getByRole('button', { name: 'Check placement' }).click();
  await expect(
    frame.getByRole('region', { name: 'Placement' }).locator('.target-chip'),
  ).toContainText('Verified');
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

  await startTargetPick(frame);
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

test('creator authors rich content in the tray and keeps output, JSON, and autosave synchronized', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const toolbar = page.getByRole('toolbar', { name: 'Step controls' });

  await expect(frame.getByRole('navigation', { name: 'Tour steps' })).toBeVisible();
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await expect(frame.locator('.block')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Edit heading in preview' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Edit body text in preview' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Edit button label in preview' })).toBeVisible();
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole('combobox', { name: 'Tooltip placement' })).toBeVisible();
  const actionCombobox = toolbar.getByRole('combobox', { name: 'Button action' });
  await expect(actionCombobox).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Open advanced step settings' })).toBeVisible();
  const panelMinimized = await minimizeAuthoringPanelIfCovering(page, actionCombobox);
  await actionCombobox.click();
  const actionListbox = toolbar.locator('[role="listbox"]:not([hidden])');
  await expect(actionListbox).toBeVisible();
  await expect
    .poll(() => actionListbox.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(255, 255, 255)');
  await actionCombobox.click();
  if (panelMinimized) await restoreAuthoringPanel(page);

  const richContent = await openRichContentEditor(frame);
  await replaceRichContentBlock(
    page,
    richContent.locator('h2').first(),
    'Launch your first project',
  );
  await replaceRichContentBlock(
    page,
    richContent.locator('p').first(),
    'Open a project and invite your team.',
  );
  await replaceCanvasButtonLabel(frame, 'Create project');

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
    .toContain('Open a project and invite your team.');

  const canvasEditor = frame.getByRole('group', { name: 'Step content editor' });
  await expect(
    canvasEditor
      .locator('.rich-content-canvas')
      .filter({ hasText: 'Launch your first project' }),
  ).toHaveCount(1);
  await expect(
    canvasEditor
      .locator('.rich-content-canvas')
      .filter({ hasText: 'Open a project and invite your team.' }),
  ).toHaveCount(1);
  await expect(canvasEditor.locator('.rich-content-button-preview')).toContainText('Create project');
  await expect(await documentJson(frame)).toHaveValue(/Launch your first project/);

  await page.reload();
  await openAuthoringPanel(page);
  const reloadedFrame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(reloadedFrame.locator('.document-main')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Launch your first project',
  );
  await expect(page.getByRole('textbox', { name: 'Edit button label in preview' })).toHaveText(
    'Create project',
  );
  const reloadedEditor = reloadedFrame.getByRole('group', { name: 'Step content editor' });
  await expect(
    reloadedEditor
      .locator('.rich-content-canvas')
      .filter({ hasText: 'Launch your first project' }),
  ).toHaveCount(1);
  await expect(
    reloadedEditor
      .locator('.rich-content-canvas')
      .filter({ hasText: 'Open a project and invite your team.' }),
  ).toHaveCount(1);
  await expect(reloadedEditor.locator('.rich-content-button-preview')).toContainText(
    'Create project',
  );
});

test('rich content preserves selected-range formatting while the author keeps typing', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const richContent = await openRichContentEditor(frame);
  const paragraph = richContent.locator('p').first();
  const paragraphText = "Projects help organize your team's work.";
  await paragraph.selectText();
  await expect
    .poll(() => paragraph.evaluate((element) => element.ownerDocument.getSelection()?.toString()))
    .toBe(paragraphText);
  const fontSize = frame
    .locator('.rich-content-editor')
    .getByRole('combobox', { name: 'Font size' });
  await fontSize.click();
  await fontSize.selectOption('24');

  await editorColorInput(frame, 'Selection background', '#ffeeaa');
  const animationButton = frame.locator('.rich-content-editor').getByRole('button', {
    name: 'Animation',
  });
  await animationButton.click();
  const animationMenu = frame.locator('.rich-content-animation-menu');
  await animationMenu.getByRole('combobox', { name: 'Animation effect' }).selectOption('lift');
  await animationMenu.getByRole('spinbutton', { name: 'Animation duration' }).fill('650');
  await animationMenu
    .getByRole('combobox', { name: 'Animation timing' })
    .selectOption('emphasized');

  const formattedRun = paragraph.locator('span').first();
  await expect(formattedRun).toHaveCSS('font-size', '24px');
  await expect(formattedRun).toHaveCSS('background-color', 'rgb(255, 238, 170)');
  await expect
    .poll(() =>
      formattedRun.evaluate((element) =>
        element.style.getPropertyValue('--lq-inline-motion').trim(),
      ),
    )
    .toBe('lift');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain('"recipe":"lift"');

  await richContent.click({ position: { x: 4, y: 4 } });
  await expect(animationMenu).toHaveCount(0);

  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Updated again!');
  await expect(paragraph).toHaveText("Projects help organize your team's work. Updated again!");
  await expect(formattedRun).toHaveCSS('font-size', '24px');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain("Projects help organize your team's work. Updated again!");
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    "Projects help organize your team's work. Updated again!",
  );
});

test('rich content links selected text and inserts display text for an empty selection', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const richContent = await openRichContentEditor(frame);
  const paragraph = richContent.locator('p').first();
  const editor = frame.locator('.rich-content-editor');
  const linkButton = editor.getByRole('button', { name: 'Link' });

  await selectRichContentTextRange(paragraph, 0, 8);
  const selectionStyle = await paragraph.evaluate((element) => {
    const style = getComputedStyle(element, '::selection');
    return { background: style.backgroundColor, shadow: style.textShadow };
  });
  expect(selectionStyle.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(selectionStyle.shadow).not.toBe('none');
  await linkButton.click();
  await expect(editor.getByRole('textbox', { name: 'Display as' })).toHaveValue('Projects');
  const selectedUrl = editor.getByRole('textbox', { name: 'Link URL' });
  await selectedUrl.fill('https://example.com/projects');
  await selectedUrl.press('Enter');
  const selectedLink = paragraph.locator('a').first();
  await expect(selectedLink).toHaveText('Projects');
  await expect(selectedLink).toHaveAttribute('href', 'https://example.com/projects');

  await paragraph.click();
  await page.keyboard.press('End');
  await linkButton.click();
  const displayUrl = editor.getByRole('textbox', { name: 'Link URL' });
  const displayAs = editor.getByRole('textbox', { name: 'Display as' });
  await displayUrl.fill('https://example.com/docs');
  await displayAs.fill('Read the docs');
  await displayAs.press('Enter');
  await expect(paragraph.locator('a').last()).toHaveText('Read the docs');

  await paragraph.click();
  await page.keyboard.press('End');
  await linkButton.click();
  const fullUrl = editor.getByRole('textbox', { name: 'Link URL' });
  await fullUrl.fill('https://example.com/help');
  await fullUrl.press('Enter');
  await expect(paragraph.locator('a').last()).toHaveText('https://example.com/help');
});

test('creator can add an editable tour step from the primary action', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const rail = frame.getByRole('navigation', { name: 'Tour steps' });
  await expect(rail).toBeVisible();
  await expect(frame.locator('.tour-storyboard-step')).toHaveCount(1);
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await expect(frame.locator('.block')).toHaveCount(0);

  await rail.getByRole('button', { name: 'Add step' }).click();

  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(1);
  await chooseCurrentTarget(page, frame, page.getByRole('button', { name: 'New project' }), [
    'New project',
  ]);
  await expect(frame.locator('.tour-storyboard-step')).toHaveCount(2);
  await expect(
    frame
      .locator('.tour-storyboard-step')
      .last()
      .getByRole('button', { name: /^Edit step 2:/ }),
  ).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('textbox', { name: 'Edit heading in preview' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Edit body text in preview' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText('Untitled step');
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
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
  let richContent = await openRichContentEditor(frame);
  await replaceRichContentBlock(page, richContent.locator('h2').first(), 'Middle rail step');

  await addStep.click();
  await chooseCurrentTarget(page, frame, page.getByRole('button', { name: 'New project' }), [
    'New project',
  ]);
  richContent = await openRichContentEditor(frame);
  await replaceRichContentBlock(page, richContent.locator('h2').first(), 'Last rail step');

  const steps = frame.locator('.tour-storyboard-step');
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

test('batch duplication is one reversible authoring transaction', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const steps = frame.locator('.tour-storyboard-step');
  await expect(steps).toHaveCount(1);

  await frame.getByRole('checkbox', { name: 'Select step 1 for batch changes' }).check();
  const batchActions = frame.getByRole('region', { name: 'Batch step actions' });
  await batchActions.getByRole('button', { name: 'Duplicate' }).click();
  await expect(steps).toHaveCount(2);

  await frame.getByRole('checkbox', { name: 'Select step 2 for batch changes' }).check();
  await expect(batchActions).toContainText('2 steps selected');
  await batchActions.getByRole('button', { name: 'Duplicate' }).click();
  await expect(steps).toHaveCount(4);
  await expect(frame.locator('#status')).toContainText('Duplicated 2 selected steps');

  await frame.locator('body').press('ControlOrMeta+z');
  await expect(steps).toHaveCount(2);
});

test('creator can add freeform rich content, media, icons, and dividers from the tray', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  await frame.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, frame, page.getByRole('button', { name: 'New project' }), [
    'New project',
  ]);
  const canvasEditor = frame.getByRole('group', { name: 'Step content editor' });
  const richContent = await openRichContentEditor(frame);
  await replaceRichContentBlock(page, richContent.locator('p').last(), 'A composer-added note');
  const insertMenu = await openCanvasInsertMenu(frame);
  await insertMenu.getByRole('menuitem', { name: 'Emoji' }).click();
  const grinningFace = frame.getByRole('gridcell', { name: 'Grinning face', exact: true });
  await expect(grinningFace).toBeVisible();
  await grinningFace.click();
  await grinningFace.click();
  await expect(grinningFace).toBeVisible();
  await richContent.locator('p').last().click();
  await expect(grinningFace).toHaveCount(0);

  const insertIcons = async (): Promise<void> => {
    const existing = frame.getByRole('button', { name: 'Party Popper' });
    if ((await existing.count()) === 0) {
      const menu = await openCanvasInsertMenu(frame);
      await menu.getByRole('menuitem', { name: 'Icon' }).click();
      await editorColorInput(frame, 'Icon color', '#c2410c');
    }
    await frame.getByRole('button', { name: 'Party Popper' }).click();
  };
  await insertIcons();
  await insertIcons();
  await expect(richContent.getByRole('img', { name: 'Party Popper' })).toHaveCount(2);
  const deletableIcon = richContent.getByRole('img', { name: 'Party Popper' }).last();
  await deletableIcon.click();
  await deletableIcon.press('Backspace');
  await expect(richContent.getByRole('img', { name: 'Party Popper' })).toHaveCount(1);
  const popupIcon = canvasEditor.locator('.rich-content-icon-preview').last();
  await expect(popupIcon).toHaveAttribute('aria-label', 'Party Popper');
  await expect(popupIcon).toHaveText('');
  await expect(popupIcon).toHaveCSS('color', 'rgb(194, 65, 12)');

  const dividerMenu = await openCanvasInsertMenu(frame);
  await dividerMenu.getByRole('menuitem', { name: 'Divider' }).click();
  await expect(richContent.locator('.rich-content-divider')).toHaveCount(1);

  const mediaMenu = await openCanvasInsertMenu(frame);
  await mediaMenu.getByRole('checkbox', { name: /Save to media library/ }).check();
  await mediaMenu.locator('input[accept^="image/"]').setInputFiles({
    name: 'pixel.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
  });
  await expect(frame.locator('.rich-content-insert-menu [role="progressbar"]')).toHaveCount(0);
  await expect(richContent.locator('.rich-content-media-preview')).toContainText('pixel.gif');
  const resizeImage = richContent.getByLabel('Resize image. Use arrow keys or drag any edge.');
  await expect(resizeImage.locator('.rich-content-media-resize-edge')).toHaveCount(8);
  await expect(resizeImage.locator('.rich-content-media-resize-handle')).toHaveCount(0);
  await resizeImage.focus();
  await resizeImage.press('ArrowLeft');
  await resizeImage.press('ArrowDown');
  await resizeImage.hover();
  await resizeImage
    .getByRole('combobox', { name: 'How media fills the frame' })
    .selectOption('cover');
  await expect(resizeImage.locator('img')).toHaveCSS('object-fit', 'cover');
  await expect(
    page.getByRole('dialog', { name: 'Lodariq tour' }).getByRole('img', { name: 'pixel.gif' }),
  ).toHaveCSS('object-fit', 'cover');

  await compilePreview(frame);
  await expect(previewRecord(frame)).toContainText('"type": "media"');
  await expect(previewRecord(frame)).toContainText('"widthPercent": 95');
  await expect(previewRecord(frame)).toContainText('"heightPx":');
  await expect(previewRecord(frame)).toContainText('"fit": "cover"');
  await expect(previewRecord(frame)).toContainText('A composer-added note');
  await expect(previewRecord(frame)).toContainText('"type": "icon"');
  await expect(previewRecord(frame)).toContainText('"type": "divider"');

  await frame.getByRole('button', { name: 'Back to editor', exact: true }).click();
  const refreshedRichContent = await openRichContentEditor(frame);
  const deletableImage = refreshedRichContent.getByLabel(
    'Resize image. Use arrow keys or drag any edge.',
  );
  await deletableImage.focus();
  await deletableImage.press('Backspace');
  await expect(
    refreshedRichContent.getByLabel('Resize image. Use arrow keys or drag any edge.'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('dialog', { name: 'Lodariq tour' }).getByRole('img', {
      name: 'pixel.gif',
    }),
  ).toHaveCount(0);
});

test('creator can cancel placement picking with Escape from the authoring iframe', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await openPlacementTray(frame);
  await expect(
    frame.getByRole('region', { name: 'Placement' }).locator('.target-chip'),
  ).toContainText('New project');

  await startTargetPick(frame);
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

  const panelMinimized = await minimizeAuthoringPanelIfCovering(
    page,
    page.getByRole('button', { name: 'New project' }),
  );
  await page.getByRole('button', { name: 'New project' }).click();
  if (panelMinimized) await restoreAuthoringPanel(page);
  await openPlacementTray(frame);
  await expect(
    frame.getByRole('region', { name: 'Placement' }).locator('.target-chip'),
  ).toContainText('New project');
});

test('creator chooses, persists, reloads, and clears an exact area inside a placement', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  let frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const panel = page.locator('lodariq-authoring-panel');

  await openCanvasTargetActions(frame, 'New project');
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

  await openCanvasTargetActions(frame, 'New project');
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
  await expect(
    frame.getByRole('region', { name: 'Placement' }).locator('.target-chip-anchor-mode'),
  ).toHaveText('Exact area');
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
  await openPlacementTray(frame);
  await expect(
    frame.getByRole('region', { name: 'Placement' }).locator('.target-chip-anchor-mode'),
  ).toHaveText('Exact area');

  await openCanvasTargetActions(frame, 'New project');
  const useWholeElement = targetMenu(frame).getByRole('button', { name: 'Use whole element' });
  await expect(useWholeElement).toBeVisible();
  await useWholeElement.click();

  await expect(
    frame.getByRole('region', { name: 'Placement' }).locator('.target-chip-anchor-mode'),
  ).toHaveCount(0);
  await expect(frame.locator('#status')).toContainText('Using the whole element');
  await expect
    .poll(async () => (await storedTargetPresentation(page)).hasPresentationAnchor)
    .toBe(false);
});

test('local authoring and tour playback pass accessibility smoke checks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
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
  await expect(page.getByRole('button', { name: 'New experience' })).not.toBeVisible();
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
  expect(authoringPopup.host).toMatchObject({ width: 1120, height: 800 });
  expect(authoringPopup.host.left).toBeGreaterThanOrEqual(16);
  expect(authoringPopup.host.top).toBeGreaterThanOrEqual(16);
  expect(authoringPopup.host.left + authoringPopup.host.width).toBeLessThanOrEqual(1440 - 16);
  expect(authoringPopup.bar).toMatchObject({
    left: authoringPopup.host.left,
    top: authoringPopup.host.top,
    width: 1120,
    height: 64,
  });
  expect(authoringPopup.surface).toMatchObject({
    left: authoringPopup.host.left,
    top: authoringPopup.host.top + 64,
    width: 1120,
    height: 736,
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
  const rail = frame.getByRole('navigation', { name: 'Tour steps' });
  await expect(rail).toBeVisible();
  const stepInspector = frame.getByRole('region', { name: 'Step 1 details' });
  await expect(stepInspector).toBeVisible();
  await expect(stepInspector).toContainText('Placement');
  await expect(stepInspector).toContainText('Rich content');
  await stepInspector.getByRole('button', { name: 'Placement', exact: true }).click();
  await expect(stepInspector.getByRole('region', { name: 'Placement' })).toContainText(
    'New project',
  );
  await expect(
    stepInspector.getByRole('button', { name: 'Placement New project actions' }),
  ).toBeVisible();
  await stepInspector.getByRole('button', { name: 'Rich content', exact: true }).click();
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await expect(frame.locator('.block')).toHaveCount(0);
  const firstStep = frame.getByRole('button', { name: /Edit step 1:/ });
  await firstStep.focus();
  await expect(firstStep).toBeFocused();
  await expect(page.getByRole('toolbar', { name: 'Step controls' })).toBeVisible();

  await openAdvanced(frame);
  await expect(frame.locator('.panel-advanced-editor')).toBeVisible();
  const backToEditor = frame.getByRole('button', { name: 'Back to editor', exact: true });
  await expect(backToEditor).toBeVisible();
  await expect(frame.getByRole('complementary', { name: 'Review and preview' })).toBeVisible();
  const editorHasHorizontalOverflow = await frame.locator('body').evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return html.scrollWidth > html.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1;
  });
  expect(editorHasHorizontalOverflow).toBe(false);
  await expect(backToEditor).toBeVisible();

  await expect(tourDialog).toBeVisible();
});

test('authoring chrome keeps workspace controls in the header and actions in the footer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openAuthoringPanel(page);

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(page.locator('[data-panel-action="preview"]')).toHaveCount(0);
  await expect(page.locator('[data-panel-action="release"]')).toHaveCount(0);
  await expect(page.locator('.authoring-bar [data-panel-save-state-label]')).toHaveCount(0);
  await expect(frame.getByRole('navigation', { name: 'Tour steps' })).toBeVisible();
  await expect(frame.getByRole('region', { name: 'Selected action style' })).toHaveCount(0);
  const footer = frame.getByRole('contentinfo', { name: 'Authoring actions' });
  await expect(footer).toBeVisible();

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

  await expect(footer.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Release options' })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Save & exit', exact: true })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Customize', exact: true })).toHaveCount(0);
  await expect(footer.getByRole('button', { name: 'Review & recovery' })).toHaveCount(0);
  const moreActions = footer.getByRole('button', { name: 'More experience actions' });
  await moreActions.click();
  await expect(frame.getByRole('menuitem', { name: /^Customize/ })).toBeVisible();
  await expect(frame.getByRole('menuitem', { name: /^Review & recovery/ })).toBeVisible();
  await moreActions.press('Escape');
  await expectAuthoringTrayStatus(frame);

  await openAdvanced(frame);
  await expect(footer).toBeVisible();
  await expect(
    frame.locator('.storyboard-advanced-panel').getByRole('button', { name: 'Preview' }),
  ).toHaveCount(0);

  const zoomTrigger = page.locator('[data-panel-action="zoom"]');
  await expect(page.locator('select[aria-label="Editor zoom"]')).toHaveCount(0);
  await expect(zoomTrigger).toBeVisible();
  await expect(zoomTrigger).toHaveAttribute('role', 'combobox');
  await expect(zoomTrigger).toHaveAttribute('aria-label', 'Canvas zoom: 100%');
  await expect(zoomTrigger.locator('.panel-zoom-value')).toHaveText('100%');
  expect(await zoomTrigger.evaluate((element) => element.tagName)).toBe('BUTTON');
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
  const storyboard = frame.getByRole('navigation', { name: 'Tour steps' });
  const tools = frame.getByRole('navigation', { name: 'Authoring tools' });

  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'standard');
  expect((await authoringPopupRects(page)).host).toMatchObject({ width: 1120, height: 800 });
  await expect(storyboard).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(tools).toBeVisible();
  await tools.getByRole('button', { name: 'Placement' }).click();
  await expect(frame.getByRole('region', { name: 'Placement' })).toBeVisible();
  await tools.getByRole('button', { name: 'Popup' }).click();
  await expect(frame.getByRole('region', { name: 'Popup layout settings' })).toBeVisible();
  await tools.getByRole('button', { name: 'Rich content' }).click();
  await expect(frame.getByRole('region', { name: 'Selected action style' })).toHaveCount(0);

  await selectAuthoringLayout(page, 'compact');
  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'compact');
  await expect.poll(async () => (await authoringPopupRects(page)).host.width).toBe(320);
  await expect.poll(async () => (await authoringPopupRects(page)).host.height).toBe(520);
  await expect(inspector).toBeVisible();
  await expect(storyboard).toBeVisible();
  await expect(tools).toBeVisible();
  expect(
    await frame.locator('body').evaluate((body) => body.scrollWidth > body.clientWidth + 1),
  ).toBe(false);
  await expectAuthoringTrayStatus(frame);

  await selectAuthoringLayout(page, 'standard');
  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'standard');
  await expect.poll(async () => (await authoringPopupRects(page)).host.width).toBe(1120);
  await expect(inspector).toBeVisible();

  await openAdvanced(frame);
  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'standard');
  await expect.poll(async () => (await authoringPopupRects(page)).host.width).toBe(1120);
  await expect.poll(async () => (await authoringPopupRects(page)).host.height).toBe(800);
  await expect(frame.locator('.panel-advanced-editor')).toBeVisible();
  await expect(frame.getByRole('navigation', { name: 'Tour steps' })).toBeVisible();

  const collapsedReviewWidth = await frame
    .locator('.review-drawer')
    .evaluate((element) => element.getBoundingClientRect().width);
  await frame.getByLabel('Review and preview details').click();
  await expect(frame.locator('.review-drawer')).toHaveAttribute('open', '');
  const expandedReviewWidth = await frame
    .locator('.review-drawer')
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(expandedReviewWidth).toBeCloseTo(collapsedReviewWidth, 1);

  await frame.getByRole('button', { name: 'Back to editor', exact: true }).click();
  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'standard');
  await expect.poll(async () => (await authoringPopupRects(page)).host.width).toBe(1120);
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
  await resizeHandle.press('ArrowLeft');
  await resizeHandle.press('Shift+ArrowUp');
  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'custom');
  const resized = (await authoringPopupRects(page)).host;
  expect(resized.width).toBe(1112);
  expect(resized.height).toBe(760);

  await moveAuthoringPanelAside(page);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.locator('#settings-drawer')).toHaveClass(/open/);
});

test('opening canvas configuration replaces the active side-action panel', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const tools = frame.getByRole('navigation', { name: 'Authoring tools' });
  await tools.getByRole('button', { name: 'Placement' }).click();
  await expect(frame.getByRole('region', { name: 'Placement' })).toBeVisible();
  await tools.getByRole('button', { name: 'Placement' }).click();

  await expect(frame.getByRole('region', { name: 'Placement' })).toHaveCount(0);
  await expect(frame.locator('.rich-content-editor')).toBeVisible();
  await expect(tools.getByRole('button', { name: 'Rich content' })).toHaveCount(0);

  await tools.getByRole('button', { name: 'Popup' }).click();
  await expect(frame.getByRole('region', { name: 'Popup layout settings' })).toBeVisible();
  await tools.getByRole('button', { name: 'Popup' }).click();

  await expect(frame.getByRole('region', { name: 'Popup layout settings' })).toHaveCount(0);
  await expect(frame.locator('.rich-content-editor')).toBeVisible();
});

test('resizing the rich-text editor keeps the storyboard tray accessible without resizing the panel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openAuthoringPanel(page);

  const host = page.locator('lodariq-authoring-panel');
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const inspector = frame.getByRole('region', { name: 'Step 1 details' });
  const editor = inspector.locator('.rich-step-popup-frame');
  const tools = frame.getByRole('navigation', { name: 'Authoring tools' });
  const initialPanel = (await authoringPopupRects(page)).host;

  await editor.evaluate((element) => {
    element.style.height = '400px';
  });
  const standardPanelAfterEditorResize = (await authoringPopupRects(page)).host;
  expect(standardPanelAfterEditorResize.width).toBe(initialPanel.width);
  expect(standardPanelAfterEditorResize.height).toBe(initialPanel.height);

  await tools.getByRole('button', { name: 'Popup' }).click();
  const tray = frame.getByRole('region', { name: 'Popup layout settings' });
  await expect(tray).toBeVisible();

  for (const workspace of ['standard', 'focus'] as const) {
    if (workspace === 'focus') {
      await selectAuthoringLayout(page, 'focus');
    }
    await expect(host).toHaveAttribute('data-lodariq-panel-layout', workspace);

    await expect(tray).toBeVisible();
    await expect(tools).toBeVisible();
    expect(
      await frame.locator('body').evaluate((body) => body.scrollWidth > body.clientWidth + 1),
    ).toBe(false);
  }
});

test('canvas popup supports pointer drag and persists corner resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openAuthoringPanel(page);

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const popup = frame.getByRole('group', { name: 'Step content editor' });
  const dragHandle = frame.getByRole('button', { name: 'Move popup in canvas' });
  await expect(popup).toHaveAttribute('data-transform-ready', 'true');

  const initialBox = await popup.boundingBox();
  const dragBox = await dragHandle.boundingBox();
  if (!initialBox || !dragBox) throw new Error('Canvas popup drag controls are missing');
  await expect
    .poll(() =>
      dragHandle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return document
          .elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          ?.closest<HTMLButtonElement>('button')?.ariaLabel;
      }),
    )
    .toBe('Move popup in canvas');
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + dragBox.width / 2 + 40, dragBox.y + dragBox.height / 2 + 24, {
    steps: 5,
  });
  await expect(dragHandle).toHaveAttribute('data-dragging', 'true');
  await page.mouse.up();

  await expect
    .poll(async () => (await popup.boundingBox())?.x ?? initialBox.x)
    .toBeGreaterThan(initialBox.x + 20);

  const resizeHandle = frame.getByRole('button', { name: 'Resize popup from bottom right' });
  const beforeResize = await popup.boundingBox();
  const resizeBox = await resizeHandle.boundingBox();
  if (!beforeResize || !resizeBox) throw new Error('Canvas popup resize controls are missing');
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    resizeBox.x + resizeBox.width / 2 + 40,
    resizeBox.y + resizeBox.height / 2 + 32,
    { steps: 5 },
  );
  await page.mouse.up();

  await expect
    .poll(async () => (await popup.boundingBox())?.width ?? beforeResize.width)
    .toBeGreaterThan(beforeResize.width + 20);
  await expect
    .poll(async () => (await popup.boundingBox())?.height ?? beforeResize.height)
    .toBeGreaterThan(beforeResize.height + 12);
  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const document = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as {
          blocks?: Array<{
            children?: unknown[];
            props?: { tooltipLayout?: { heightPx?: number; widthPx?: number } };
            type?: string;
          }>;
        };
        const pending = [...(document.blocks ?? [])];
        while (pending.length > 0) {
          const block = pending.shift();
          if (!block) continue;
          if (block.type === 'tooltip') return block.props?.tooltipLayout ?? null;
          pending.push(
            ...((block.children ?? []) as Array<{
              children?: unknown[];
              props?: { tooltipLayout?: { heightPx?: number; widthPx?: number } };
              type?: string;
            }>),
          );
        }
        return null;
      }, `lodariq:doc:${LOCAL_TOUR_DOCUMENT_ID}`),
    )
    .toEqual(
      expect.objectContaining({
        heightPx: expect.any(Number),
        widthPx: expect.any(Number),
      }),
    );
});

test('resizing the authoring panel keeps the canvas vertically scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await openAuthoringPanel(page);

  const host = page.locator('lodariq-authoring-panel');
  const resizeHandle = page.getByRole('button', { name: /Resize Lodariq authoring panel/ });
  await resizeHandle.focus();
  for (let resizeStep = 0; resizeStep < 16; resizeStep += 1) {
    await resizeHandle.press('Shift+ArrowUp');
  }

  await expect(host).toHaveAttribute('data-lodariq-panel-layout', 'custom');
  await expect.poll(async () => (await authoringPopupRects(page)).host.height).toBe(320);

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const canvasScroller = frame.locator('.storyboard-step-inspector');
  const editorStage = frame.locator('.storyboard-editor-stage');
  await expect(canvasScroller).toBeVisible();
  expect(await canvasScroller.evaluate((element) => getComputedStyle(element).overflowY)).toBe(
    'auto',
  );
  expect(
    await canvasScroller.evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);

  await editorStage.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await editorStage.hover({ position: { x: 8, y: 8 } });
  await page.mouse.wheel(0, 160);
  await expect
    .poll(async () => canvasScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(frame.getByRole('navigation', { name: 'Authoring tools' })).toBeVisible();
});

test('Step Details add-content menu overlays every workspace without resizing the step', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openAuthoringPanel(page);

  const host = page.locator('lodariq-authoring-panel');
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const stepDocument = frame.getByRole('group', { name: 'Step content editor' });
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
    const commandMenu = await openCanvasInsertMenu(frame);
    await expect(commandMenu).toBeVisible();
    const geometry = await commandMenu.evaluate((element) => {
      const menu = element.getBoundingClientRect();
      return {
        frameWidth: element.ownerDocument.documentElement.clientWidth,
        menu: {
          clientWidth: element.clientWidth,
          left: menu.left,
          position: getComputedStyle(element.closest('.rich-content-floating-layer') ?? element)
            .position,
          right: menu.right,
          scrollWidth: element.scrollWidth,
          width: menu.width,
        },
      };
    });

    expect(geometry.menu.position).toBe('fixed');
    expect(geometry.menu.left).toBeGreaterThanOrEqual(0);
    expect(geometry.menu.right).toBeLessThanOrEqual(geometry.frameWidth);
    expect(await stepDocument.evaluate((element) => element.getBoundingClientRect().height)).toBe(
      closedStepHeight,
    );

    await frame.getByRole('button', { name: 'Add content' }).click();
    await expect(commandMenu).toBeHidden();
  }
});

test('creator can add and save another button without data loss', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  let frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  let canvasEditor = frame.getByRole('group', { name: 'Step content editor' });
  const insertMenu = await openCanvasInsertMenu(frame);
  await insertMenu.getByRole('menuitem', { name: 'Button' }).click();
  const addedButton = canvasEditor.locator('.rich-content-button-preview').last();
  await addedButton.click();
  const label = canvasEditor.getByRole('textbox', { name: 'Button label' }).last();
  await label.fill('Learn more');
  await label.blur();
  await openReviewPanel(frame);
  await frame.getByRole('button', { name: 'Save draft', exact: true }).click();

  await page.reload();
  await openAuthoringPanel(page);
  frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  canvasEditor = frame.getByRole('group', { name: 'Step content editor' });
  await expect(canvasEditor.locator('.rich-content-button-preview').last()).toContainText(
    'Learn more',
  );
});

test('creator can remove a placement without losing step content', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const canvasEditor = frame.getByRole('group', { name: 'Step content editor' });
  await expect(
    canvasEditor
      .locator('.rich-content-canvas')
      .filter({ hasText: 'Create your first project' }),
  ).toHaveCount(1);

  await openCanvasTargetActions(frame, 'New project');
  await openPlacementTroubleshooting(frame);
  await targetMenu(frame).getByRole('button', { name: 'Remove placement' }).click();

  const placement = frame.getByRole('region', { name: 'Placement' });
  await expect(placement.locator('.target-chip')).toHaveCount(0);
  await expect(placement.getByRole('button', { name: 'Choose target for step 1' })).toBeVisible();
  await expect(
    canvasEditor
      .locator('.rich-content-canvas')
      .filter({ hasText: 'Create your first project' }),
  ).toHaveCount(1);
  await expect(
    canvasEditor
      .locator('.rich-content-canvas')
      .filter({ hasText: "Projects help organize your team's work." }),
  ).toHaveCount(1);
  await expect(frame.locator('#status')).toContainText('Removed placement; choose a new one');

  await page.reload();
  await openAuthoringPanel(page);
  const reloadedFrame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const reloadedStep = reloadedFrame.locator('.tour-storyboard-step').first();
  await expect(reloadedFrame.locator('.document-main')).toHaveCount(0);
  await expect(reloadedStep).toContainText('Create your first project');
  await reloadedFrame
    .getByRole('navigation', { name: 'Authoring tools' })
    .getByRole('button', { name: 'Placement' })
    .click();
  await expect(reloadedFrame.getByRole('region', { name: 'Placement' })).toContainText(
    'Not placed yet',
  );
  await expect(
    reloadedFrame
      .getByRole('region', { name: 'Placement' })
      .getByRole('button', { name: 'Choose target for step 1' }),
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

test('tour resumes the next step after an authored open-page action reloads the page', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const textarea = await documentJson(frame);
  const sourceDocument = JSON.parse(await textarea.inputValue()) as Record<string, unknown>;
  const navigationDocument = {
    ...sourceDocument,
    blocks: [
      {
        id: 'block_step_open_page',
        type: 'tourStep',
        props: { index: 0 },
        status: 'ready',
        children: [
          {
            id: 'block_tooltip_open_page',
            type: 'tooltip',
            props: { placement: 'bottom' },
            status: 'ready',
            children: [
              {
                id: 'block_heading_open_page',
                type: 'heading',
                props: { level: 2 },
                content: 'Open the settings page',
                children: [],
              },
              {
                id: 'block_button_open_page',
                type: 'button',
                content: 'Open settings',
                props: {
                  variant: 'primary',
                  action: {
                    type: 'openPage',
                    url: '/?authoredNavigation=1',
                    navigationBehavior: 'continue',
                  },
                },
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'block_step_after_open_page',
        type: 'tourStep',
        props: { index: 1 },
        status: 'ready',
        children: [
          {
            id: 'block_tooltip_after_open_page',
            type: 'tooltip',
            props: { placement: 'bottom' },
            status: 'ready',
            children: [
              {
                id: 'block_heading_after_open_page',
                type: 'heading',
                props: { level: 2 },
                content: 'Authored navigation resumed',
                children: [],
              },
              {
                id: 'block_button_finish_open_page',
                type: 'button',
                content: 'Finish',
                props: { variant: 'primary', action: { type: 'complete' } },
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
  await expect(previewRecord(frame)).toContainText('navigationBehavior');

  await closeAuthoringPanel(page);
  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );

  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Open the settings page',
  );
  const tour = page.getByRole('dialog', { name: 'Lodariq tour' });
  await Promise.all([
    page.waitForURL(/authoredNavigation=1/),
    tour.getByRole('button', { name: 'Open settings' }).click(),
  ]);
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));

  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText(
    'Authored navigation resumed',
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
  await expect(frame.locator('.tour-storyboard-step')).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Edit heading in preview' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toContainText('Untitled step');
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
  const hostBox = await host.boundingBox();
  const handleBox = await handle.boundingBox();
  if (!hostBox || !handleBox) throw new Error('Draggable authoring popup missing');

  const deltaX = target.left - hostBox.x;
  const deltaY = target.top - hostBox.y;
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 });
  await page.mouse.up();

  const movedBox = await host.boundingBox();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Viewport size unavailable');
  const margin = viewport.width <= 600 ? 12 : 16;
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

function capabilityTourDocument(): LodariqDocument {
  return {
    id: 'doc_capability_runtime_e2e',
    workspaceId: 'wk_local_dev',
    type: 'tour',
    status: 'draft',
    title: 'Capability runtime E2E',
    schemaVersion: '2.0.0',
    trigger: { type: 'manual' },
    audience: { environments: ['development', 'staging'] },
    targets: [],
    blocks: [
      capabilityStep('step-recovery', 0, 'Waiting for recovery', {
        entrySequence: {
          trigger: { type: 'manual' },
          waitFor: [{ type: 'event', eventName: 'event-that-never-arrives' }],
          transition: { type: 'next' },
          timeoutMs: 250,
          onTimeout: 'skip',
        },
      }),
      capabilityStep('step-choice', 1, 'Choose a path', {
        motion: {
          recipe: 'lift',
          durationMs: 220,
          easing: 'emphasized',
          reducedMotion: 'none',
        },
        responsive: {
          compact: {
            placement: 'bottom',
            widthPx: 296,
            actionLayout: 'stack',
            mediaVisible: true,
          },
        },
        media: true,
        action: {
          type: 'next',
          transition: {
            rules: [
              {
                all: [{ source: 'locale', locale: 'en' }],
                to: { type: 'step', stepId: 'step-english' },
              },
            ],
            fallback: { type: 'step', stepId: 'step-fallback' },
          },
        },
        actionLabel: 'Choose branch',
      }),
      capabilityStep('step-english', 2, 'English branch selected', {
        action: { type: 'complete' },
        actionLabel: 'Finish',
      }),
      capabilityStep('step-fallback', 3, 'Fallback branch selected', {
        action: { type: 'complete' },
        actionLabel: 'Finish',
      }),
    ],
  };
}

function capabilityStep(
  id: string,
  index: number,
  heading: string,
  options: {
    action?: LodariqBlock['props']['action'];
    actionLabel?: string;
    entrySequence?: LodariqBlock['props']['entrySequence'];
    media?: boolean;
    motion?: LodariqBlock['props']['motion'];
    responsive?: LodariqBlock['props']['responsive'];
  } = {},
): LodariqBlock {
  const body: LodariqBlock[] = [
    {
      id: `${id}-heading`,
      type: 'heading',
      content: heading,
      props: { level: 2 },
      children: [],
    },
  ];
  if (options.media) {
    body.push({
      id: `${id}-media`,
      type: 'media',
      content: 'Product preview',
      props: {
        media: {
          kind: 'image',
          assetId: 'asset-capability-e2e',
          accessibilityName: 'Product preview',
          aspectRatio: '16:9',
        },
      },
      status: 'ready',
      children: [],
    });
  }
  if (options.action) {
    body.push({
      id: `${id}-action`,
      type: 'button',
      content: options.actionLabel ?? 'Continue',
      props: { variant: 'primary', action: options.action },
      children: [],
    });
  }
  return {
    id,
    type: 'tourStep',
    props: {
      index,
      ...(options.entrySequence ? { entrySequence: options.entrySequence } : {}),
      ...(options.motion ? { motion: options.motion } : {}),
      ...(options.responsive ? { responsive: options.responsive } : {}),
    },
    status: 'ready',
    children: [
      {
        id: `${id}-tooltip`,
        type: 'tooltip',
        props: { placement: 'bottom' },
        status: 'ready',
        children: body,
      },
    ],
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

async function expectAuthoringTrayStatus(frame: FrameLocator): Promise<void> {
  const saveStatus = frame.locator('.panel-save-status[data-save-state]');
  const draftLabel = saveStatus.locator('[data-save-state-label]');
  const releaseSummary = saveStatus.locator('.panel-release-summary');

  await expect(saveStatus).toHaveAttribute('data-state', 'saved');
  await expect(draftLabel).toHaveText('Draft saved');
  await expect(releaseSummary).toContainText('Release unavailable');
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
  const reviewDrawer = frame.locator('details.review-drawer');
  if (await reviewDrawer.isVisible()) return;

  const advancedEditor = frame.locator('.panel-advanced-editor');
  if (!(await advancedEditor.isVisible())) {
    await openFooterOverflowAction(frame, 'Review & recovery');
  }
  await expect(advancedEditor).toBeVisible();
  await expect(frame.locator('.document-main')).toBeVisible();

  await frame.getByRole('button', { name: /^Edit details/ }).click();
  await expect(reviewDrawer).toBeVisible();
}

async function openCustomize(frame: FrameLocator): Promise<void> {
  await openFooterOverflowAction(frame, 'Customize');
  await expect(frame.getByRole('region', { name: 'Feel native to this product' })).toBeVisible();
}

async function openFooterOverflowAction(
  frame: FrameLocator,
  action: 'Customize' | 'Review & recovery',
): Promise<void> {
  const item = frame.getByRole('menuitem', { name: new RegExp(`^${action}`) });
  if (!(await item.isVisible())) {
    await frame.getByRole('button', { name: 'More experience actions' }).click();
  }
  await expect(item).toBeVisible();
  await item.click();
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
  await restoreAuthoringPanel(frame.owner().page());
  await openUtilityTab(frame, 'Preview package');
}

async function updatePreviewPackage(frame: FrameLocator): Promise<void> {
  await openUtilityTab(frame, 'Preview package');
  await frame.getByRole('button', { name: 'Update package' }).click();
}

function previewRecord(frame: FrameLocator): Locator {
  return frame.locator('pre.compiled-output');
}

function activityLog(frame: FrameLocator): Locator {
  return frame.locator('pre.metrics-output');
}

function targetMenu(frame: FrameLocator): Locator {
  return frame.locator('.target-menu:visible');
}

async function openPlacementTray(frame: FrameLocator): Promise<Locator> {
  const placement = frame.getByRole('region', { name: 'Placement' }).last();
  if (!(await placement.isVisible())) {
    await frame
      .getByRole('navigation', { name: 'Authoring tools' })
      .getByRole('button', { name: 'Placement' })
      .click();
  }
  await expect(placement).toBeVisible();
  return placement;
}

async function openCanvasTargetActions(frame: FrameLocator, targetLabel: string): Promise<void> {
  const placement = await openPlacementTray(frame);
  await placement.getByRole('button', { name: `Placement ${targetLabel} actions` }).click();
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
  const pickerLabel = page.locator('[data-lodariq-bridge="target-label-text"]');
  for (const label of expectedLabels) {
    await expect
      .poll(
        async () => {
          // A newly installed picker can miss the first synthetic pointer move
          // when Chromium reuses the prior cursor position. Move away and back
          // so the assertion waits on the real semantic hover signal.
          await page.mouse.move(1, 1);
          await target.hover();
          return pickerLabel.textContent();
        },
        { timeout: 5_000 },
      )
      .toContain(label);
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
    const tools = frame.getByRole('navigation', { name: 'Authoring tools' });
    await tools.getByRole('button', { name: 'Placement' }).click();
    const activePlacement = frame.getByRole('region', { name: 'Placement' }).last();
    for (const label of expectedLabels) {
      await expect(activePlacement).toContainText(label);
    }
    const contentTool = tools.getByRole('button', { name: 'Rich content' });
    await expect(contentTool).toBeVisible();
    await expect(contentTool).toBeEnabled();
    // Returning from target picking restores the panel geometry. Linux WebKit
    // can report subpixel movement for this dock indefinitely, even though the
    // control is visible and usable, so bypass only that stability heuristic.
    await contentTool.click({ force: true });
    await expect(contentTool).toHaveAttribute('aria-pressed', 'true');
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
    const placement = await openPlacementTray(frame);
    const directAction = placement.getByRole('button', {
      name: /^(?:Choose target|Fix placement) for step \d+$/,
    });
    if ((await directAction.count()) > 0) {
      await directAction.click();
      return;
    }
    await placement.getByRole('button', { name: /^Placement .+ actions$/ }).click();
    await targetMenu(frame).getByRole('button', { name: 'Choose another element' }).click();
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

async function openCanvasInsertMenu(frame: FrameLocator): Promise<Locator> {
  const canvas = frame.locator('.rich-content-canvas');
  await canvas.hover({ position: { x: 24, y: 16 } });
  await frame.getByRole('button', { name: 'Add content' }).click();
  const menu = frame.locator('.rich-content-insert-menu');
  await expect(menu).toBeVisible();
  return menu;
}

async function openRichContentEditor(frame: FrameLocator): Promise<Locator> {
  const editor = frame.locator('.rich-content-editor');
  await expect(editor).toBeVisible();
  return editor.getByRole('textbox', { name: 'Rich content' });
}

async function editorColorInput(
  frame: FrameLocator,
  accessibleName: string,
  color: string,
): Promise<void> {
  const input = frame.getByLabel(accessibleName);
  await input.evaluate((element, value) => {
    const colorInput = element as HTMLInputElement;
    colorInput.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(colorInput, value);
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    colorInput.dispatchEvent(new Event('change', { bubbles: true }));
  }, color);
  await expect(input).toHaveValue(color);
}

async function replaceCanvasButtonLabel(frame: FrameLocator, value: string): Promise<void> {
  const canvas = frame.getByRole('group', { name: 'Step content editor' });
  const preview = canvas.locator('.rich-content-button-preview').first();
  await preview.click();
  const field = canvas.getByRole('textbox', { name: 'Button label' }).first();
  await field.fill(value);
  await field.blur();
  await expect(field).toHaveValue(value);
}

async function replaceRichContentBlock(page: Page, block: Locator, value: string): Promise<void> {
  await expect(block).toBeVisible();
  await block.evaluate((element) => {
    const editor = element.closest<HTMLElement>('[contenteditable="true"]');
    editor?.focus();
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const selection = element.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await page.keyboard.insertText(value);
  await expect(block).toHaveText(value);
}

async function selectRichContentTextRange(
  block: Locator,
  startOffset: number,
  endOffset: number,
): Promise<void> {
  await block.click();
  await block.evaluate(
    (element, offsets) => {
      const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode();
      if (!textNode?.textContent) throw new Error('Rich-content text is missing');
      const range = element.ownerDocument.createRange();
      range.setStart(textNode, offsets.startOffset);
      range.setEnd(textNode, Math.min(offsets.endOffset, textNode.textContent.length));
      const selection = element.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      element.ownerDocument.dispatchEvent(new Event('selectionchange'));
    },
    { endOffset, startOffset },
  );
}

async function setInlineButtonAction(page: Page, action: string): Promise<void> {
  const toolbar = page.getByRole('toolbar', { name: 'Step controls' });
  const actionCombobox = toolbar.getByRole('combobox', { name: 'Button action' });
  const panelMinimized = await minimizeAuthoringPanelIfCovering(page, actionCombobox);
  await actionCombobox.click();
  await toolbar.getByRole('option', { name: action, exact: true }).click();
  if (panelMinimized) await restoreAuthoringPanel(page);
}

async function minimizeAuthoringPanelIfCovering(page: Page, target: Locator): Promise<boolean> {
  const panel = page.locator('lodariq-authoring-panel');
  const [panelBox, targetBox] = await Promise.all([panel.boundingBox(), target.boundingBox()]);
  if (!panelBox || !targetBox) return false;
  const overlaps = !(
    panelBox.x + panelBox.width <= targetBox.x ||
    targetBox.x + targetBox.width <= panelBox.x ||
    panelBox.y + panelBox.height <= targetBox.y ||
    targetBox.y + targetBox.height <= panelBox.y
  );
  if (!overlaps) return false;
  await page.getByRole('button', { name: 'Minimize authoring panel' }).click();
  await expect(panel).toHaveAttribute('data-lodariq-panel-minimized', 'true');
  return true;
}

async function restoreAuthoringPanel(page: Page): Promise<void> {
  const panel = page.locator('lodariq-authoring-panel');
  await page.getByRole('button', { name: 'Restore Lodariq authoring', exact: true }).click();
  await expect(panel).not.toHaveAttribute('data-lodariq-panel-minimized', 'true');
}

interface BlockIdNode {
  id: string;
  content?: string;
  children?: BlockIdNode[];
}

function collectBlockIds(blocks: BlockIdNode[]): string[] {
  return blocks.flatMap((block) => [block.id, ...collectBlockIds(block.children ?? [])]);
}
