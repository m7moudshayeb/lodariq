import { Type, type Static } from '@sinclair/typebox';
import { TargetApproach } from './approach';
import { DEFAULT_EXPERIENCE_APPEARANCE } from './brand';
import type { CompiledDocument } from './compiled';
import { defaultExperienceBehavior, type DeliverableExperienceType } from './experience';
import type { LodariqDocument } from './document';
import type { LodariqBlock } from './block';

const IDENTIFIER = Type.String({
  minLength: 1,
  maxLength: 160,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
});
const OPERATION_ID = Type.String({
  minLength: 20,
  maxLength: 160,
  pattern: '^[A-Za-z][A-Za-z0-9_-]{19,}$',
});
const ISO_TIMESTAMP = Type.String({ format: 'date-time' });
const ARBITRARY_LOCALE = Type.String({ minLength: 2, maxLength: 35 });

export const DEMO_PUBLIC_ORIGIN = 'https://demo.lodariq.io' as const;
export const DEMO_PLAYER_MODULE_URL = 'https://cdn.lodariq.io/sdk/lodariq-demo-player.js' as const;
export const DEMO_LINK_EXPIRY_SECONDS = { min: 300, max: 86_400 } as const;
export const DEMO_ARTIFACT_POLICY_VERSION = '1' as const;

export const DemoLinkScope = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    workspaceId: IDENTIFIER,
    environmentId: IDENTIFIER,
    documentId: IDENTIFIER,
    publicationId: IDENTIFIER,
    contentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    origin: Type.Literal(DEMO_PUBLIC_ORIGIN),
    redaction: Type.Literal('structured-artifact'),
    analytics: Type.Literal('scoped-anonymous'),
  },
  { $id: 'DemoLinkScope', additionalProperties: false },
);
export type DemoLinkScope = Static<typeof DemoLinkScope>;

export const DemoLink = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    id: Type.String({ pattern: '^demo_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    url: Type.String({ pattern: '^https://demo\\.lodariq\\.io/d/[A-Za-z0-9_-]{20,}$' }),
    scope: Type.Ref(DemoLinkScope),
    createdAt: ISO_TIMESTAMP,
    expiresAt: ISO_TIMESTAMP,
    revokedAt: Type.Optional(Type.Union([ISO_TIMESTAMP, Type.Null()])),
    status: Type.Union([Type.Literal('active'), Type.Literal('expired'), Type.Literal('revoked')]),
  },
  { $id: 'DemoLink', additionalProperties: false },
);
export type DemoLink = Static<typeof DemoLink>;

export const DemoArtifactReviewSummary = Type.Object(
  {
    targetBindingsRemoved: Type.Integer({ minimum: 0 }),
    lifecycleHintsRemoved: Type.Integer({ minimum: 0 }),
    unsafeActionsReplaced: Type.Integer({ minimum: 0 }),
    externalLinksRemoved: Type.Integer({ minimum: 0 }),
    audienceRulesRemoved: Type.Integer({ minimum: 0 }),
    conditionalRulesRemoved: Type.Integer({ minimum: 0 }),
    handoffsRemoved: Type.Integer({ minimum: 0 }),
    productSignalsRemoved: Type.Integer({ minimum: 0 }),
  },
  { $id: 'DemoArtifactReviewSummary', additionalProperties: false },
);
export type DemoArtifactReviewSummary = Static<typeof DemoArtifactReviewSummary>;

export const DemoArtifactReview = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    policyVersion: Type.Literal(DEMO_ARTIFACT_POLICY_VERSION),
    reviewHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    publicationId: IDENTIFIER,
    sourceContentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    presentationContentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    approved: Type.Literal(true),
    summary: Type.Ref(DemoArtifactReviewSummary),
  },
  { $id: 'DemoArtifactReview', additionalProperties: false },
);
export type DemoArtifactReview = Static<typeof DemoArtifactReview>;

