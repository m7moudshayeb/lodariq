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

function authoringFilmstrip(page: Page): Locator {
  return page.getByRole('button', { name: 'Add step', exact: true });
}

function authoringFilmstripSteps(page: Page): Locator {
  return page.getByRole('button', { name: /^Edit step \d+:/ });
}

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

  await closeAuthoringPanel(page);
  await page.getByRole('button', { name: 'Open Lodariq actions' }).click();
  await page.getByRole('button', { name: 'Experiences on this page' }).click();
  await expect(
    page.locator(`[data-lodariq-experience-id="${LOCAL_TOUR_DOCUMENT_ID}"]`),
  ).toBeVisible();
  await expect(
    page.locator(`[data-lodariq-experience-id="${createdDocumentId ?? 'missing'}"]`),
  ).toBeVisible();
});

test('creator authors passive, button, delegated-link, and post-route steps', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lodariq actions' }).click();
  await page.getByRole('button', { name: 'New experience' }).click();
  await page.getByRole('button', { name: 'Create Tour' }).click();

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(page.getByLabel('Experience title')).toBeVisible();
  await expect(frame.getByRole('main')).toBeVisible();
  // The tour is authored where it will run: a passive card and a button on the
  // dashboard, the sidebar link that carries it across a route, and the step
  // waiting on the other side.
  await collapseAuthoringOverlay(page);
  await page.locator('[data-route="dashboard"]').click();
  await restoreAuthoringPanel(page);
  await page.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(
    page,
    page.locator('section.card[aria-label="Seats in use"]'),
    ['Seats in use'],
    { x: 4, y: 4 },
  );

  await page.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, page.locator('[data-open-modal="report"]'), ['New report']);

  await page.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, page.locator('[data-route="projects"]'), ['Projects']);
  await setInlineButtonAction(page, 'Click target');

  await collapseAuthoringOverlay(page);
  await page.locator('[data-route="projects"]').click();
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await restoreAuthoringPanel(page);
  await page.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, page.locator('[data-lodariq-id="new-project"]'), [
    'Create project',
  ]);
  // Distinct copy on the last step, so replay can prove which step it reached.
  await replaceCanvasButtonLabel(frame, 'Finish');
  await expect(authoringFilmstripSteps(page)).toHaveCount(4);

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
  await collapseAuthoringOverlay(page);
  await page.locator('[data-route="dashboard"]').click();
  await restoreAuthoringPanel(page);

  // Replay from the delegated-link step: clicking the product's own link has to
  // both advance the tour and carry it across the route change that follows.
  const replayStep = authoringFilmstripSteps(page).nth(2);
  await replayStep.click();
  await expect(replayStep).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: 'More authoring actions' }).click();
  await page.getByRole('menuitem', { name: 'Preview as user', exact: true }).click();

  const tour = page.locator('lodariq-tour').locator('[role="dialog"]');
  // The runtime resolves its target before it shows anything, so the card
  // appears a beat after the preview starts.
  await expect(tour).toBeVisible({ timeout: 15_000 });

  // Clicking the product's own link both advances the tour and carries it
  // across the route change, which replaces every node on the page.
  await page.locator('[data-route="projects"]').click();
  await expect(page).toHaveURL(/#\/projects/);
  await expect(tour).toBeVisible({ timeout: 15_000 });
  await expect(tour).toContainText('Finish');
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
  const focusReturnTarget = page.locator('[data-lodariq-id="new-project"]');
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

  const target = page.locator('[data-lodariq-id="new-project"]');
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
  // Meridian ships no Lodariq controls, so the tour starts through the SDK's own
  // API — the same call a customer's product would make.
  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );
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
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? '').includes(
          'Customer onboarding tour',
        ),
      ),
    )
    .toBe(true);

  const rail = authoringFilmstrip(page);
  await expect(rail).toBeVisible();
  await expect(authoringFilmstripSteps(page)).toHaveCount(1);
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await expect(frame.locator('.block')).toHaveCount(0);

  await rail.click();
  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toHaveCount(0);
  await chooseCurrentTarget(page, page.locator('[data-lodariq-id="new-project"]'), [
    'Create project',
  ]);

  await expect(authoringFilmstripSteps(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Edit step 2:/ })).toHaveAttribute(
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
  await setInlineButtonAction(page, 'Complete tour');

  const canvasEditor = frame.getByRole('group', { name: 'Step content editor' });
  await expect(
    canvasEditor.locator('.rich-content-canvas').filter({ hasText: 'Invite teammates' }),
  ).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain('"type":"complete"');
  await expect(page.getByRole('button', { name: /Invite teammates/ })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await expect(
    canvasEditor
      .locator('.rich-content-canvas')
      .filter({ hasText: 'Share access so your team can collaborate.' }),
  ).toHaveCount(1);
  await expect(canvasEditor.locator('.rich-content-button-preview')).toContainText('Finish');
  await openCanvasTargetActions(frame);
  await openPlacementTroubleshooting(frame);
  await targetMenu(frame).getByRole('button', { name: 'Check placement' }).click();
  await expect(frame.locator('.target-chip')).toContainText('Verified');
  await expect(frame.locator('#status')).toContainText(/Placement (?:check passed|verified)\./);
  await expect(targetMenu(frame)).toBeVisible();
  await targetMenu(frame).getByRole('button', { name: 'Show element on page' }).click();
  await expect(page.locator('[data-lodariq-bridge="target-reveal"]')).toHaveCount(1);
  await backToOverlayEditor(frame);
  await expect(canvasEditor).toContainText('Invite teammates');
  await expect(canvasEditor.locator('.rich-content-button-preview')).toContainText('Finish');

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
  // Meridian ships no Lodariq controls, so the tour starts through the SDK's own
  // API — the same call a customer's product would make.
  await page.evaluate(() =>
    (window as { Lodariq: { playTour: () => Promise<void> } }).Lodariq.playTour(),
  );
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
  // Two workspace cards with the same shape and the same name: nothing but the
  // layout slot separates them, which is the case this test exists for.
  const summaryCard = page.locator('.reliability-stage article').first();
  const visibleValue = summaryCard;

  await startTargetPick(frame);
  await expect(panel).toHaveAttribute('data-lodariq-target-picking', /^(?:true)?$/);
  await visibleValue.hover({ position: { x: 4, y: 4 } });
  await expect(page.locator('[data-lodariq-bridge="target-label-text"]')).toContainText(
    'Project workspace',
  );
  await visibleValue.click({ force: true });

  const placementReview = page.getByRole('dialog', { name: 'Review placement' });
  if (await placementReview.isVisible().catch(() => false)) {
    await placementReview.getByRole('button', { name: 'Keep in draft' }).click();
  }
  await expect(panel).not.toHaveAttribute('data-lodariq-target-picking', 'true');
  await expect(frame.getByText('Drift detected', { exact: true })).toHaveCount(0);
  await expect(frame.getByRole('group', { name: 'Step content editor' })).toBeVisible();

  // Nothing but position separates these cards, so the stored evidence has to
  // say which of the siblings was chosen — otherwise the popup drifts to the
  // other one the next time the page renders.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? '{}') as {
          targets?: Array<{
            identity?: {
              visualFingerprints?: Array<{
                layoutSlot?: { siblingIndex: number; siblingCount: number };
              }>;
            };
          }>;
        };
        const slot = (stored.targets ?? [])
          .flatMap((target) => target.identity?.visualFingerprints ?? [])
          .map((fingerprint) => fingerprint.layoutSlot)
          .find((candidate) => candidate !== undefined);
        if (!slot) return null;
        return { pinned: slot.siblingCount > 1, indexed: slot.siblingIndex >= 0 };
      }),
    )
    .toEqual({ pinned: true, indexed: true });
});

