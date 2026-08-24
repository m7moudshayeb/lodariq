import { canonicalJson, sha256Hex } from '@lodariq/compiler';
import {
  CompiledDocument as CompiledDocumentSchema,
  DEMO_ARTIFACT_POLICY_VERSION,
  validate,
  type CompiledDocument,
  type DemoArtifactReview,
  type DemoArtifactReviewSummary,
} from '@lodariq/schema';

const SAFE_DEMO_ACTIONS = new Set(['back', 'complete', 'dismiss', 'next']);

export interface PreparedPublicDemoArtifact {
  artifact: CompiledDocument;
  review: DemoArtifactReview;
}

/**
 * Builds the targetless public projection once, before a link is issued.
 *
 * The source publication remains immutable. This projection retains approved
 * copy, renderer recipes, theme, locale branches, and media asset identities,
 * while removing every instruction that could inspect or operate a customer
 * product. Its own content hash makes the exact reviewed bytes durable.
 */
export async function preparePublicDemoArtifact(input: {
  publicationId: string;
  artifact: CompiledDocument;
}): Promise<PreparedPublicDemoArtifact> {
  const projection = structuredClone(input.artifact) as unknown as Record<string, unknown>;
  const summary = emptyReviewSummary();

  redactDeliveryEnvelope(projection, summary);
  await assignProjectionContentHash(projection);

  const checked = validate(CompiledDocumentSchema, projection);
  if (!checked.valid) {
    throw new Error('The immutable publication cannot produce a valid public demo artifact');
  }
  const artifact = checked.value as CompiledDocument;
  const reviewBase = {
    schemaVersion: '1' as const,
    policyVersion: DEMO_ARTIFACT_POLICY_VERSION,
    publicationId: input.publicationId,
    sourceContentHash: input.artifact.contentHash,
    presentationContentHash: artifact.contentHash,
    approved: true as const,
    summary,
  };
  const reviewHash = `sha256-${await sha256Hex(canonicalJson(reviewBase))}`;
  return { artifact, review: { ...reviewBase, reviewHash } };
}

function emptyReviewSummary(): DemoArtifactReviewSummary {
  return {
    targetBindingsRemoved: 0,
    lifecycleHintsRemoved: 0,
    unsafeActionsReplaced: 0,
    externalLinksRemoved: 0,
    audienceRulesRemoved: 0,
    conditionalRulesRemoved: 0,
    handoffsRemoved: 0,
    productSignalsRemoved: 0,
  };
}

function redactDeliveryEnvelope(
  artifact: Record<string, unknown>,
  summary: DemoArtifactReviewSummary,
): void {
  const targets = arrayValue(artifact['targets']);
  summary.targetBindingsRemoved += targets.length;
  artifact['targets'] = [];

  const audience = recordValue(artifact['audience']);
  if (audience) {
    summary.audienceRulesRemoved += arrayValue(audience['rules']).length;
    artifact['audience'] = { environments: ['staging'] };
  }
  if (artifact['trigger'] !== undefined) {
    if (recordValue(artifact['trigger'])?.['type'] !== 'manual') summary.productSignalsRemoved += 1;
    artifact['trigger'] = { type: 'manual' };
  }

  if (artifact['experiment'] !== undefined) {
    delete artifact['experiment'];
    summary.productSignalsRemoved += 1;
  }
  redactExperienceFrequency(artifact, summary);
  if (artifact['applications'] !== undefined) {
    summary.handoffsRemoved += arrayValue(artifact['applications']).length;
    delete artifact['applications'];
  }
  redactCompletion(artifact, summary);
  redactSteps(arrayValue(artifact['steps']), summary);

  const localization = recordValue(artifact['localization']);
  for (const variant of arrayValue(localization?.['variants'])) {
    const variantRecord = recordValue(variant);
    if (variantRecord) redactSteps(arrayValue(variantRecord['steps']), summary);
  }
}

function redactExperienceFrequency(
  artifact: Record<string, unknown>,
  summary: DemoArtifactReviewSummary,
): void {
  const experience = recordValue(artifact['experience']);
  if (!experience) return;
  if (experience['type'] === 'announcement' && experience['frequency'] !== 'always') {
    experience['frequency'] = 'always';
    summary.productSignalsRemoved += 1;
  }
  if (experience['type'] === 'survey' && experience['submission'] !== 'repeatable') {
    experience['submission'] = 'repeatable';
    summary.productSignalsRemoved += 1;
  }
}

function redactCompletion(
  artifact: Record<string, unknown>,
  summary: DemoArtifactReviewSummary,
): void {
  const completion = recordValue(artifact['completion']);
  if (!completion) return;
  if (completion['type'] === 'activateTarget' || completion['type'] === 'openPage') {
    artifact['completion'] = { type: 'stop' };
    summary.unsafeActionsReplaced += 1;
  }
}

function redactSteps(steps: unknown[], summary: DemoArtifactReviewSummary): void {
  for (const value of steps) {
    const step = recordValue(value);
    if (!step) continue;
    if (step['targetId'] !== undefined) {
      delete step['targetId'];
      summary.targetBindingsRemoved += 1;
    }
    if (step['lifecycle'] !== undefined) {
      delete step['lifecycle'];
      summary.lifecycleHintsRemoved += 1;
    }
    if (step['showWhen'] !== undefined) {
      delete step['showWhen'];
      summary.conditionalRulesRemoved += 1;
    }
    if (step['handoff'] !== undefined) {
      delete step['handoff'];
      summary.handoffsRemoved += 1;
    }
    if (step['entrySequence'] !== undefined) {
      delete step['entrySequence'];
      summary.unsafeActionsReplaced += 1;
    }
    if (step['teaches'] !== undefined) {
      delete step['teaches'];
      summary.productSignalsRemoved += 1;
    }
    for (const bodyValue of arrayValue(step['body'])) redactBodyNode(bodyValue, summary);
  }
}

function redactBodyNode(value: unknown, summary: DemoArtifactReviewSummary): void {
  const node = recordValue(value);
  if (!node) return;
  for (const runValue of arrayValue(node['contentRuns'])) {
    const run = recordValue(runValue);
    if (run?.['link'] !== undefined) {
      delete run['link'];
      summary.externalLinksRemoved += 1;
    }
  }
  const props = recordValue(node['props']);
  if (!props) return;
  if (props['showWhen'] !== undefined) {
    delete props['showWhen'];
    summary.conditionalRulesRemoved += 1;
  }
  const action = recordValue(props['action']);
  if (!action) return;
  const type = typeof action['type'] === 'string' ? action['type'] : '';
  if (SAFE_DEMO_ACTIONS.has(type)) {
    if (action['transition'] !== undefined) {
      delete action['transition'];
      summary.conditionalRulesRemoved += 1;
    }
    props['action'] = action;
    return;
  }
  props['action'] = { type: 'next' };
  summary.unsafeActionsReplaced += 1;
  if (type === 'openPage') summary.externalLinksRemoved += 1;
}

async function assignProjectionContentHash(artifact: Record<string, unknown>): Promise<void> {
  const content = structuredClone(artifact);
  delete content['contentHash'];
  artifact['contentHash'] = `sha256-${await sha256Hex(canonicalJson(content))}`;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