export const ReviewDemoArtifactRequest = Type.Object(
  {
    publicationId: IDENTIFIER,
    contentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
  },
  { $id: 'ReviewDemoArtifactRequest', additionalProperties: false },
);
export type ReviewDemoArtifactRequest = Static<typeof ReviewDemoArtifactRequest>;

export const CreateDemoLinkRequest = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    operationId: OPERATION_ID,
    publicationId: IDENTIFIER,
    contentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    expiresInSeconds: Type.Integer({
      minimum: DEMO_LINK_EXPIRY_SECONDS.min,
      maximum: DEMO_LINK_EXPIRY_SECONDS.max,
    }),
    reviewHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
  },
  { $id: 'CreateDemoLinkRequest', additionalProperties: false },
);
export type CreateDemoLinkRequest = Static<typeof CreateDemoLinkRequest>;

export const PublicDemoArtifact = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    demoId: Type.String({ pattern: '^demo_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    /** Hash of the exact immutable publication selected by the creator. */
    contentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    /** Hash of the targetless, policy-redacted runtime projection below. */
    presentationContentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    // The public route validates the artifact envelope here. The immutable
    // compiled payload has its own versioned schema and is loaded by the
    // coordinator without compiling or transforming it.
    artifact: Type.Object({}, { additionalProperties: true }),
  },
  { $id: 'PublicDemoArtifact', additionalProperties: false },
);
export type PublicDemoArtifact = {
  schemaVersion: '1';
  demoId: string;
  contentHash: string;
  presentationContentHash: string;
  artifact: CompiledDocument;
};

export const DemoLinkAnalyticsEvent = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    event: Type.Union([
      Type.Literal('viewed'),
      Type.Literal('step_started'),
      Type.Literal('completed'),
      Type.Literal('dismissed'),
    ]),
    stepId: Type.Optional(IDENTIFIER),
  },
  { $id: 'DemoLinkAnalyticsEvent', additionalProperties: false },
);
export type DemoLinkAnalyticsEvent = Static<typeof DemoLinkAnalyticsEvent>;

export const DemoAnalyticsSummary = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    views: Type.Integer({ minimum: 0 }),
    completions: Type.Integer({ minimum: 0 }),
    dismissals: Type.Integer({ minimum: 0 }),
    lastStepIds: Type.Array(IDENTIFIER, { maxItems: 100, uniqueItems: true }),
  },
  { $id: 'DemoAnalyticsSummary', additionalProperties: false },
);
export type DemoAnalyticsSummary = Static<typeof DemoAnalyticsSummary>;

export const LOCALE_LAYOUT_QA_SCHEMA_VERSION = '1' as const;
export const LOCALE_LAYOUT_QA_FINDING_LIMIT = 250 as const;
export const LOCALE_LAYOUT_QA_ISSUE_CODES = [
  'horizontal_overflow',
  'vertical_overflow',
  'viewport_clipping',
  'action_clipping',
  'presentation_unavailable',
] as const;

export const LocaleLayoutQaIssueCode = Type.Union(
  LOCALE_LAYOUT_QA_ISSUE_CODES.map((code) => Type.Literal(code)),
  { $id: 'LocaleLayoutQaIssueCode' },
);
export type LocaleLayoutQaIssueCode = Static<typeof LocaleLayoutQaIssueCode>;

export const LocaleLayoutQaFinding = Type.Object(
  {
    locale: ARBITRARY_LOCALE,
    stepId: IDENTIFIER,
    status: Type.Union([Type.Literal('failed'), Type.Literal('unavailable')]),
    issues: Type.Array(Type.Ref(LocaleLayoutQaIssueCode), {
      minItems: 1,
      maxItems: LOCALE_LAYOUT_QA_ISSUE_CODES.length,
      uniqueItems: true,
    }),
  },
  { $id: 'LocaleLayoutQaFinding', additionalProperties: false },
);
export type LocaleLayoutQaFinding = Static<typeof LocaleLayoutQaFinding>;