test('creator authors rich content in the tray and keeps output, JSON, and autosave synchronized', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  await expect(authoringFilmstrip(page)).toBeVisible();
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await expect(frame.locator('.block')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Edit heading in preview' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Edit body text in preview' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Edit button label in preview' })).toHaveCount(0);
  await expect(frame.getByRole('group', { name: 'Step content editor' })).toBeVisible();
  await expect(frame.getByRole('combobox', { name: 'After click' })).toHaveCount(0);

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
    canvasEditor.locator('.rich-content-canvas').filter({ hasText: 'Launch your first project' }),
  ).toHaveCount(1);
  await expect(
    canvasEditor
      .locator('.rich-content-canvas')
      .filter({ hasText: 'Open a project and invite your team.' }),
  ).toHaveCount(1);
  await expect(canvasEditor.locator('.rich-content-button-preview')).toContainText(
    'Create project',
  );
  await expect(await documentJson(frame)).toHaveValue(/Launch your first project/);

  await page.reload();
  await openAuthoringPanel(page);
  const reloadedFrame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(reloadedFrame.locator('.document-main')).toHaveCount(0);
  await expect(reloadedFrame.getByRole('group', { name: 'Step content editor' })).toContainText(
    'Launch your first project',
  );
  await expect(reloadedFrame.locator('.rich-content-button-preview')).toContainText(
    'Create project',
  );
  const reloadedEditor = reloadedFrame.getByRole('group', { name: 'Step content editor' });
  await expect(
    reloadedEditor.locator('.rich-content-canvas').filter({ hasText: 'Launch your first project' }),
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
  await frame.getByRole('button', { name: 'More formatting' }).click();
  await chooseEditorOption(frame, 'Font size', '24px');

  await editorColorInput(frame, 'Selection background', '#ffeeaa');

  const formattedRun = paragraph.locator('span').first();
  await expect(formattedRun).toHaveCSS('font-size', '24px');
  await expect(formattedRun).toHaveCSS('background-color', 'rgb(255, 238, 170)');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain('"fontSizePx":24');

  await richContent.click({ position: { x: 4, y: 4 } });

  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Updated again!');
  await expect(paragraph).toHaveText("Projects help organize your team's work. Updated again!");
  await expect(formattedRun).toHaveCSS('font-size', '24px');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain("Projects help organize your team's work. Updated again!");
  await expect(frame.getByRole('group', { name: 'Step content editor' })).toContainText(
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
  const linkButton = frame.getByRole('button', { name: 'Link' });

  await selectRichContentTextRange(paragraph, 0, 8);
  const selectionStyle = await paragraph.evaluate((element) => {
    const style = getComputedStyle(element, '::selection');
    return { background: style.backgroundColor, shadow: style.textShadow };
  });
  expect(selectionStyle.background).not.toBe('rgba(0, 0, 0, 0)');
  await linkButton.click({ force: true });
  await expect(frame.getByRole('textbox', { name: 'Display as' })).toHaveValue('Projects');
  const selectedUrl = frame.getByRole('textbox', { name: 'Link URL' });
  await selectedUrl.fill('https://example.com/projects');
  await selectedUrl.press('Enter');
  const selectedLink = paragraph.locator('a').first();
  await expect(selectedLink).toHaveText('Projects');
  await expect(selectedLink).toHaveAttribute('href', 'https://example.com/projects');

  await paragraph.click();
  await page.keyboard.press('End');
  await linkButton.click({ force: true });
  const displayUrl = frame.getByRole('textbox', { name: 'Link URL' });
  const displayAs = frame.getByRole('textbox', { name: 'Display as' });
  await displayUrl.fill('https://example.com/docs');
  await displayAs.fill('Read the docs');
  await displayAs.press('Enter');
  await expect(paragraph.locator('a').last()).toHaveText('Read the docs');

  await paragraph.click();
  await paragraph.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = element.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.press('Escape');
  await linkButton.evaluate((button) => (button as HTMLButtonElement).click());
  const fullUrl = frame.getByRole('textbox', { name: 'Link URL' });
  await expect(fullUrl).toBeVisible();
  await fullUrl.fill('https://example.com/help');
  await fullUrl.press('Enter');
  await expect(paragraph.locator('a').last()).toHaveText('https://example.com/help');
});

test('creator can add an editable tour step from the primary action', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const rail = authoringFilmstrip(page);
  await expect(rail).toBeVisible();
  await expect(authoringFilmstripSteps(page)).toHaveCount(1);
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await expect(frame.locator('.block')).toHaveCount(0);

  await rail.click();

  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(1);
  await chooseCurrentTarget(page, page.locator('[data-lodariq-id="new-project"]'), [
    'Create project',
  ]);
  await expect(authoringFilmstripSteps(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Edit step 2:/ })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await expect(page.getByRole('textbox', { name: 'Edit heading in preview' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Edit body text in preview' })).toHaveCount(0);
  await expect(frame.getByRole('group', { name: 'Step content editor' })).toContainText(
    'Untitled step',
  );
  await expect(frame.getByRole('group', { name: 'Step content editor' })).toContainText(
    'Write supporting copy',
  );
  await expect(frame.locator('.rich-content-button-preview')).toContainText('Continue');
  await expect(frame.locator('.document-main')).toHaveCount(0);
});

test('rail additions preserve the authored step order in the preview record', async ({ page }) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const addStep = page.getByRole('button', { name: 'Add step' });

  await addStep.click();
  await chooseCurrentTarget(page, page.locator('[data-lodariq-id="new-project"]'), [
    'Create project',
  ]);
  let richContent = await openRichContentEditor(frame);
  await replaceRichContentBlock(page, richContent.locator('h2').first(), 'Middle rail step');

  await addStep.click();
  await chooseCurrentTarget(page, page.locator('[data-lodariq-id="new-project"]'), [
    'Create project',
  ]);
  richContent = await openRichContentEditor(frame);
  await replaceRichContentBlock(page, richContent.locator('h2').first(), 'Last rail step');

  const steps = authoringFilmstripSteps(page);
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toHaveAttribute('aria-label', /Create your first project/);
  await expect(steps.nth(1)).toHaveAttribute('aria-label', /Middle rail step/);
  await expect(steps.nth(2)).toHaveAttribute('aria-label', /Last rail step/);

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
  const frame = await openAuthoringOperations(page);
  await frame.locator('[data-operations-tab="batch"]').click();
  await expect(frame.locator('.tour-batch-workspace')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .querySelector('lodariq-authoring-panel')
            ?.shadowRoot?.querySelectorAll('[data-step-id]').length ?? 0,
      ),
    )
    .toBe(1);
});

test('creator can add freeform rich content, media, icons, and dividers from the tray', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  await page.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, page.locator('[data-lodariq-id="new-project"]'), [
    'Create project',
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
  await frame.getByRole('button', { name: 'Back', exact: true }).click();
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
  await closeCanvasInsertMenu(frame);
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
  await richContent.click({ force: true });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lodariq:doc:doc_tour_welcome') ?? ''))
    .toContain('"type":"divider"');

  const mediaMenu = await openCanvasInsertMenu(frame);
  await mediaMenu.getByRole('checkbox', { name: /Save to media library/ }).check();
  await mediaMenu.locator('input[accept^="image/"]').setInputFiles({
    name: 'pixel.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
  });
  await expect(frame.locator('.rich-content-insert-menu [role="progressbar"]')).toHaveCount(0);
  await expect(richContent.locator('img[alt="pixel.gif"]')).toBeVisible();
  const resizeImage = richContent.getByLabel('Resize image. Use arrow keys or drag any edge.');
  await expect(resizeImage.locator('.rich-content-media-resize-edge')).toHaveCount(8);
  await expect(resizeImage.locator('.rich-content-media-resize-handle')).toHaveCount(0);
  await resizeImage.focus();
  await resizeImage.press('ArrowLeft');
  await resizeImage.press('ArrowDown');
  await expect(resizeImage.locator('img')).toBeVisible();

  await compilePreview(frame);
  await expect(previewRecord(frame)).toContainText('"type": "media"');
  await expect(previewRecord(frame)).toContainText('"widthPercent": 95');
  await expect(previewRecord(frame)).toContainText('"heightPx":');
  await expect(previewRecord(frame)).toContainText('A composer-added note');
  await expect(previewRecord(frame)).toContainText('"type": "icon"');
  await expect(previewRecord(frame)).toContainText('"type": "divider"');

  await frame.getByRole('button', { name: 'Back to authoring' }).click();
  const refreshedRichContent = await openRichContentEditor(frame);
  const deletableImage = refreshedRichContent.getByLabel(
    'Resize image. Use arrow keys or drag any edge.',
  );
  await deletableImage.focus();
  await deletableImage.press('Backspace');
  await expect(
    refreshedRichContent.getByLabel('Resize image. Use arrow keys or drag any edge.'),
  ).toHaveCount(0);
  await expect(refreshedRichContent.getByRole('img', { name: 'pixel.gif' })).toHaveCount(0);
});

test('creator can cancel placement picking with Escape from the authoring iframe', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await openPlacementTray(frame);
  await expect(frame.locator('.target-chip')).toContainText('New project');

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

  await collapseAuthoringOverlay(page);
  await page.locator('[data-lodariq-id="new-project"]').click();
  await restoreAuthoringPanel(page);
  await openPlacementTray(frame);
  await expect(frame.locator('.target-chip')).toContainText('New project');
});

