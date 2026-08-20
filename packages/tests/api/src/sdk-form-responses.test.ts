import { describe, expect, it } from 'vitest';
import { createApiApp } from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  getEnvironmentTokenPrefix,
  hashEnvironmentToken,
  type ControlPlaneRepository,
} from '@lodariq/database';
import type { LodariqDocument } from '@lodariq/schema';
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

const answers = [
  {
    stepId: 'step_1',
    blockId: 'blk_csat',
    label: 'How hard was that?',
    answer: 'easy',
    occurredAt: '2026-08-09T10:00:00.000Z',
  },
];

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

function repository(): ControlPlaneRepository {
  return createInMemoryControlPlaneRepository({
    users: [
      { id: 'user_owner', legacyIdentityId: null, email: 'o@lodariq.test', name: 'Ada', createdAt: AT },
    ],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: 'user_owner', role: 'owner', createdAt: AT },
    ],
    environments: [environment('env_staging', 'staging'), environment('env_production', 'production')],
    environmentTokens: [
      token('tok_staging', 'env_staging', TOKEN, 'staging'),
      token('tok_production', 'env_production', OTHER_TOKEN, 'production'),
    ],
    documents: [document],
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