export const LocaleLayoutQaReport = Type.Object(
  {
    schemaVersion: Type.Literal(LOCALE_LAYOUT_QA_SCHEMA_VERSION),
    documentRevision: Type.Integer({ minimum: 0 }),
    contentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    checkedAt: ISO_TIMESTAMP,
    viewport: Type.Object(
      {
        width: Type.Integer({ minimum: 1, maximum: 20_000 }),
        height: Type.Integer({ minimum: 1, maximum: 20_000 }),
      },
      { additionalProperties: false },
    ),
    checkedLocaleCount: Type.Integer({ minimum: 1 }),
    checkedStepCount: Type.Integer({ minimum: 1 }),
    checkedPresentationCount: Type.Integer({ minimum: 1 }),
    passedCount: Type.Integer({ minimum: 0 }),
    failedCount: Type.Integer({ minimum: 0 }),
    unavailableCount: Type.Integer({ minimum: 0 }),
    findingLimitReached: Type.Boolean(),
    findings: Type.Array(Type.Ref(LocaleLayoutQaFinding), {
      maxItems: LOCALE_LAYOUT_QA_FINDING_LIMIT,
    }),
  },
  { $id: 'LocaleLayoutQaReport', additionalProperties: false },
);
export type LocaleLayoutQaReport = Static<typeof LocaleLayoutQaReport>;

export const VoiceTranscriptSegment = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: 2_000 }),
    startMs: Type.Integer({ minimum: 0, maximum: 300_000 }),
    endMs: Type.Integer({ minimum: 1, maximum: 300_000 }),
  },
  { $id: 'VoiceTranscriptSegment', additionalProperties: false },
);
export type VoiceTranscriptSegment = Static<typeof VoiceTranscriptSegment>;