test('creator chooses, persists, reloads, and clears an exact area inside a placement', async ({
  page,
}) => {
  await page.goto('/');
  await openAuthoringPanel(page);
  let frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const panel = page.locator('lodariq-authoring-panel');

  await openCanvasTargetActions(frame);
  await targetMenu(frame).getByRole('button', { name: 'Use exact area' }).click();

  const keyboardPicker = page.getByRole('group', {
    name: 'Choose an exact area inside the selected element',
  });
  await expect(panel).toHaveAttribute('data-lodariq-target-picking', 'true');
  await expect(panel.locator('.target-picking-label')).toHaveText(
    'Choose an exact area · Esc to cancel',
  );
  await expect(keyboardPicker).toBeFocused();
  await expect(panel).toHaveAttribute('data-lodariq-target-picking', 'true');

  await keyboardPicker.press('ArrowRight');
  await expect(page.locator('[data-lodariq-bridge="presentation-anchor-status"]')).toContainText(
    'Point moved',
  );
  await expect(keyboardPicker).toBeFocused();
  await keyboardPicker.press('Escape');

  await expect(keyboardPicker).toHaveCount(0);
  await expect(panel).not.toHaveAttribute('data-lodariq-target-picking', 'true');
  await expect(authoringFilmstrip(page)).toBeVisible();
  await expect(frame.locator('#status')).toContainText('Exact area selection canceled');
  await expect
    .poll(async () => (await storedTargetPresentation(page)).hasPresentationAnchor)
    .toBe(false);

  await openCanvasTargetActions(frame);
  await targetMenu(frame).getByRole('button', { name: 'Use exact area' }).click();
  const pointerPicker = page.getByRole('group', {
    name: 'Choose an exact area inside the selected element',
  });
  const owner = page.locator('[data-lodariq-id="new-project"]');
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
  await expect(authoringFilmstrip(page)).toBeVisible();
  await openPlacementTray(frame);
  await expect(frame.locator('.target-chip-anchor-mode')).toHaveText('Exact area');
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
  await expect(frame.locator('.target-chip-anchor-mode')).toHaveText('Exact area');

  await openCanvasTargetActions(frame);
  const useWholeElement = targetMenu(frame).getByRole('button', { name: 'Use whole element' });
  await expect(useWholeElement).toBeVisible();
  await useWholeElement.click();

  await expect(frame.locator('.target-chip-anchor-mode')).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: 'Add step' })).toBeVisible();
  // §3.3: the pill's menu is the panel's route to Tier 3, grouped rather than a
  // flat list, and every row it prints goes somewhere.
  const pillMenu = page.locator('lodariq-authoring-panel').locator('[data-pill-menu]');
  await pillMenu.click();
  const menu = page.locator('[data-pill-menu-list]');
  await expect(menu.getByRole('menuitem', { name: 'Flow map' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Preview as user' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /blocked from the SDK/ })).toBeDisabled();
  await pillMenu.click();
  const overlayChrome = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('[data-lodariq-authoring-trigger="true"]');
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const filmstrip = host?.shadowRoot?.querySelector<HTMLElement>('.overlay-filmstrip');
    return {
      hostWidth: host?.getBoundingClientRect().width ?? Number.NaN,
      hostHeight: host?.getBoundingClientRect().height ?? Number.NaN,
      filmstripVisible: Boolean(filmstrip && !filmstrip.hidden),
      shell: host?.getAttribute('data-lodariq-shell'),
      picking: host?.getAttribute('data-lodariq-target-picking'),
      minimized: host?.getAttribute('data-lodariq-panel-minimized'),
      triggerPointerEvents: trigger ? getComputedStyle(trigger).pointerEvents : 'missing',
      triggerVisibility: trigger ? getComputedStyle(trigger).visibility : 'missing',
    };
  });
  expect(overlayChrome.hostWidth).toBeGreaterThan(300);
  expect(overlayChrome.hostHeight).toBeGreaterThan(300);
  expect(overlayChrome.filmstripVisible).toBe(true);
  expect(overlayChrome.shell).toBe('overlay');
  // The launcher hides while the panel is open — the pill carries its actions —
  // and comes back the moment the panel minimizes, which is the only way back.
  expect(overlayChrome.triggerVisibility).toBe('hidden');

  await pillMenu.click();
  await page.locator('[data-pill-collapse]').click();
  const modePill = page.locator('lodariq-authoring-panel').locator('.overlay-mode-pill');
  await expect(modePill).toHaveAttribute('data-collapsed', 'true');
  await modePill.locator('[data-pill-expand]').click();
  await expect(modePill).toHaveAttribute('data-collapsed', 'false');

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(authoringFilmstrip(page)).toBeVisible();
  await expect(frame.getByRole('group', { name: 'Step content editor' })).toBeVisible();
  await expect(frame.locator('.document-main')).toHaveCount(0);
  const firstStep = page.getByRole('button', { name: /Edit step 1:/ });
  await firstStep.focus();
  await expect(firstStep).toBeFocused();

  await openAuthoringOperations(page);
  await expect(frame.locator('.operations-hub')).toBeVisible();
  const editorHasHorizontalOverflow = await frame.locator('body').evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return html.scrollWidth > html.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1;
  });
  expect(editorHasHorizontalOverflow).toBe(false);
});

