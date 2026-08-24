import { describe, expect, it } from 'vitest';
import {
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  CompiledDocument,
  CompiledDocumentV1,
  CompiledDocumentV2,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  validate,
  type BrandThemeSnapshot,
  type Experiment,
  type LodariqBlock,
  type LodariqDocument,
  type PresentationAnchor,
} from '@lodariq/schema';
import {
  COMPILER_VERSION,
  compile,
  compileDocument,
  computeBrandThemeContentHash,
  type CompileInput,
} from '@lodariq/compiler';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { createTargetIdentityV2 } from '../../fixtures/target-identity-v2';

const document = tourFixture as LodariqDocument;

describe('compile', () => {
  it('compiles closed experiment patches and applies only a promoted winner', () => {
    const experiment: Experiment = {
      id: 'exp_copy_variant',
      status: 'running',
      varies: 'copy',
      successEventName: 'project_created',
      allocationRevision: 1,
      arms: [
        { id: 'A', label: 'Control', trafficPercent: 50, overrides: [] },
        {
          id: 'B',
          label: 'Clearer copy',
          trafficPercent: 50,
          overrides: [{ type: 'copy', blockId: 'block_heading_1', text: 'Create a project now' }],
        },
      ],
    };

    const running = compile({ ...themedInput(document), experiment });
    expect(running.experiment).toMatchObject({
      id: experiment.id,
      arms: [
        { id: 'A', overrides: [] },
        { id: 'B', overrides: [{ type: 'copy', blockId: 'block_heading_1' }] },
      ],
    });
    expect(running.steps[0]?.body[0]?.text).not.toBe('Create a project now');

    const promoted = compile({
      ...themedInput(document),
      experiment: { ...experiment, status: 'promoted', promotedArmId: 'B' },
    });
    expect(promoted.experiment).toBeUndefined();
    expect(promoted.steps[0]?.body[0]?.text).toBe('Create a project now');
  });

  it('rejects unresolved or mismatched experiment patches', () => {
    const base: Experiment = {
      id: 'exp_invalid_variant',
      status: 'draft',
      varies: 'copy',
      successEventName: 'project_created',
      allocationRevision: 1,
      arms: [
        { id: 'A', label: 'Control', trafficPercent: 50, overrides: [] },
        { id: 'B', label: 'Variant', trafficPercent: 50, overridesRef: 'legacy_patch' },
      ],
    };
    expect(() => compile({ ...themedInput(document), experiment: base })).toThrow(
      /unresolved override reference/,
    );
    expect(() =>
      compile({
        ...themedInput(document),
        experiment: {
          ...base,
          arms: [
            base.arms[0]!,
            {
              id: 'B',
              label: 'Variant',
              trafficPercent: 50,
              overrides: [{ type: 'copy', blockId: 'missing', text: 'Nope' }],
            },
          ],
        },
      }),
    ).toThrow(/missing block/);
  });

  it('compiles an immutable semantic target approach without mutable outcomes', async () => {
    const withApproach = structuredClone(document);
    withApproach.targets.push({
      id: 'target_open_menu',
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'Open menu',
        stableAttributes: { 'data-testid': 'open-menu' },
      },
    });
    withApproach.targets[0]!.approach = {
      legs: [
        {
          act: { kind: 'activateTarget', targetId: 'target_open_menu' },
          wait: { type: 'targetAvailable', targetId: 'target_new_project' },
          label: 'Open the project menu',
        },
      ],
      lastOutcome: 'fail',
    };

    const compiled = await compileDocument(themedInput(withApproach));
    expect(compiled.targets[0]?.approach).toEqual({
      legs: [
        {
          act: { kind: 'activateTarget', targetId: 'target_open_menu' },
          wait: { type: 'targetAvailable', targetId: 'target_new_project' },
          label: 'Open the project menu',
        },
      ],
    });
    expect(compiled.targets[0]?.approach).not.toHaveProperty('lastOutcome');
    expect(JSON.stringify(compiled.targets[0]?.approach)).not.toMatch(
      /selector|coordinate|delayMs/,
    );
  });

  it.each([
    {
      name: 'a missing activation target',
      approach: {
        legs: [
          {
            act: { kind: 'activateTarget', targetId: 'missing' },
            label: 'Open it',
          },
        ],
      },
    },
    {
      name: 'self activation',
      approach: {
        legs: [
          {
            act: { kind: 'activateTarget', targetId: 'target_new_project' },
            label: 'Open itself',
          },
        ],
      },
    },
    {
      name: 'an unresolved route-pattern action',
      approach: {
        legs: [
          {
            act: { kind: 'navigate', routePatternId: 'projects' },
            label: 'Open projects',
          },
        ],
      },
    },
    {
      name: 'an empty observation',
      approach: { legs: [{ act: { kind: 'observe' }, label: 'Wait' }] },
    },
  ])('rejects an approach with $name', ({ approach }) => {
    const malformed = structuredClone(document);
    malformed.targets[0]!.approach = approach as LodariqDocument['targets'][number]['approach'];
    expect(() => compile(themedInput(malformed))).toThrow(/Target approach/);
  });

  it('content-addresses the plan badge in the immutable artifact', async () => {
    const withoutBadge = await compileDocument(themedInput(document));
    const withBadge = await compileDocument({ ...themedInput(document), showLodariqBadge: true });

    expect(withoutBadge.showLodariqBadge).toBeUndefined();
    expect(withBadge.showLodariqBadge).toBe(true);
    expect(withBadge.contentHash).not.toBe(withoutBadge.contentHash);
  });

  it('writes one explicit semantic appearance into every new artifact', () => {
    const legacyDocument = structuredClone(document);
    delete legacyDocument.appearance;
    expect(compile(themedInput(legacyDocument)).appearance).toEqual(DEFAULT_EXPERIENCE_APPEARANCE);

    legacyDocument.appearance = {
      preset: 'inverse',
      density: 'compact',
      width: 'wide',
      colorMode: 'dark',
    };
    const compiled = compile(themedInput(legacyDocument));
    expect(compiled.appearance).toEqual({
      ...legacyDocument.appearance,
      displayTargetOutline: true,
    });
    expect(compiled.appearance).not.toBe(legacyDocument.appearance);

    legacyDocument.appearance.displayTargetOutline = false;
    expect(compile(themedInput(legacyDocument)).appearance.displayTargetOutline).toBe(false);
  });

  it('content-addresses the target-outline appearance choice', async () => {
    const withoutOutline = structuredClone(document);
    const withOutline = structuredClone(document);
    withoutOutline.appearance = {
      ...DEFAULT_EXPERIENCE_APPEARANCE,
      displayTargetOutline: false,
    };
    withOutline.appearance = {
      ...DEFAULT_EXPERIENCE_APPEARANCE,
      displayTargetOutline: true,
    };

    const [baseline, outlined] = await Promise.all([
      compileDocument(themedInput(withoutOutline)),
      compileDocument(themedInput(withOutline)),
    ]);

    expect(outlined.contentHash).not.toBe(baseline.contentHash);
  });

  it('copies canonical trigger and audience behavior into the closed artifact', () => {
    const mutableDocument = structuredClone(document);
    mutableDocument.trigger = { type: 'pageLoad', config: { delayMs: 750 } };
    mutableDocument.audience = {
      environments: ['staging'],
      rules: [
        {
          source: 'identify',
          key: 'plan',
          operator: 'equals',
          value: 'pro',
        },
      ],
    };

    const compiled = compile(themedInput(mutableDocument));

    expect(compiled.trigger).toEqual(mutableDocument.trigger);
    expect(compiled.audience).toEqual(mutableDocument.audience);
    expect(compiled.trigger).not.toBe(mutableDocument.trigger);
    expect(compiled.audience).not.toBe(mutableDocument.audience);
  });

  it('produces one step per tourStep block with body + target binding', () => {
    const compiled = compile(themedInput(document));
    // The rule is one step per tourStep block, not a fixed count — the fixture
    // grows, and a magic number would have to be chased every time it does.
    expect(compiled.steps).toHaveLength(document.blocks.length);
    const [step] = compiled.steps;
    expect(step?.targetId).toBe('target_new_project');
    expect(step?.placement).toBe('bottom');
    expect(step?.presentationAnchor).toBeUndefined();
    expect(step?.body.map((b) => b.type)).toEqual(['heading', 'paragraph', 'button']);
    expect(step?.body.find((block) => block.type === 'button')?.props).toEqual({
      variant: 'primary',
      action: { type: 'next' },
    });
  });

  it('compiles sparse locale variants with resolved fallback copy into one artifact', async () => {
    const localizedDocument = structuredClone(document);
    localizedDocument.localization = {
      defaultLocale: 'en',
      variants: [
        {
          locale: 'de',
          fallbackLocale: 'en',
          title: 'Willkommenstour',
          blocks: [
            {
              blockId: 'block_heading_1',
              content: 'Erstellen Sie Ihr erstes Projekt',
            },
          ],
        },
        {
          locale: 'fr',
          fallbackLocale: 'de',
          blocks: [
            {
              blockId: 'block_paragraph_1',
              content: 'Les projets organisent le travail de votre équipe.',
            },
          ],
        },
      ],
    };

    const compiled = await compileDocument(themedInput(localizedDocument));
    const french = compiled.localization.variants.find((variant) => variant.locale === 'fr');

    expect(compiled.localization.defaultLocale).toBe('en');
    expect(compiled.localization.defaultTitle).toBe('Welcome tour');
    expect(french).toMatchObject({
      fallbackLocale: 'de',
      title: 'Willkommenstour',
    });
    expect(french?.steps[0]?.body.map((block) => block.text)).toEqual([
      'Erstellen Sie Ihr erstes Projekt',
      'Les projets organisent le travail de votre équipe.',
      'Continue',
    ]);

    const changedDocument = structuredClone(localizedDocument);
    changedDocument.localization!.variants[1]!.blocks[0]!.content =
      'Une formulation française différente.';
    const changed = await compileDocument(themedInput(changedDocument));
    expect(changed.contentHash).not.toBe(compiled.contentHash);
  });

  it('preserves child visibility rules across compiled locale variants', async () => {
    const conditionalDocument = structuredClone(document);
    const heading = tourTooltip(conditionalDocument).children.find(
      (block) => block.id === 'block_heading_1',
    );
    if (!heading) throw new Error('fixture heading missing');
    heading.props.showWhen = {
      source: 'identifyTrait',
      key: 'plan',
      operator: 'equals',
      value: 'growth',
    };
    conditionalDocument.localization = {
      defaultLocale: 'en',
      variants: [
        {
          locale: 'de',
          fallbackLocale: 'en',
          blocks: [{ blockId: heading.id, content: 'Erstellen Sie Ihr erstes Projekt' }],
        },
      ],
    };

    const compiled = await compileDocument(themedInput(conditionalDocument));
    const expected = {
      source: 'identifyTrait',
      key: 'plan',
      operator: 'equals',
      value: 'growth',
    };

    expect(
      compiled.steps[0]?.body.find((block) => block.id === heading.id)?.props.showWhen,
    ).toEqual(expected);
    expect(
      compiled.localization.variants[0]?.steps[0]?.body.find((block) => block.id === heading.id)
        ?.props.showWhen,
    ).toEqual(expected);
  });

  it('rejects invalid authored-content fallback graphs before publication', () => {
    const invalid = structuredClone(document);
    invalid.localization = {
      defaultLocale: 'en',
      variants: [
        { locale: 'de', fallbackLocale: 'fr', blocks: [] },
        { locale: 'fr', fallbackLocale: 'de', blocks: [] },
      ],
    };

    expect(() => compile(themedInput(invalid))).toThrow('Document localization is invalid');
  });

  it('copies exact presentation geometry from the target-bearing tooltip onto the step', () => {
    const mutableDocument = structuredClone(document);
    const source: PresentationAnchor = {
      kind: 'region',
      xRatio: 0.1,
      yRatio: 0.2,
      widthRatio: 0.3,
      heightRatio: 0.4,
    };
    tourTooltip(mutableDocument).props.presentationAnchor = source;

    const compiled = compile(themedInput(mutableDocument));

    expect(compiled.steps[0]?.presentationAnchor).toEqual(source);
    expect(compiled.steps[0]?.presentationAnchor).not.toBe(source);
    source.xRatio = 0.5;
    expect(compiled.steps[0]?.presentationAnchor).toEqual({
      kind: 'region',
      xRatio: 0.1,
      yRatio: 0.2,
      widthRatio: 0.3,
      heightRatio: 0.4,
    });
  });

  it('changes the immutable artifact hash when exact presentation geometry changes', async () => {
    const pointDocument = structuredClone(document);
    const regionDocument = structuredClone(document);
    tourTooltip(pointDocument).props.presentationAnchor = {
      kind: 'point',
      xRatio: 0.25,
      yRatio: 0.75,
    };
    tourTooltip(regionDocument).props.presentationAnchor = {
      kind: 'region',
      xRatio: 0.2,
      yRatio: 0.7,
      widthRatio: 0.1,
      heightRatio: 0.2,
    };

    const [point, region] = await Promise.all([
      compileDocument(themedInput(pointDocument)),
      compileDocument(themedInput(regionDocument)),
    ]);

    expect(point.contentHash).not.toBe(region.contentHash);
  });

  it('rejects out-of-owner and zero-area regions at the compiler boundary', () => {
    const overflowDocument = structuredClone(document);
    const zeroAreaDocument = structuredClone(document);
    Object.assign(tourTooltip(overflowDocument).props, {
      presentationAnchor: {
        kind: 'region',
        xRatio: 0.8,
        yRatio: 0.8,
        widthRatio: 0.3,
        heightRatio: 0.3,
      },
    });
    Object.assign(tourTooltip(zeroAreaDocument).props, {
      presentationAnchor: {
        kind: 'region',
        xRatio: 0.2,
        yRatio: 0.2,
        widthRatio: 0,
        heightRatio: 0.3,
      },
    });

    expect(() => compile(themedInput(overflowDocument))).toThrow(/outside its owner bounds/);
    expect(() => compile(themedInput(zeroAreaDocument))).toThrow(/outside its owner bounds/);
  });

  it('rejects presentation geometry outside the target-bearing tooltip', () => {
    const mutableDocument = structuredClone(document);
    const heading = tourTooltip(mutableDocument).children.find((block) => block.type === 'heading');
    if (!heading) throw new Error('fixture heading missing');
    heading.props.presentationAnchor = { kind: 'point', xRatio: 0.5, yRatio: 0.5 };

    expect(() => compile(themedInput(mutableDocument))).toThrow(/target-bearing tour tooltip/);
  });

  it('rejects presentation geometry on a duplicate tooltip the compiler would not select', () => {
    const mutableDocument = structuredClone(document);
    mutableDocument.blocks[0]!.children.push({
      id: 'block_tooltip_duplicate',
      type: 'tooltip',
      props: {
        targetId: mutableDocument.targets[0]!.id,
        presentationAnchor: { kind: 'point', xRatio: 0.5, yRatio: 0.5 },
      },
      children: [],
    });

    expect(() => compile(themedInput(mutableDocument))).toThrow(/selected for compilation/);
  });

  it('copies target lifecycle hints onto compiled steps', () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    mutableDocument.targets[0]!.lifecycle = {
      waitForText: 'Projects loaded',
      scrollStrategy: 'bottom',
    };

    const compiled = compile(themedInput(mutableDocument));
    mutableDocument.targets[0]!.lifecycle.waitForText = 'Changed later';

    expect(compiled.steps[0]?.lifecycle).toEqual({
      waitForText: 'Projects loaded',
      scrollStrategy: 'bottom',
    });
  });

  it('preserves user-action gated button actions in delivery JSON', () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    const button = mutableDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.type === 'button',
    );
    if (!button) throw new Error('fixture button missing');
    button.props.action = { type: 'clickTarget' };

    const compiled = compile(themedInput(mutableDocument));

    expect(compiled.steps[0]?.body.find((block) => block.type === 'button')?.props.action).toEqual({
      type: 'clickTarget',
    });
  });

  it('keeps list, divider, link, and openPage actions in delivery JSON', () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    mutableDocument.blocks[0]?.children[0]?.children.splice(
      2,
      0,
      {
        id: 'block_list_1',
        type: 'list',
        content: 'One\nTwo',
        props: {},
        status: 'ready',
        children: [],
      },
      {
        id: 'block_divider_1',
        type: 'divider',
        props: {},
        status: 'ready',
        children: [],
      },
      {
        id: 'block_link_1',
        type: 'link',
        content: 'Open settings',
        props: {
          action: {
            type: 'openPage',
            url: '/settings',
            navigationBehavior: 'continue',
          },
        },
        status: 'ready',
        children: [],
      },
    );

    const compiled = compile(themedInput(mutableDocument));

    expect(compiled.steps[0]?.body.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'divider',
      'link',
      'button',
    ]);
    expect(compiled.steps[0]?.body.find((block) => block.type === 'link')?.props.action).toEqual({
      type: 'openPage',
      url: '/settings',
      navigationBehavior: 'continue',
    });
  });

  it('keeps placeholder media as structured delivery body content', () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    mutableDocument.blocks[0]?.children[0]?.children.splice(2, 0, {
      id: 'block_media_placeholder',
      type: 'media',
      content: 'Media placeholder',
      props: {},
      status: 'incomplete',
      children: [],
    });

    const compiled = compile(themedInput(mutableDocument));

    expect(compiled.steps[0]?.body.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'media',
      'button',
    ]);
    expect(compiled.steps[0]?.body.find((block) => block.type === 'media')).toEqual({
      id: 'block_media_placeholder',
      type: 'media',
      text: 'Media placeholder',
      props: {},
    });
  });

  it('content-addresses the artifact and validates against the schema', async () => {
    const compiled = await compileDocument(themedInput(document));
    expect(compiled.contentHash).toMatch(/^sha256-[0-9a-f]{64}$/);
    expect(compiled.artifactSchemaVersion).toBe(COMPILED_ARTIFACT_SCHEMA_VERSION);
    expect(compiled.rendererContractVersion).toBe(RENDERER_CONTRACT_VERSION);
    expect(compiled.compilerVersion).toBe(COMPILER_VERSION);
    expect(COMPILER_VERSION).toBe('0.6.0');
    expect(RENDERER_CONTRACT_VERSION).toBe('5');
    expect(compiled.theme).toEqual(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
    const result = validate(CompiledDocument, compiled);
    if (!result.valid) {
      throw new Error(JSON.stringify(result.errors, null, 2));
    }
    expect(result.valid).toBe(true);
  });

  it('is deterministic: same input yields the same content hash', async () => {
    const a = await compileDocument(themedInput(document));
    const b = await compileDocument(themedInput(document));
    expect(a.contentHash).toBe(b.contentHash);
  });

  it('pins generated narration metadata from the server media record', async () => {
    const narrated = structuredClone(document);
    const step = narrated.blocks[0];
    if (!step || step.type !== 'tourStep') throw new Error('fixture step missing');
    step.props.narration = {
      script: 'Create a project, then continue.',
      voiceId: 'voice_en',
      startOffsetMs: 350,
      advanceOnEnd: true,
      audio: {
        assetId: 'asset_narration_1',
        contentHash: `sha256-${'1'.repeat(64)}`,
        sourceHash: `sha256-${'2'.repeat(64)}`,
        contentType: 'audio/wav',
        durationMs: 1_500,
        cues: [{ text: 'Create a project, then continue.', startMs: 0, durationMs: 1_500 }],
      },
    };

    const compiled = await compileDocument({
      ...themedInput(narrated),
      mediaAssets: new Map([
        [
          'asset_narration_1',
          {
            kind: 'audio' as const,
            contentHash: `sha256-${'a'.repeat(64)}`,
            contentType: 'audio/wav',
          },
        ],
      ]),
    });

    expect(compiled.steps[0]?.narration).toEqual({
      script: 'Create a project, then continue.',
      startOffsetMs: 350,
      advanceOnEnd: true,
      audio: {
        ...step.props.narration.audio,
        contentHash: `sha256-${'a'.repeat(64)}`,
      },
    });
    expect(compiled.steps[0]?.body.every((block) => !('narration' in block.props))).toBe(true);
  });

  it('rejects narration whose server media record is not audio', () => {
    const narrated = structuredClone(document);
    const step = narrated.blocks[0];
    if (!step || step.type !== 'tourStep') throw new Error('fixture step missing');
    step.props.narration = {
      script: 'Create a project.',
      audio: {
        assetId: 'asset_wrong_kind',
        contentHash: `sha256-${'1'.repeat(64)}`,
        sourceHash: `sha256-${'2'.repeat(64)}`,
        contentType: 'audio/wav',
        durationMs: 1_000,
        cues: [{ text: 'Create a project.', startMs: 0, durationMs: 1_000 }],
      },
    };

    expect(() =>
      compile({
        ...themedInput(narrated),
        mediaAssets: new Map([
          [
            'asset_wrong_kind',
            {
              kind: 'image' as const,
              contentHash: `sha256-${'a'.repeat(64)}`,
              contentType: 'image/png',
            },
          ],
        ]),
      }),
    ).toThrow(/unavailable/iu);
  });

  it('hashes the exact theme snapshot and renderer contract version', async () => {
    const baselineTheme = cloneFallbackTheme();
    const changedTheme = cloneFallbackTheme();
    changedTheme.definition.tokens.modes.light.colors.accent = '#335fff';
    changedTheme.contentHash = await computeBrandThemeContentHash(changedTheme);

    const baseline = await compileDocument(themedInput(document, baselineTheme));
    const changedToken = await compileDocument(themedInput(document, changedTheme));
    const changedRenderer = await compileDocument({
      ...themedInput(document, baselineTheme),
      rendererContractVersion: '2',
    });

    expect(changedToken.contentHash).not.toBe(baseline.contentHash);
    expect(changedRenderer.contentHash).not.toBe(baseline.contentHash);
  });

  it('hashes canonical trigger and audience behavior', async () => {
    const changedTrigger = structuredClone(document);
    changedTrigger.trigger = { type: 'pageLoad', config: { delayMs: 750 } };
    const changedAudience = structuredClone(document);
    changedAudience.audience = {
      environments: ['staging'],
      rules: [{ source: 'identify', key: 'plan', operator: 'equals', value: 'pro' }],
    };

    const [baseline, triggerArtifact, audienceArtifact] = await Promise.all([
      compileDocument(themedInput(document)),
      compileDocument(themedInput(changedTrigger)),
      compileDocument(themedInput(changedAudience)),
    ]);

    expect(triggerArtifact.contentHash).not.toBe(baseline.contentHash);
    expect(audienceArtifact.contentHash).not.toBe(baseline.contentHash);
  });

  it('deep-clones the theme snapshot before compilation and hashing', async () => {
    const mutableTheme = cloneFallbackTheme();
    const compiled = await compileDocument(themedInput(document, mutableTheme));
    mutableTheme.definition.tokens.modes.light.colors.accent = '#335fff';
    mutableTheme.definition.recipes.tour.default.surfaceRole = 'danger';

    expect(compiled.theme.definition.tokens.modes.light.colors.accent).toBe('#2457ff');
    expect(compiled.theme.definition.recipes.tour.default.surfaceRole).toBe('surfaceRaised');
  });

  it('rejects invalid theme snapshots at the compiler boundary', () => {
    const invalidTheme = cloneFallbackTheme();
    invalidTheme.definition.tokens.modes.light.colors.accent = 'var(--accent)';

    expect(() => compile(themedInput(document, invalidTheme))).toThrow(
      'Compiler requires a valid BrandThemeSnapshot',
    );
  });

  it('rejects a structurally valid theme whose content hash is stale', async () => {
    const staleTheme = cloneFallbackTheme();
    staleTheme.definition.tokens.modes.light.colors.accent = '#335fff';

    await expect(compileDocument(themedInput(document, staleTheme))).rejects.toThrow(
      'BrandThemeSnapshot contentHash does not match its immutable content',
    );
  });

  it('keeps immutable Phase 1 artifacts readable through the compatibility schema', () => {
    const legacyArtifact = {
      documentId: document.id,
      type: document.type,
      contentHash: `sha256-${'a'.repeat(64)}`,
      schemaVersion: document.schemaVersion,
      compilerVersion: '0.1.0',
      targets: [],
      steps: [],
    };

    expect(validate(CompiledDocumentV1, legacyArtifact).valid).toBe(true);
    expect(validate(CompiledDocument, legacyArtifact).valid).toBe(true);
  });

  it('does not let malformed V2 artifacts fall through the legacy schema branch', async () => {
    const malformed = await compileDocument(themedInput(document));
    malformed.theme.definition.tokens.modes.light.colors.accent = 'var(--accent)';

    expect(validate(CompiledDocument, malformed).valid).toBe(false);
  });

  it.each([
    [
      'trigger',
      (artifact: Awaited<ReturnType<typeof compileDocument>>) => {
        Object.assign(artifact.trigger, { selector: '#unsafe-trigger' });
      },
    ],
    [
      'audience',
      (artifact: Awaited<ReturnType<typeof compileDocument>>) => {
        Object.assign(artifact.audience, { customerQuery: 'select * from users' });
      },
    ],
    [
      'step',
      (artifact: Awaited<ReturnType<typeof compileDocument>>) => {
        Object.assign(artifact.steps[0]!, { rawHtml: '<script>alert(1)</script>' });
      },
    ],
    [
      'body node',
      (artifact: Awaited<ReturnType<typeof compileDocument>>) => {
        Object.assign(artifact.steps[0]!.body[0]!, { css: 'position: fixed' });
      },
    ],
    [
      'target',
      (artifact: Awaited<ReturnType<typeof compileDocument>>) => {
        Object.assign(artifact.targets[0]!, { selector: '#unsafe-css-fallback' });
      },
    ],
    [
      'body props',
      (artifact: Awaited<ReturnType<typeof compileDocument>>) => {
        Object.assign(artifact.steps[0]!.body[0]!.props, { style: 'position: fixed' });
      },
    ],
    [
      'target fingerprint',
      (artifact: Awaited<ReturnType<typeof compileDocument>>) => {
        Object.assign(artifact.targets[0]!.fingerprint, { selector: '#unsafe-css-fallback' });
      },
    ],
    [
      'target ancestor landmark',
      (artifact: Awaited<ReturnType<typeof compileDocument>>) => {
        Object.assign(artifact.targets[0]!.fingerprint.ancestorLandmarks![0]!, {
          selector: '#unsafe-css-fallback',
        });
      },
    ],
    [
      'step lifecycle',
      (artifact: Awaited<ReturnType<typeof compileDocument>>) => {
        Object.assign(artifact.steps[0]!, {
          lifecycle: { expectedRoute: '/projects', selector: '#unsafe-css-fallback' },
        });
      },
    ],
  ])('rejects unknown properties on a V2 compiled %s', async (_location, addUnknownProperty) => {
    const malformed = await compileDocument(themedInput(document));
    addUnknownProperty(malformed);

    expect(validate(CompiledDocumentV2, malformed).valid).toBe(false);
    expect(validate(CompiledDocument, malformed).valid).toBe(false);
  });

  it('retains permissive nested Phase 1 artifacts through the compatibility reader', async () => {
    const compiled = await compileDocument(themedInput(document));
    const legacyArtifact = {
      documentId: compiled.documentId,
      type: compiled.type,
      contentHash: compiled.contentHash,
      schemaVersion: compiled.schemaVersion,
      compilerVersion: '0.1.0',
      targets: compiled.targets.map((target) => ({
        ...target,
        legacySelectorHint: '#new-project',
        fingerprint: {
          ...target.fingerprint,
          legacySelectorHint: '#new-project',
          ancestorLandmarks: target.fingerprint.ancestorLandmarks?.map((landmark) => ({
            ...landmark,
            legacySelectorHint: 'main',
          })),
        },
      })),
      steps: compiled.steps.map((step) => ({
        ...step,
        legacyTransition: 'fade',
        lifecycle: {
          expectedRoute: '/projects',
          legacyWaitStrategy: 'phase-1-poll',
          waitForElement: {
            ...compiled.targets[0]!.fingerprint,
            legacySelectorHint: '#new-project',
          },
        },
        body: step.body.map((node) => ({
          ...node,
          legacyRendererHint: 'compact',
        })),
      })),
    };

    expect(validate(CompiledDocumentV1, legacyArtifact).valid).toBe(true);
    expect(validate(CompiledDocument, legacyArtifact).valid).toBe(true);
  });

  it('clones mutable source props and target fingerprints into the compiled artifact', async () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    mutableDocument.targets[0]!.fingerprint.diagnosticCoordinates = { x: 120, y: 80 };
    const compiled = await compileDocument(themedInput(mutableDocument));

    const heading = mutableDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.id === 'block_heading_1',
    );
    if (!heading) throw new Error('fixture heading missing');

    heading.props.level = 3;
    const stableAttributes = mutableDocument.targets[0]!.fingerprint.stableAttributes;
    if (!stableAttributes) throw new Error('fixture stable attributes missing');
    stableAttributes['data-lodariq-id'] = 'changed';

    const compiledHeading = compiled.steps[0]?.body.find((block) => block.id === 'block_heading_1');
    expect(compiledHeading?.props).toEqual({ level: 2 });
    expect(compiled.targets[0]?.fingerprint.stableAttributes?.['data-lodariq-id']).toBe(
      'new-project',
    );
    expect(compiled.targets[0]?.fingerprint.diagnosticCoordinates).toBeUndefined();
  });

  it('preserves safe structured text styles in immutable delivery artifacts', async () => {
    const mutableDocument = structuredClone(document);
    const heading = mutableDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.id === 'block_heading_1',
    );
    if (!heading) throw new Error('fixture heading missing');
    heading.props.textStyle = {
      align: 'center',
      fontSizePx: 24,
      color: '#0a4f43',
      fontWeight: 700,
      fontStyle: 'italic',
    };

    const compiled = await compileDocument(themedInput(mutableDocument));
    const compiledHeading = compiled.steps[0]?.body.find((block) => block.id === heading.id);

    expect(compiledHeading?.props.textStyle).toEqual(heading.props.textStyle);
    expect(compiledHeading?.props.textStyle).not.toBe(heading.props.textStyle);
  });

  it('preserves ordered rich content and safe popup/action composition', async () => {
    const mutableDocument = structuredClone(document);
    const tooltip = tourTooltip(mutableDocument);
    const heading = tooltip.children.find((block) => block.type === 'heading')!;
    const button = tooltip.children.find((block) => block.type === 'button')!;
    heading.content = 'Launch in 3 days';
    heading.contentRuns = [
      { text: 'Launch in ' },
      {
        text: '3 days',
        marks: ['bold'],
        fontSizePx: 24,
        color: '#006b58',
        highlightColor: '#fff0a8',
      },
    ];
    button.props.variant = 'outline';
    button.props.blockLayout = { align: 'center', spacingBefore: 'relaxed' };
    button.props.buttonStyle = {
      width: 'fill',
      size: 'compact',
      fillColor: '#ffffff',
      textColor: '#006b58',
      borderColor: '#006b58',
      radius: 'round',
      icon: 'arrow-right',
      iconPlacement: 'end',
    };
    tooltip.props.tooltipLayout = {
      widthPx: 480,
      heightPx: 320,
      contentAlign: 'center',
      actionLayout: 'stack',
      actionAlign: 'stretch',
      gap: 'relaxed',
      padding: 'compact',
      radius: 'round',
      showArrow: false,
    };
    tooltip.props.tooltipStyle = {
      surfaceColor: '#162033',
      textColor: '#ffffff',
      borderColor: '#006b58',
      borderWeight: 'strong',
      elevation: 'floating',
    };
    tooltip.children.splice(tooltip.children.indexOf(button) + 1, 0, {
      id: 'after_button_copy',
      type: 'paragraph',
      content: 'You can change this later.',
      props: {},
      children: [],
    });

    const compiled = await compileDocument(themedInput(mutableDocument));
    const step = compiled.steps[0]!;
    const compiledHeading = step.body.find((block) => block.id === heading.id)!;
    const compiledButton = step.body.find((block) => block.id === button.id)!;

    expect(step.body.map((block) => block.id)).toEqual([
      heading.id,
      tooltip.children.find((block) => block.type === 'paragraph')!.id,
      button.id,
      'after_button_copy',
    ]);
    expect(step.tooltipLayout).toEqual(tooltip.props.tooltipLayout);
    expect(step.tooltipStyle).toEqual(tooltip.props.tooltipStyle);
    expect(step.tooltipStyle).not.toBe(tooltip.props.tooltipStyle);
    expect(compiledHeading.contentRuns).toEqual(heading.contentRuns);
    expect(compiledHeading.contentRuns).not.toBe(heading.contentRuns);
    expect(compiledButton.props).toMatchObject({
      variant: 'outline',
      blockLayout: button.props.blockLayout,
      buttonStyle: button.props.buttonStyle,
    });
  });

  it('retains a legacy selector hint only for fingerprint-only compatibility targets', () => {
    const mutableDocument = structuredClone(document);
    mutableDocument.targets[0]!.fingerprint.scopedCss = '#legacy-selector-hint';

    const compiled = compile(themedInput(mutableDocument));

    expect(compiled.targets[0]!.identity).toBeUndefined();
    expect(compiled.targets[0]!.fingerprint.scopedCss).toBe('#legacy-selector-hint');
  });

  it('copies and deep-clones Target Identity V2 into the compiled artifact', () => {
    const mutableDocument = structuredClone(document);
    const identity = createTargetIdentityV2(mutableDocument.targets[0]!.id);
    identity.visualFingerprints = [
      {
        viewportClass: 'desktop',
        stateId: 'projects.loaded',
        structuralHash: '0123456789abcdef',
        occupancyGrid: '0'.repeat(64),
        appearanceHash: 'fedcba9876543210',
        neighborhoodHash: '0011223344556677',
      },
    ];
    mutableDocument.targets[0]!.identity = identity;
    mutableDocument.targets[0]!.fingerprint.scopedCss = '#legacy-selector-hint';

    const compiled = compile(themedInput(mutableDocument));
    const compiledIdentity = compiled.targets[0]!.identity;

    expect(compiledIdentity).toEqual(identity);
    expect(compiledIdentity).not.toBe(identity);
    expect(compiled.targets[0]!.fingerprint.scopedCss).toBeUndefined();

    identity.visualTopologies![0]!.target.centerXRatio = 0.25;
    identity.visualFingerprints[0]!.structuralHash = '1111111111111111';
    identity.localizedEvidence[0]!.accessibleName = 'Changed after compilation';

    expect(compiledIdentity!.visualTopologies![0]!.target.centerXRatio).toBe(872 / 960);
    expect(compiledIdentity!.visualFingerprints![0]!.structuralHash).toBe('0123456789abcdef');
    expect(compiledIdentity!.localizedEvidence[0]!.accessibleName).toBe('New project');
  });

  it('rejects a Target Identity V2 bound to a different outer target id', () => {
    const mutableDocument = structuredClone(document);
    mutableDocument.targets[0]!.identity = createTargetIdentityV2('target_other');

    expect(() => compile(themedInput(mutableDocument))).toThrow(/not bound/);
  });

  it('strips arbitrary block props from compiled delivery JSON', async () => {
    const mutableDocument = JSON.parse(JSON.stringify(document)) as LodariqDocument;
    const heading = mutableDocument.blocks[0]?.children[0]?.children.find(
      (block) => block.id === 'block_heading_1',
    );
    if (!heading) throw new Error('fixture heading missing');
    Object.assign(heading.props, {
      level: 2,
      style: 'background:url(javascript:alert(1))',
      html: '<script>alert(1)</script>',
      onclick: 'alert(1)',
    });

    const compiled = await compileDocument(themedInput(mutableDocument));
    const compiledHeading = compiled.steps[0]?.body.find((block) => block.id === 'block_heading_1');

    expect(compiledHeading?.props).toEqual({ level: 2 });
  });

  it('rejects presentation geometry inside compiled body-node props', async () => {
    const malformed = await compileDocument(themedInput(document));
    Object.assign(malformed.steps[0]!.body[0]!.props, {
      presentationAnchor: { kind: 'point', xRatio: 0.5, yRatio: 0.5 },
    });

    expect(validate(CompiledDocumentV2, malformed).valid).toBe(false);
  });
});

function themedInput(
  inputDocument: LodariqDocument,
  theme: BrandThemeSnapshot = LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
): CompileInput {
  return {
    document: inputDocument,
    theme,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  };
}

function cloneFallbackTheme(): BrandThemeSnapshot {
  return structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
}

function tourTooltip(inputDocument: LodariqDocument): LodariqBlock {
  const tooltip = inputDocument.blocks[0]?.children.find((block) => block.type === 'tooltip');
  if (!tooltip) throw new Error('fixture tooltip missing');
  return tooltip;
}