export const VoiceAuthoringProposal = Type.Object(
  {
    proposalId: Type.String({ pattern: '^voice_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    locale: ARBITRARY_LOCALE,
    transcript: Type.String({ minLength: 1, maxLength: 10_000 }),
    segments: Type.Array(Type.Ref(VoiceTranscriptSegment), { maxItems: 200 }),
    proposedStep: Type.Object(
      {
        title: Type.String({ minLength: 1, maxLength: 240 }),
        body: Type.String({ maxLength: 10_000 }),
      },
      { additionalProperties: false },
    ),
    narrationScript: Type.String({ minLength: 1, maxLength: 10_000 }),
    proposedTarget: Type.Optional(
      Type.Object(
        {
          targetId: IDENTIFIER,
          accessibilityName: Type.String({ minLength: 1, maxLength: 500 }),
        },
        { additionalProperties: false },
      ),
    ),
    reviewRequired: Type.Literal(true),
  },
  { $id: 'VoiceAuthoringProposal', additionalProperties: false },
);
export type VoiceAuthoringProposal = Static<typeof VoiceAuthoringProposal>;

export const VoiceAuthoringRequest = Type.Object(
  {
    operationId: OPERATION_ID,
    microphoneGestureId: Type.String({ minLength: 8, maxLength: 160 }),
    locale: ARBITRARY_LOCALE,
    transcript: Type.String({ minLength: 1, maxLength: 10_000 }),
    segments: Type.Array(Type.Ref(VoiceTranscriptSegment), { maxItems: 200 }),
  },
  { $id: 'VoiceAuthoringRequest', additionalProperties: false },
);
export type VoiceAuthoringRequest = Static<typeof VoiceAuthoringRequest>;

export const RecordedSemanticAction = Type.Union(
  [
    Type.Object(
      {
        kind: Type.Literal('target-observed'),
        targetId: IDENTIFIER,
        accessibleName: Type.String({ minLength: 1, maxLength: 500 }),
        role: Type.String({ minLength: 1, maxLength: 100 }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Union([
          Type.Literal('scroll'),
          Type.Literal('open-panel'),
          Type.Literal('select-tab'),
          Type.Literal('wait-for-lifecycle'),
        ]),
        semanticName: Type.String({ minLength: 1, maxLength: 240 }),
        boundedMs: Type.Integer({ minimum: 0, maximum: 30_000 }),
        lifecycleKind: Type.Optional(Type.Union([Type.Literal('route'), Type.Literal('state')])),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'RecordedSemanticAction' },
);
export type RecordedSemanticAction = Static<typeof RecordedSemanticAction>;

export const RecordedFlowSegment = Type.Object(
  {
    segmentId: IDENTIFIER,
    actionIndexes: Type.Array(Type.Integer({ minimum: 0, maximum: 1_000 }), {
      minItems: 1,
      maxItems: 100,
      uniqueItems: true,
    }),
    proposedTitle: Type.String({ minLength: 1, maxLength: 240 }),
    proposedCopy: Type.String({ maxLength: 2_000 }),
    targetId: Type.Optional(IDENTIFIER),
    targetLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
    approach: Type.Optional(Type.Ref(TargetApproach)),
  },
  { $id: 'RecordedFlowSegment', additionalProperties: false },
);
export type RecordedFlowSegment = Static<typeof RecordedFlowSegment>;

export const RecordToAuthorProposal = Type.Object(
  {
    proposalId: Type.String({ pattern: '^record_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    actions: Type.Array(Type.Ref(RecordedSemanticAction), { minItems: 1, maxItems: 1_000 }),
    segments: Type.Array(Type.Ref(RecordedFlowSegment), { minItems: 1, maxItems: 100 }),
    evidenceBound: Type.Literal(true),
    reviewRequired: Type.Literal(true),
  },
  { $id: 'RecordToAuthorProposal', additionalProperties: false },
);
export type RecordToAuthorProposal = Static<typeof RecordToAuthorProposal>;

export const CanonicalTemplateTargetProposal = Type.Object(
  {
    accessibleName: Type.String({ minLength: 1, maxLength: 500 }),
    role: Type.String({ minLength: 1, maxLength: 100 }),
  },
  { $id: 'CanonicalTemplateTargetProposal', additionalProperties: false },
);
export type CanonicalTemplateTargetProposal = Static<typeof CanonicalTemplateTargetProposal>;

export const CanonicalDocumentTemplate = Type.Object(
  {
    id: IDENTIFIER,
    version: Type.Integer({ minimum: 1 }),
    type: Type.Union([
      Type.Literal('tour'),
      Type.Literal('announcement'),
      Type.Literal('hotspot'),
      Type.Literal('survey'),
      Type.Literal('checklist'),
    ]),
    title: Type.String({ minLength: 1, maxLength: 160 }),
    description: Type.String({ minLength: 1, maxLength: 500 }),
    stepTitles: Type.Array(Type.String({ minLength: 1, maxLength: 160 }), {
      minItems: 1,
      maxItems: 20,
    }),
    targetProposals: Type.Array(Type.Ref(CanonicalTemplateTargetProposal), { maxItems: 50 }),
  },
  { $id: 'CanonicalDocumentTemplate', additionalProperties: false },
);
export type CanonicalDocumentTemplate = Static<typeof CanonicalDocumentTemplate>;

export const InstantiateCanonicalTemplateRequest = Type.Object(
  {
    operationId: OPERATION_ID,
    templateId: IDENTIFIER,
  },
  { $id: 'InstantiateCanonicalTemplateRequest', additionalProperties: false },
);
export type InstantiateCanonicalTemplateRequest = Static<
  typeof InstantiateCanonicalTemplateRequest
>;

export const CanonicalTemplateInstantiationResult = Type.Object(
  {
    operationId: OPERATION_ID,
    templateId: IDENTIFIER,
    templateVersion: Type.Integer({ minimum: 1 }),
    documentId: IDENTIFIER,
    title: Type.String({ minLength: 1, maxLength: 160 }),
    type: Type.Union([
      Type.Literal('tour'),
      Type.Literal('announcement'),
      Type.Literal('hotspot'),
      Type.Literal('survey'),
      Type.Literal('checklist'),
    ]),
    targetProposals: Type.Array(Type.Ref(CanonicalTemplateTargetProposal), { maxItems: 50 }),
    created: Type.Boolean(),
  },
  { $id: 'CanonicalTemplateInstantiationResult', additionalProperties: false },
);
export type CanonicalTemplateInstantiationResult = Static<
  typeof CanonicalTemplateInstantiationResult
>;

export const CANONICAL_DOCUMENT_TEMPLATES: readonly CanonicalDocumentTemplate[] = [
  {
    id: 'activation-checklist',
    version: 1,
    type: 'checklist',
    title: 'Activation checklist',
    description: 'A bounded first-week checklist with clear progress.',
    stepTitles: ['Create your first project', 'Invite a teammate', 'Complete setup'],
    targetProposals: [
      { accessibleName: 'Create project', role: 'button' },
      { accessibleName: 'Invite people', role: 'button' },
    ],
  },
  {
    id: 'feature-announcement',
    version: 1,
    type: 'announcement',
    title: 'Feature announcement',
    description: 'A one-surface announcement with one next action.',
    stepTitles: ['What is new'],
    targetProposals: [{ accessibleName: 'Learn more', role: 'button' }],
  },
  {
    id: 'guided-tour',
    version: 1,
    type: 'tour',
    title: 'Guided tour',
    description: 'A concise tour that introduces the primary workflow.',
    stepTitles: ['Start here', 'Make progress', 'Finish the workflow'],
    targetProposals: [],
  },
  {
    id: 'milestone-survey',
    version: 1,
    type: 'survey',
    title: 'Milestone survey',
    description: 'A single bounded question at a meaningful milestone.',
    stepTitles: ['How was that?'],
    targetProposals: [],
  },
] as const;

export const SemanticDiffCategory = Type.Union(
  [
    Type.Literal('content'),
    Type.Literal('targets'),
    Type.Literal('theme'),
    Type.Literal('conditions'),
    Type.Literal('flow'),
    Type.Literal('media'),
    Type.Literal('renderer'),
  ],
  { $id: 'SemanticDiffCategory' },
);
export type SemanticDiffCategory = Static<typeof SemanticDiffCategory>;

export const SemanticDiffEntry = Type.Object(
  {
    category: Type.Ref(SemanticDiffCategory),
    path: Type.String({ minLength: 1, maxLength: 300 }),
    summary: Type.String({ minLength: 1, maxLength: 240 }),
    before: Type.Optional(Type.String({ maxLength: 10_000 })),
    after: Type.Optional(Type.String({ maxLength: 10_000 })),
  },
  { $id: 'SemanticDiffEntry', additionalProperties: false },
);
export type SemanticDiffEntry = Static<typeof SemanticDiffEntry>;

export const SemanticVersionDiff = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    beforeId: IDENTIFIER,
    afterId: IDENTIFIER,
    entries: Type.Array(Type.Ref(SemanticDiffEntry), { maxItems: 500 }),
    requiresReview: Type.Boolean(),
  },
  { $id: 'SemanticVersionDiff', additionalProperties: false },
);
export type SemanticVersionDiff = Static<typeof SemanticVersionDiff>;

export const AuthoringDocumentVersionSummary = Type.Object(
  {
    id: IDENTIFIER,
    version: Type.Integer({ minimum: 1 }),
    createdAt: ISO_TIMESTAMP,
    createdByUserId: Type.Union([IDENTIFIER, Type.Null()]),
    hasCompiledArtifact: Type.Boolean(),
  },
  { $id: 'AuthoringDocumentVersionSummary', additionalProperties: false },
);
export type AuthoringDocumentVersionSummary = Static<typeof AuthoringDocumentVersionSummary>;

export const AuthoringDocumentVersionList = Type.Object(
  {
    versions: Type.Array(Type.Ref(AuthoringDocumentVersionSummary), { maxItems: 500 }),
  },
  { $id: 'AuthoringDocumentVersionList', additionalProperties: false },
);
export type AuthoringDocumentVersionList = Static<typeof AuthoringDocumentVersionList>;

export const CompareAuthoringDocumentVersionsRequest = Type.Object(
  {
    beforeVersionId: IDENTIFIER,
    afterVersionId: IDENTIFIER,
  },
  { $id: 'CompareAuthoringDocumentVersionsRequest', additionalProperties: false },
);
export type CompareAuthoringDocumentVersionsRequest = Static<
  typeof CompareAuthoringDocumentVersionsRequest
>;

export const ChangeAwareCopySuggestion = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    id: Type.String({ pattern: '^copy_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    driftRunId: IDENTIFIER,
    checkId: IDENTIFIER,
    documentId: IDENTIFIER,
    blockId: IDENTIFIER,
    path: Type.String({ minLength: 1, maxLength: 300 }),
    locale: Type.Optional(ARBITRARY_LOCALE),
    before: Type.String({ maxLength: 10_000 }),
    after: Type.String({ minLength: 1, maxLength: 10_000 }),
    confidence: Type.Integer({ minimum: 0, maximum: 100 }),
    status: Type.Union([
      Type.Literal('pending'),
      Type.Literal('applied'),
      Type.Literal('dismissed'),
    ]),
    createdAt: ISO_TIMESTAMP,
    appliedAt: Type.Optional(Type.Union([ISO_TIMESTAMP, Type.Null()])),
  },
  { $id: 'ChangeAwareCopySuggestion', additionalProperties: false },
);
export type ChangeAwareCopySuggestion = Static<typeof ChangeAwareCopySuggestion>;

export const ChangeAwareCopySuggestionList = Type.Object(
  {
    suggestions: Type.Array(ChangeAwareCopySuggestion, { maxItems: 500 }),
  },
  { $id: 'ChangeAwareCopySuggestionList', additionalProperties: false },
);
export type ChangeAwareCopySuggestionList = Static<typeof ChangeAwareCopySuggestionList>;

export const CreateChangeAwareCopySuggestionsRequest = Type.Object(
  {
    operationId: OPERATION_ID,
    beforeVersionId: IDENTIFIER,
    afterVersionId: IDENTIFIER,
  },
  { $id: 'CreateChangeAwareCopySuggestionsRequest', additionalProperties: false },
);
export type CreateChangeAwareCopySuggestionsRequest = Static<
  typeof CreateChangeAwareCopySuggestionsRequest
>;

export const ChangeAwareCopySuggestionDecisionRequest = Type.Object(
  {
    operationId: OPERATION_ID,
    suggestionId: Type.String({ pattern: '^copy_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    decision: Type.Union([Type.Literal('applied'), Type.Literal('dismissed')]),
  },
  { $id: 'ChangeAwareCopySuggestionDecisionRequest', additionalProperties: false },
);
export type ChangeAwareCopySuggestionDecisionRequest = Static<
  typeof ChangeAwareCopySuggestionDecisionRequest
>;

export const ChangeAwareCopySuggestionAuditEvent = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    id: Type.String({ pattern: '^copyevt_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    operationId: OPERATION_ID,
    suggestionId: Type.String({ pattern: '^copy_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    documentId: IDENTIFIER,
    actorUserId: IDENTIFIER,
    decision: Type.Union([Type.Literal('applied'), Type.Literal('dismissed')]),
    occurredAt: ISO_TIMESTAMP,
  },
  { $id: 'ChangeAwareCopySuggestionAuditEvent', additionalProperties: false },
);
export type ChangeAwareCopySuggestionAuditEvent = Static<
  typeof ChangeAwareCopySuggestionAuditEvent
>;

export interface SemanticDiffInput {
  beforeId: string;
  afterId: string;
  beforeCanonical?: LodariqDocument | null;
  afterCanonical?: LodariqDocument | null;
  beforeCompiled?: CompiledDocument | null;
  afterCompiled?: CompiledDocument | null;
}

export function instantiateCanonicalTemplate(input: {
  templateId: string;
  documentId: string;
  workspaceId: string;
  environment: LodariqDocument['audience']['environments'][number];
  schemaVersion: string;
  createBlockId: () => string;
}): LodariqDocument {
  const template = CANONICAL_DOCUMENT_TEMPLATES.find(
    (candidate) => candidate.id === input.templateId,
  );
  if (!template) throw new Error(`Unknown canonical template: ${input.templateId}`);
  const blocks = template.stepTitles.map((title, index) => {
    const contentBlock: LodariqBlock = {
      id: input.createBlockId(),
      type: 'heading',
      props: { level: 2 },
      status: 'ready',
      content: title,
      children: [],
    };
    const surface: LodariqBlock = {
      id: input.createBlockId(),
      type: 'tooltip',
      props: { placement: 'bottom' },
      status: 'incomplete',
      children: [contentBlock],
    };
    if (template.type === 'tour') {
      return {
        id: input.createBlockId(),
        type: 'tourStep' as const,
        props: { index },
        status: 'incomplete' as const,
        children: [surface],
      };
    }
    return surface;
  });
  return {
    id: input.documentId,
    workspaceId: input.workspaceId,
    type: template.type as DeliverableExperienceType,
    status: 'draft',
    title: template.title,
    trigger: { type: 'manual' },
    audience: { environments: [input.environment] },
    appearance: structuredClone(DEFAULT_EXPERIENCE_APPEARANCE),
    experience: defaultExperienceBehavior(template.type as DeliverableExperienceType),
    ...(template.type === 'announcement' ? { surfaceForm: 'modal' as const } : {}),
    ...(template.type === 'checklist' ? { surfaceForm: 'floating' as const } : {}),
    targets: [],
    blocks,
    schemaVersion: input.schemaVersion,
  };
}

export function semanticVersionDiff(input: SemanticDiffInput): SemanticVersionDiff {
  const entries: SemanticDiffEntry[] = [];
  const before = input.beforeCanonical;
  const after = input.afterCanonical;
  const beforeCompiled = input.beforeCompiled as Record<string, unknown> | null | undefined;
  const afterCompiled = input.afterCompiled as Record<string, unknown> | null | undefined;
  const compare = (
    category: SemanticDiffCategory,
    path: string,
    beforeValue: unknown,
    afterValue: unknown,
    summary: string,
  ): void => {
    const beforeJson = stableJson(stripSerializationNoise(beforeValue));
    const afterJson = stableJson(stripSerializationNoise(afterValue));
    if (beforeJson === afterJson) return;
    entries.push({
      category,
      path,
      summary,
      ...(beforeJson === undefined ? {} : { before: beforeJson }),
      ...(afterJson === undefined ? {} : { after: afterJson }),
    });
  };
  compare('content', 'document.title', before?.title, after?.title, 'Title changed');
  compare(
    'content',
    'document.blocks.content',
    contentSnapshot(before),
    contentSnapshot(after),
    'Copy changed',
  );
  compare(
    'targets',
    'document.targets',
    before?.targets,
    after?.targets,
    'Semantic targets changed',
  );
  compare(
    'conditions',
    'document.trigger',
    before?.trigger,
    after?.trigger,
    'Start condition changed',
  );
  compare('conditions', 'document.audience', before?.audience, after?.audience, 'Audience changed');
  compare(
    'flow',
    'document.blocks.flow',
    flowSnapshot(before),
    flowSnapshot(after),
    'Flow changed',
  );
  compare(
    'theme',
    'artifact.theme',
    beforeCompiled?.theme,
    afterCompiled?.theme,
    'Theme snapshot changed',
  );
  compare(
    'media',
    'document.blocks.media',
    mediaSnapshot(before),
    mediaSnapshot(after),
    'Media changed',
  );
  compare(
    'renderer',
    'artifact.rendererContractVersion',
    beforeCompiled?.rendererContractVersion,
    afterCompiled?.rendererContractVersion,
    'Renderer contract changed',
  );
  return {
    schemaVersion: '1',
    beforeId: input.beforeId,
    afterId: input.afterId,
    entries: entries.slice(0, 500),
    requiresReview: entries.length > 0,
  };
}

export function createCopySuggestionFromDrift(input: {
  id: string;
  driftRunId: string;
  checkId: string;
  documentId: string;
  blockId: string;
  path: string;
  locale?: string;
  before: string;
  after: string;
  confidence: number;
  createdAt: string;
}): ChangeAwareCopySuggestion {
  if (!input.before.trim() || input.before === input.after) {
    throw new Error('Copy suggestion requires changed bounded text');
  }
  const suggestion: ChangeAwareCopySuggestion = {
    schemaVersion: '1',
    id: input.id,
    driftRunId: input.driftRunId,
    checkId: input.checkId,
    documentId: input.documentId,
    blockId: input.blockId,
    path: input.path,
    ...(input.locale ? { locale: input.locale } : {}),
    before: input.before,
    after: input.after,
    confidence: Math.max(0, Math.min(100, Math.round(input.confidence))),
    status: 'pending',
    createdAt: input.createdAt,
  };
  return suggestion;
}

export function applyCopySuggestion(
  document: LodariqDocument,
  suggestion: ChangeAwareCopySuggestion,
): LodariqDocument {
  if (suggestion.status !== 'pending') throw new Error('Copy suggestion is no longer pending');
  const next = structuredClone(document);
  const block = findBlock(next.blocks, suggestion.blockId);
  if (!block || block.content !== suggestion.before) {
    throw new Error('Copy suggestion no longer matches the current draft');
  }
  block.content = suggestion.after;
  return next;
}

function findBlock(blocks: LodariqBlock[], blockId: string): LodariqBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    const child = findBlock(block.children, blockId);
    if (child) return child;
  }
  return null;
}

function contentSnapshot(document: LodariqDocument | null | undefined): unknown {
  return document?.blocks.map((block) => ({
    id: block.id,
    type: block.type,
    content: block.content,
    children: contentSnapshotBlocks(block.children),
  }));
}

function contentSnapshotBlocks(blocks: readonly LodariqBlock[]): unknown[] {
  return blocks.map((block) => ({
    id: block.id,
    type: block.type,
    content: block.content,
    children: contentSnapshotBlocks(block.children),
  }));
}

function flowSnapshot(document: LodariqDocument | null | undefined): unknown {
  return document?.blocks.map((block) => ({
    id: block.id,
    type: block.type,
    props: { action: block.props.action, transition: block.props.action?.transition },
    children: flowSnapshotBlocks(block.children),
  }));
}

function flowSnapshotBlocks(blocks: readonly LodariqBlock[]): unknown[] {
  return blocks.map((block) => ({
    id: block.id,
    type: block.type,
    props: { action: block.props.action, transition: block.props.action?.transition },
    children: flowSnapshotBlocks(block.children),
  }));
}

function mediaSnapshot(document: LodariqDocument | null | undefined): unknown {
  const media: unknown[] = [];
  const visit = (blocks: readonly LodariqBlock[]): void => {
    for (const block of blocks) {
      if (block.props.media) media.push({ id: block.id, media: block.props.media });
      visit(block.children);
    }
  };
  if (document) visit(document.blocks);
  return media;
}

function stableJson(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return JSON.stringify(value, (_key, nested) => {
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return nested;
    return Object.fromEntries(
      Object.entries(nested as Record<string, unknown>).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  });
}

function stripSerializationNoise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSerializationNoise);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'createdAt' || key === 'updatedAt' || key === 'revision') continue;
    result[key] = stripSerializationNoise(nested);
  }
  return result;
}