test('authoring overlay keeps filmstrip chrome and operations in a modal', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openAuthoringPanel(page);

  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(page.locator('[data-panel-action="preview"]')).toHaveCount(0);
  await expect(page.locator('[data-panel-action="release"]')).toHaveCount(0);
  await expect(page.locator('[data-panel-action="layout"]')).toHaveCount(0);
  await expect(page.locator('[data-panel-action="zoom"]')).toHaveCount(0);
  await expect(authoringFilmstrip(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add step' })).toBeVisible();
  await page.getByRole('button', { name: 'More authoring actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Operations', exact: true })).toBeVisible();
  await expect(frame.getByRole('group', { name: 'Step content editor' })).toBeVisible();
  await expect(frame.getByRole('contentinfo', { name: 'Authoring actions' })).toHaveCount(0);

  await openAuthoringOperations(page);
  const footer = frame.getByRole('contentinfo', { name: 'Authoring actions' });
  await expect(footer).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Release options' })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Save & exit', exact: true })).toBeVisible();
  await expectAuthoringTrayStatus(frame);

  const moreActions = footer.getByRole('button', { name: 'More experience actions' });
  await moreActions.click();
  await expect(frame.getByRole('menuitem', { name: /^Customize/ })).toBeVisible();
  await expect(frame.getByRole('menuitem', { name: /^Review & recovery/ })).toBeVisible();
  await moreActions.press('Escape');
});

