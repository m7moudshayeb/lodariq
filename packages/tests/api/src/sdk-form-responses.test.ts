import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApiApp } from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  getEnvironmentTokenPrefix,
  hashEnvironmentToken,
  type ControlPlaneRepository,
  type PersistedCompiledArtifact,
  type PersistedPublication,
} from '@lodariq/database';
import {
  COMMERCIAL_PLAN_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type LodariqDocument,
  type NewCompiledDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const WORKSPACE_ID = 'wk_survey';
const TOKEN = 'lod_staging_survey_token_1234567890';
const OTHER_TOKEN = 'lod_production_survey_token_098765432';
const AT = '2026-08-09T00:00:00.000Z';

const owner = { 'x-lodariq-workspace-id': WORKSPACE_ID, 'x-lodariq-user-id': 'user_owner' };

const document = {
  ...(structuredClone(tourFixture) as LodariqDocument),
  workspaceId: WORKSPACE_ID,
};

const STEP_ID = 'block_step_1';
const FIELD_ID = 'blk_csat';

const answers = [
  {
    stepId: STEP_ID,
    blockId: FIELD_ID,
    label: 'How hard was that?',
    answer: 'easy',
    occurredAt: '2026-08-09T10:00:00.000Z',
  },
];

/*
 * The deployed artifact, not just the document. The endpoint answers from what
 * is live in this environment, so a seed with a document and no deployment is a
 * document nobody can file answers against — which is the point of M10.
 */
function artifact(): PersistedCompiledArtifact {
  const theme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
  const withoutHash = {
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    documentId: document.id,
    type: 'survey' as const,
    schemaVersion: '1.0.0' as const,
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    trigger: { type: 'manual' as const },
    audience: { environments: ['staging' as const] },
    theme,
    appearance: DEFAULT_EXPERIENCE_APPEARANCE,
    targets: [],
    steps: [
      {
        id: STEP_ID,
        body: [
          { id: FIELD_ID, type: 'formField', text: 'How hard was that?', props: {} },
          { id: 'block_heading_1', type: 'heading', text: 'One question', props: {} },
        ],
      },
    ],
    localization: { defaultLocale: 'en', defaultTitle: 'Survey', variants: [] },
  };
  const compiled = {
    ...withoutHash,
    contentHash: `sha256-${createHash('sha256').update(JSON.stringify(sortKeys(withoutHash))).digest('hex')}`,
  } as NewCompiledDocument;
  return {
    id: 'artifact_survey',
    workspaceId: WORKSPACE_ID,
    documentId: document.id,
    documentVersionId: 'docv_survey',
    contentHash: compiled.contentHash,
    compilerVersion: compiled.compilerVersion,
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    rendererContractVersion: compiled.rendererContractVersion,
    compiled,
    createdAt: AT,
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}

function environment(id: string, kind: 'staging' | 'production') {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    kind,
    name: id,
    originAllowlist: ['https://app.customer.example'],
    createdAt: AT,
    updatedAt: AT,
  };
}

function token(id: string, environmentId: string, value: string, kind: 'staging' | 'production') {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    environmentId,
    environment: kind,
    name: id,
    tokenHash: hashEnvironmentToken(value),
    tokenPrefix: getEnvironmentTokenPrefix(value),
    createdAt: AT,
    revokedAt: null,
  };
}

const survey = artifact();
const publication: PersistedPublication = {
  id: 'pub_survey',
  workspaceId: WORKSPACE_ID,
  correlationId: 'correlation:survey',
  environmentId: 'env_staging',
  environment: 'staging',
  documentId: document.id,
  documentVersionId: survey.documentVersionId,
  compiledArtifactId: survey.id,
  contentHash: survey.contentHash,
  action: null,
  sourcePublicationId: null,
  previousPublicationId: null,
  releaseOperationId: null,
  publishedByUserId: null,
  publishedAt: AT,
  artifact: survey,
};

function repository(): ControlPlaneRepository {
  return createInMemoryControlPlaneRepository({
    users: [
      { id: 'user_owner', legacyIdentityId: null, email: 'o@lodariq.test', name: 'Ada', createdAt: AT },
    ],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: 'user_owner', role: 'owner', createdAt: AT },
    ],
    workspaceSubscriptions: [
      {
        workspaceId: WORKSPACE_ID,
        planId: 'business',
        planVersion: COMMERCIAL_PLAN_VERSION,
        status: 'active',
        entitlementOverrides: {},
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        revision: 1,
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    environments: [environment('env_staging', 'staging'), environment('env_production', 'production')],
    environmentTokens: [
      token('tok_staging', 'env_staging', TOKEN, 'staging'),
      token('tok_production', 'env_production', OTHER_TOKEN, 'production'),
    ],
    documents: [document],
    compiledArtifacts: [survey],
    publications: [publication],
    documentDeployments: [
      {
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_staging',
        documentId: document.id,
        state: 'active',
        activePublicationId: publication.id,
        pendingReleaseOperationId: null,
        generation: 1,
        updatedAt: AT,
      },
    ],
  });
}

function app(store: ControlPlaneRepository = repository()) {
  return {
    api: createApiApp({ repository: store, publicApiBaseUrl: 'https://api.lodariq.io' }),
    store,
  };
}