test('overlay editor stays on the live page without a replica studio', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openAuthoringPanel(page);

  const host = page.locator('lodariq-authoring-panel');
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(host).not.toHaveAttribute('data-lodariq-panel-layout');
  await expect(authoringFilmstrip(page)).toBeVisible();
  await expect(frame.getByRole('group', { name: 'Step content editor' })).toBeVisible();
  await expect(frame.getByRole('navigation', { name: 'Authoring tools' })).toHaveCount(0);
  await expect(frame.locator('.tour-storyboard')).toHaveCount(0);

  const commandMenu = await openCanvasInsertMenu(frame);
  await expect(commandMenu).toBeVisible();
  await canvasInsertTrigger(frame).click();
  await expect(commandMenu).toBeHidden();
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
  await replaceCanvasButtonLabel(frame, 'Learn more', 'last');
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
    canvasEditor.locator('.rich-content-canvas').filter({ hasText: 'Create your first project' }),
  ).toHaveCount(1);

  await openCanvasTargetActions(frame);
  await openPlacementTroubleshooting(frame);
  await targetMenu(frame).getByRole('button', { name: 'Remove placement' }).click();

  await expect(frame.locator('.target-chip')).toHaveCount(0);
  await backToOverlayEditor(frame);
  await expect(frame.locator('.overlay-choose-target')).toBeVisible();
  await expect(
    canvasEditor.locator('.rich-content-canvas').filter({ hasText: 'Create your first project' }),
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
  await expect(reloadedFrame.locator('.document-main')).toHaveCount(0);
  await expect(reloadedFrame.locator('.overlay-choose-target')).toBeVisible();
  await expect(reloadedFrame.getByRole('group', { name: 'Step content editor' })).toContainText(
    'Create your first project',
  );
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
          accessibleName: 'Import',
          label: 'Import',
          stableAttributes: { 'data-lodariq-id': 'open-modal' },
        },
      },
      {
        id: 'target_confirm_import',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'Start import',
          label: 'Start import',
          stableAttributes: { 'data-lodariq-id': 'confirm-import' },
        },
        lifecycle: {
          waitForElement: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Start import',
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
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('menuitem', { name: 'CSV file' }).click();

  await expect(page.getByRole('dialog', { name: 'Import data' })).toBeVisible();
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
          accessibleName: 'Create project',
          label: 'Create project',
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
                content: 'Click Create project',
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

test('a tour started from the host chrome survives a hard navigation to another screen', async ({
  page,
}) => {
  // Started through the product's own launcher rather than `Lodariq.playTour`:
  // that is the path the report came from, and the one where the host used to
  // keep a resume key of its own that restarted the tour at step 1.
  await page.goto('/#/projects/all');
  await page.waitForFunction(() => Boolean((window as { __meridian?: unknown }).__meridian));
  await page.evaluate(() =>
    (window as unknown as { __meridian: { playTour: () => Promise<void> } }).__meridian.playTour(),
  );

  const tour = page.getByRole('dialog', { name: 'Lodariq tour' });
  await expect(tour).toContainText('Create your first project');
  await tour.getByRole('button', { name: 'Continue' }).click();
  await expect(tour).toContainText('Narrow the list');

  const urlBeforeReload = page.url();
  await page.reload();
  await page.waitForFunction(() => Boolean((window as { __meridian?: unknown }).__meridian));

  await expect(tour).toContainText('Narrow the list');
  // Resume is invisible from the address bar: appending to a customer's URL
  // breaks their routing, their analytics and the back button.
  expect(page.url()).toBe(urlBeforeReload);
  expect(
    await page.evaluate(() => Object.keys(sessionStorage).filter((key) => /resume/i.test(key))),
  ).toEqual(['lodariq:tour-resume:wk_local_dev:development']);

  // A hard load on a screen the step does not belong to, then back again. The
  // step has no page of its own to be suspended from, so this is the case that
  // used to leave it hidden for the rest of the visit.
  await page.goto('/#/billing/plan');
  await page.reload();
  await page.waitForFunction(() => Boolean((window as { __meridian?: unknown }).__meridian));
  expect(page.url()).not.toMatch(/[?&](tour|step)=/);

  await page.evaluate(() => {
    window.location.hash = '#/projects/all';
  });
  await expect(tour).toContainText('Narrow the list');
  await expect(tour).toBeVisible();

  await page.evaluate(() =>
    (window as unknown as { __meridian: { stopTour: () => void } }).__meridian.stopTour(),
  );
  await page.reload();
  await page.waitForFunction(() => Boolean((window as { __meridian?: unknown }).__meridian));
  await expect(page.getByRole('dialog', { name: 'Lodariq tour' })).toHaveCount(0);
});

test('preview comes back on the step the creator was on after a reload', async ({ page }) => {
  // Preview cannot borrow the runtime's resume: that one is checked against a
  // published manifest version and content hash, and a draft has neither. What
  // has to come back here is the session — the panel itself — before a step
  // means anything.
  await page.goto('/#/projects/all');
  await openAuthoringPanel(page);

  const steps = authoringFilmstripSteps(page);
  await steps.nth(2).click();
  const tour = page.getByRole('dialog', { name: 'Lodariq tour' });
  await expect(tour).toContainText('Sort how you think');

  const urlBeforeReload = page.url();
  await page.reload();

  await expect(page.locator('lodariq-authoring-panel')).toBeVisible();
  await expect(tour).toContainText('Sort how you think');
  expect(page.url()).toBe(urlBeforeReload);
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
          accessibleName: 'Start import',
          label: 'Start import',
          stableAttributes: { 'data-lodariq-id': 'confirm-import' },
        },
        lifecycle: {
          openPanel: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Import',
            stableAttributes: { 'data-lodariq-id': 'open-modal' },
          },
          waitForElement: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Start import',
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

  await openImportDialog(page);
  await expect(page.getByRole('dialog', { name: 'Import data' })).toBeVisible();
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
  await expect(page.getByRole('listitem')).toHaveCount(40);

  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');

  const list = page.locator('#project-list');
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const finalProjectRow = page.getByRole('listitem').last();
  await finalProjectRow.scrollIntoViewIfNeeded();
  const finalProjectButton = finalProjectRow.getByRole('button');
  await expect(finalProjectButton).toBeVisible();
  await attachTarget(page, frame, finalProjectButton, ['Open']);

  await page.locator('[data-route="settings"]').click();
  await page.locator('[data-open-drawer]').first().click();
  const drawer = page.getByRole('complementary', { name: 'Advanced settings' });
  await expect(drawer).toBeVisible();
  await attachTarget(page, frame, drawer.getByRole('button', { name: 'Close advanced settings' }), [
    'Close',
  ]);
  await expect(drawer).toBeVisible();
  await page.locator('[data-close-drawer]').first().click();

  await openImportDialog(page);
  await attachTarget(
    page,
    frame,
    page.getByRole('dialog').getByRole('button', { name: 'Start import', exact: true }),
    ['Start import'],
  );
});

test('customer-like host installs the local SDK and opens SDK authoring', async ({ page }) => {
  const loadedUrls: string[] = [];
  page.on('request', (request) => loadedUrls.push(request.url()));

  await page.goto(`http://127.0.0.1:${process.env.LODARIQ_E2E_CUSTOMER_LIKE_HOST_PORT ?? '4188'}/`);
  await page.waitForFunction(() => Boolean((window as { Lodariq?: unknown }).Lodariq));

  expect(loadedUrls.some((url) => url.includes('/src/lodariq-loader.ts'))).toBe(true);

  await expect(page.locator('[data-lodariq-id="new-project"]')).toBeVisible();

  await openAuthoringPanel(page);
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await expect(frame.locator('.document-main')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add step' }).click();
  await chooseCurrentTarget(page, page.locator('[data-lodariq-id="new-project"]'), ['New project']);
  await expect(authoringFilmstripSteps(page)).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Edit heading in preview' })).toHaveCount(0);
  await expect(frame.getByRole('group', { name: 'Step content editor' })).toContainText(
    'Untitled step',
  );
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
  await expect(page.locator('lodariq-authoring-panel')).toHaveAttribute(
    'data-lodariq-shell',
    'overlay',
  );
  await expect(page.getByLabel('Experience title')).toBeVisible();
  await expect(authoringFilmstrip(page)).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Lodariq authoring"]').getByRole('main'),
  ).toBeVisible();
}

/**
 * "Close authoring" moved into the mode pill's overflow menu (§3.3): the pill is
 * status, and Tier 3 actions hang off it rather than crowding the chrome.
 */
async function closeAuthoringPanel(page: Page): Promise<void> {
  const more = page.getByRole('button', { name: 'More authoring actions' });
  if (await more.isVisible().catch(() => false)) await more.click();
  const close = page.getByRole('menuitem', { name: 'Close authoring' });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await expect(page.locator('lodariq-authoring-panel')).toHaveCount(0);
    return;
  }
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const saveExit = frame.getByRole('button', { name: 'Save & exit', exact: true });
  if (await saveExit.isVisible()) {
    await saveExit.click();
    await expect(page.locator('lodariq-authoring-panel')).toHaveCount(0);
    return;
  }
  await openAuthoringOperations(page);
  await frame.getByRole('button', { name: 'Save & exit', exact: true }).click();
  await expect(page.locator('lodariq-authoring-panel')).toHaveCount(0);
}

/**
 * Operations hangs off the mode pill's overflow menu (§3.3). The pill re-renders
 * as state changes, so the row can detach mid-click; reopening and retrying is
 * the honest way to drive a live status surface.
 */
async function openAuthoringOperations(page: Page): Promise<FrameLocator> {
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  const hub = frame.locator('.operations-hub');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await hub.isVisible().catch(() => false)) break;
    const more = page.getByRole('button', { name: 'More authoring actions' });
    if (await more.isVisible().catch(() => false)) await more.click();
    await page
      .getByRole('menuitem', { name: 'Operations', exact: true })
      .click({ timeout: 4_000 })
      .catch(() => {});
  }
  await expect(hub).toBeVisible();
  return frame;
}

async function expectAuthoringTrayStatus(frame: FrameLocator): Promise<void> {
  const saveStatus = frame.locator('.panel-save-status[data-save-state]');
  const draftLabel = saveStatus.locator('[data-save-state-label]');
  const releaseSummary = saveStatus.locator('.panel-release-summary');

  await expect(saveStatus).toHaveAttribute('data-state', 'saved');
  await expect(draftLabel).toHaveText('Draft saved');
  await expect(releaseSummary).toContainText('Release unavailable');
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
  await openAuthoringOperations(page);
  await frame.locator('[data-operations-tab="review"]').click();
  const reviewDrawer = frame.locator('details.review-drawer');
  if (await reviewDrawer.isVisible()) return;

  await expect(frame.locator('.tour-review-workspace')).toBeVisible();
  await frame.getByRole('button', { name: /^Edit details/ }).click();
  await expect(reviewDrawer).toBeVisible();
}