describe('capturing survey answers from the page', () => {
  it('accepts answers on the credential’s own environment', async () => {
    const { api } = app();
    const response = await api.inject({
      method: 'POST',
      url: '/v1/sdk/form-responses',
      headers: { authorization: `Bearer ${TOKEN}`, origin: 'https://app.customer.example' },
      payload: { documentId: document.id, responses: answers },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 1 });
    await api.close();
  });

  it('files the answer under the token’s environment, not one the page names', async () => {
    const { api } = app();
    await api.inject({
      method: 'POST',
      url: '/v1/sdk/form-responses',
      headers: { authorization: `Bearer ${TOKEN}`, origin: 'https://app.customer.example' },
      payload: {
        documentId: document.id,
        // A page cannot claim to be another environment: there is no field for it.
        responses: answers,
      },
    });

    const staging = await api.inject({
      method: 'GET',
      url: `/v1/documents/${document.id}/analytics?environmentId=env_staging`,
      headers: owner,
    });
    const production = await api.inject({
      method: 'GET',
      url: `/v1/documents/${document.id}/analytics?environmentId=env_production`,
      headers: owner,
    });
    expect(staging.json<{ formResponses: unknown[] }>().formResponses).toHaveLength(1);
    expect(production.json<{ formResponses: unknown[] }>().formResponses).toEqual([]);
    await api.close();
  });

  it('summarizes what was answered without exposing who answered it', async () => {
    const { api } = app();
    await api.inject({
      method: 'POST',
      url: '/v1/sdk/form-responses',
      headers: { authorization: `Bearer ${TOKEN}`, origin: 'https://app.customer.example' },
      payload: {
        documentId: document.id,
        responses: [
          { ...answers[0]!, correlationId: 'visitor_a' },
          { ...answers[0]!, answer: 'easy', correlationId: 'visitor_b' },
          { ...answers[0]!, answer: 'hard', correlationId: 'visitor_c' },
        ],
      },
    });
    const analytics = await api.inject({
      method: 'GET',
      url: `/v1/documents/${document.id}/analytics?environmentId=env_staging`,
      headers: owner,
    });
    const [summary] = analytics.json<{
      formResponses: Array<{ blockId: string; label: string; answerCount: number; topAnswer: string }>;
    }>().formResponses;
    expect(summary).toEqual({
      blockId: 'blk_csat',
      label: 'How hard was that?',
      answerCount: 3,
      topAnswer: 'easy',
    });
    expect(JSON.stringify(summary)).not.toContain('visitor_');
    await api.close();
  });

  it('refuses an unauthenticated page', async () => {
    const { api } = app();
    const response = await api.inject({
      method: 'POST',
      url: '/v1/sdk/form-responses',
      payload: { documentId: document.id, responses: answers },
    });
    expect(response.statusCode).toBe(401);
    await api.close();
  });

  it('refuses an origin the environment does not allow', async () => {
    const { api } = app();
    const response = await api.inject({
      method: 'POST',
      url: '/v1/sdk/form-responses',
      headers: { authorization: `Bearer ${TOKEN}`, origin: 'https://evil.example' },
      payload: { documentId: document.id, responses: answers },
    });
    expect(response.statusCode).toBe(403);
    await api.close();
  });

  it('refuses a document that is not in this workspace', async () => {
    const { api } = app();
    const response = await api.inject({
      method: 'POST',
      url: '/v1/sdk/form-responses',
      headers: { authorization: `Bearer ${TOKEN}`, origin: 'https://app.customer.example' },
      payload: { documentId: 'doc_elsewhere', responses: answers },
    });
    expect(response.statusCode).toBe(404);
    await api.close();
  });

  it('refuses a document with no active deployment in the credential’s environment', async () => {
    const { api } = app();
    // The document exists and the credential is valid; only the deployment is
    // missing. An installation id is public page source, so this is the whole
    // difference between a real page and anyone with curl.
    const response = await api.inject({
      method: 'POST',
      url: '/v1/sdk/form-responses',
      headers: { authorization: `Bearer ${OTHER_TOKEN}`, origin: 'https://app.customer.example' },
      payload: { documentId: document.id, responses: answers },
    });
    expect(response.statusCode, response.body).toBe(404);
    expect(response.json()).toMatchObject({ error: 'artifact_not_found' });
    await api.close();
  });

  it('refuses a field the deployed artifact does not contain', async () => {
    const { api } = app();
    const response = await api.inject({
      method: 'POST',
      url: '/v1/sdk/form-responses',
      headers: { authorization: `Bearer ${TOKEN}`, origin: 'https://app.customer.example' },
      payload: {
        documentId: document.id,
        responses: [{ ...answers[0]!, blockId: 'blk_invented' }],
      },
    });
    expect(response.statusCode, response.body).toBe(422);
    expect(response.json()).toMatchObject({ error: 'unknown_form_field' });
    await api.close();
  });

  it('refuses a step the deployed artifact does not contain', async () => {
    const { api } = app();
    const response = await api.inject({
      method: 'POST',
      url: '/v1/sdk/form-responses',
      headers: { authorization: `Bearer ${TOKEN}`, origin: 'https://app.customer.example' },
      payload: {
        documentId: document.id,
        responses: [{ ...answers[0]!, stepId: 'block_step_9' }],
      },
    });
    expect(response.statusCode, response.body).toBe(422);
    expect(response.json()).toMatchObject({ error: 'unknown_form_field' });
    await api.close();
  });

  it('rejects an empty answer, so silence is never recorded as a response', async () => {
    const { api } = app();
    const response = await api.inject({
      method: 'POST',
      url: '/v1/sdk/form-responses',
      headers: { authorization: `Bearer ${TOKEN}`, origin: 'https://app.customer.example' },
      payload: {
        documentId: document.id,
        responses: [{ ...answers[0]!, answer: '' }],
      },
    });
    expect(response.statusCode).toBe(400);
    await api.close();
  });
});