async function openCustomize(frame: FrameLocator): Promise<void> {
  const page = frame.owner().page();
  await openAuthoringOperations(page);
  await frame.locator('[data-operations-tab="appearance"]').click();
  await expect(frame.getByRole('region', { name: 'Feel native to this product' })).toBeVisible();
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
  await openAuthoringOperations(frame.owner().page());
  await frame
    .locator('.panel-workspace-footer')
    .getByRole('button', { name: 'Preview', exact: true })
    .click();
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
  const page = frame.owner().page();
  await openAuthoringOperations(page);
  await frame.locator('[data-operations-tab="review"]').click();
  await expect(frame.locator('.tour-review-workspace')).toBeVisible();
  const placement = frame.locator('.target-control, .tour-placement-card').first();
  if (!(await placement.isVisible())) {
    await frame.locator('[data-review-row="placement"]').click();
  }
  await expect(placement).toBeVisible();
  return placement;
}

/**
 * The chip is named after the target, and that name follows the product's copy
 * — so the step is found by having a placement at all, not by remembering what
 * the element used to be called.
 */
async function openCanvasTargetActions(frame: FrameLocator, _targetLabel?: string): Promise<void> {
  await openPlacementTray(frame);
  await frame
    .getByRole('button', { name: /^Placement .+ actions$/ })
    .first()
    .click({ force: true });
  await expect(targetMenu(frame)).toBeVisible();
}

async function backToOverlayEditor(frame: FrameLocator): Promise<void> {
  const page = frame.owner().page();
  const back = frame.getByRole('button', { name: 'Back to authoring' });
  if (await back.isVisible()) {
    await back.click();
  }
  await expect(page.locator('lodariq-authoring-panel')).toHaveAttribute(
    'data-lodariq-shell',
    'overlay',
  );
  await expect(frame.getByRole('group', { name: 'Step content editor' })).toBeVisible();
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
  await chooseCurrentTarget(page, target, expectedLabels);
}

async function chooseCurrentTarget(
  page: Page,
  target: Locator,
  expectedLabels: string[],
  /** Container targets need a hover point inside their own padding, not their centre. */
  hoverPosition?: { x: number; y: number },
): Promise<void> {
  const panel = page.locator('lodariq-authoring-panel');
  await expect(panel).toHaveAttribute('data-lodariq-target-picking', 'true');
  const pickerLabel = page.locator('[data-lodariq-bridge="target-label-text"]');
  for (const label of expectedLabels) {
    await expect
      .poll(
        async () => {
          await page.mouse.move(1, 1);
          await target.hover(hoverPosition ? { position: hoverPosition } : {});
          return pickerLabel.textContent();
        },
        { timeout: 5_000 },
      )
      .toContain(label);
  }
  await target.click({ force: true });
  const weakPlacementReview = page.getByRole('dialog', { name: 'Review placement' });
  if (await weakPlacementReview.isVisible()) {
    await weakPlacementReview.getByRole('button', { name: 'Keep in draft' }).click();
  }
  await expect(panel).not.toHaveAttribute('data-lodariq-target-picking', 'true');
  await expect(page.locator('[data-lodariq-bridge="target-outline"]')).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function startTargetPick(frame: FrameLocator, _block?: Locator): Promise<void> {
  const page = frame.owner().page();
  // The overlay toolbar renders on the page beside the step, not in the frame:
  // choosing a target is a gesture against the product, so the affordance sits
  // where the product is.
  const overlayChoose = page.locator('.overlay-choose-target');
  if (await overlayChoose.isVisible().catch(() => false)) {
    await overlayChoose.click();
    return;
  }
  const changeTarget = page.getByRole('button', { name: 'Change target' });
  if (await changeTarget.isVisible()) {
    await changeTarget.click();
    return;
  }
  const chooseTarget = frame.getByRole('button', { name: 'Choose target' });
  if (await chooseTarget.isVisible()) {
    await chooseTarget.click({ force: true });
    return;
  }
  const placementActions = frame.getByRole('button', { name: /Placement .+ actions/ });
  if ((await placementActions.count()) > 0) {
    await placementActions.evaluate((button) => (button as HTMLButtonElement).click());
    const chooseAnother = frame.getByRole('button', { name: 'Choose another element' });
    await expect(chooseAnother).toBeVisible();
    await chooseAnother.evaluate((button) => (button as HTMLButtonElement).click());
    return;
  }
  await page.getByRole('button', { name: 'Add step' }).click();
}

/** These triggers open on pointerdown, so a click can land as a no-op. */
async function chooseEditorOption(
  frame: FrameLocator,
  field: string,
  option: string,
): Promise<void> {
  const trigger = frame.locator(`[role="combobox"][aria-label="${field}"]`).first();
  await expect(trigger).toBeAttached();
  await revealInspectorField(frame, trigger);
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.focus();
    await trigger.press('Enter');
  }
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await frame.getByRole('option', { name: option, exact: true }).click();
}

/**
 * Import is a menu, then a dialog. Both are URL state in Meridian, so a click
 * that a playing tour happens to swallow can still be driven the way a deep
 * link would.
 */
async function openImportDialog(page: Page): Promise<void> {
  // Import lives in the Projects header, so get there first.
  const importButton = page.getByRole('button', { name: 'Import', exact: true });
  if (!(await importButton.isVisible().catch(() => false))) {
    await page.locator('[data-route="projects"]').click();
    await expect(importButton).toBeVisible();
  }
  await importButton.click();
  const csv = page.getByRole('menuitem', { name: 'CSV file' });
  if (await csv.isVisible().catch(() => false)) {
    await csv.click();
    return;
  }
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.hash = `${url.hash.split('?')[0]}?modal=import`;
    window.location.replace(url.toString());
  });
}

async function closeCanvasInsertMenu(frame: FrameLocator): Promise<void> {
  const menu = frame.locator('.rich-content-insert-menu');
  if (!(await menu.isVisible())) return;
  const back = menu.getByRole('button', { name: 'Back', exact: true });
  if (await back.isVisible()) await back.click();
  if (await menu.isVisible()) {
    await canvasInsertTrigger(frame).click({ force: true });
  }
  await expect(menu).toHaveCount(0);
}

/**
 * The block handles only exist while a block is hovered, so every helper that
 * reaches for one hovers the canvas first.
 */
async function hoverCanvasBlock(frame: FrameLocator): Promise<void> {
  const canvas = frame.locator('.rich-content-canvas').first();
  if (await canvas.isVisible().catch(() => false)) await canvas.hover({ force: true });
}

function canvasInsertTrigger(frame: FrameLocator): Locator {
  return frame
    .locator('[data-rich-block-handles="true"]')
    .getByRole('button', { name: 'Add content' });
}

async function openCanvasInsertMenu(frame: FrameLocator): Promise<Locator> {
  const menu = frame.locator('.rich-content-insert-menu');
  if (await menu.isVisible()) return menu;
  await hoverCanvasBlock(frame);
  const addContent = canvasInsertTrigger(frame);
  await expect(addContent).toBeVisible();
  await addContent.click({ force: true });
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

async function replaceCanvasButtonLabel(
  frame: FrameLocator,
  value: string,
  which: 'first' | 'last' = 'first',
): Promise<void> {
  await openButtonConfig(frame, which);
  // The inspector scrolls, so the field has to be brought into view before it
  // counts as visible at all.
  const field = frame.locator('[aria-label="Button label"]').first();
  await expect(field).toBeAttached();
  await revealInspectorField(frame, field);
  await field.scrollIntoViewIfNeeded();
  await expect(field).toBeVisible();
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
  await block.click({ force: true });
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

/**
 * A button's properties open from its own configure affordance: clicking the
 * button itself edits its label, which is the far more common intent.
 */
async function openButtonConfig(
  frame: FrameLocator,
  which: 'first' | 'last' = 'first',
): Promise<void> {
  const canvas = frame.getByRole('group', { name: 'Step content editor' });
  const previews = canvas.locator('.rich-content-button-preview');
  const preview = which === 'last' ? previews.last() : previews.first();
  await expect(preview).toBeVisible();
  await preview.hover({ force: true });
  const triggers = canvas.getByRole('button', { name: 'Configure button' });
  await (which === 'last' ? triggers.last() : triggers.first()).click({ force: true });
}

/**
 * §4.3 sections are an accordion: one open at a time, and React owns the state,
 * so a field is reached by opening sections in turn until it shows.
 */
async function revealInspectorField(frame: FrameLocator, field: Locator): Promise<void> {
  if (await field.isVisible().catch(() => false)) return;
  const summaries = frame.locator('details.inspector-section > summary');
  const count = await summaries.count();
  for (let index = 0; index < count; index += 1) {
    await summaries.nth(index).click({ force: true });
    if (await field.isVisible().catch(() => false)) return;
  }
}

async function setInlineButtonAction(page: Page, action: string): Promise<void> {
  const frame = page.frameLocator('iframe[title="Lodariq authoring"]');
  await openButtonConfig(frame);
  const afterClick = frame.locator('[role="combobox"][aria-label="After click"]').first();
  await expect(afterClick).toBeAttached();
  await revealInspectorField(frame, afterClick);
  // The inspector scrolls, so the field has to be brought into view before it
  // can be clicked; a forced click at its centre lands on whatever overlaps it.
  await afterClick.scrollIntoViewIfNeeded();
  await afterClick.click();
  if ((await afterClick.getAttribute('aria-expanded')) !== 'true') {
    // The trigger opens on pointerdown, so a synthetic click can land as a
    // no-op; the keyboard path is the one the control guarantees.
    await afterClick.focus();
    await afterClick.press('Enter');
  }
  await expect(afterClick).toHaveAttribute('aria-expanded', 'true');
  await frame.getByRole('option', { name: action, exact: true }).click();
  await expect(afterClick).toContainText(action);
  await afterClick.evaluate((element) => (element as HTMLElement).blur());
  // The tray floats over the chrome, so leaving it open blocks the next click.
  const closeSettings = frame.getByRole('button', { name: 'Close settings' }).first();
  if (await closeSettings.isVisible().catch(() => false)) await closeSettings.click();
}

/**
 * §3.3: the overlay does not get minimised to reach the product — it switches
 * to Browsing, where clicks pass through to the page and nothing authored is
 * lost. That is the same intent the launcher-level minimise used to serve.
 */
async function collapseAuthoringOverlay(page: Page): Promise<void> {
  const panel = page.locator('lodariq-authoring-panel');
  if ((await panel.getAttribute('data-lodariq-shell')) !== 'overlay') return;
  const browsing = page.locator('[data-pill-mode="browsing"]');
  if (await browsing.isVisible().catch(() => false)) {
    await browsing.click();
    await expect(panel).toHaveAttribute('data-lodariq-browsing', '');
    return;
  }
  await page.getByRole('button', { name: 'Minimize Lodariq authoring' }).click();
  await expect(panel).toHaveAttribute('data-lodariq-panel-minimized', 'true');
}

async function restoreAuthoringPanel(page: Page): Promise<void> {
  const panel = page.locator('lodariq-authoring-panel');
  const editing = page.locator('[data-pill-mode="editing"]');
  if (await editing.isVisible().catch(() => false)) {
    await editing.click();
    await expect(panel).not.toHaveAttribute('data-lodariq-browsing', '');
    return;
  }
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
