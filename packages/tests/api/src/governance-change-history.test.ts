import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp, createHeaderAuthProvider, governanceChangeHistoryCsv } from '@lodariq/api';
import { createInMemoryControlPlaneRepository } from '@lodariq/database';
import {
  COMMERCIAL_PLAN_VERSION,
  type CommercialPlanId,
  type LodariqDocument,
} from '@lodariq/schema';
import type { GovernanceChangeEvent } from '@lodariq/schema/governance-change-history';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const WORKSPACE_ID = 'wk_change_history';
const FOREIGN_WORKSPACE_ID = 'wk_change_history_foreign';
const USER_ID = 'usr_change_history_owner';
const DOCUMENT_ID = 'doc_change_history';
const NOW = '2026-08-22T16:00:00.000Z';
const authHeaders = {
  'x-lodariq-workspace-id': WORKSPACE_ID,
  'x-lodariq-user-id': USER_ID,
  'x-lodariq-role': 'owner',
};

describe('governance change history export', () => {
  const apps: ReturnType<typeof createApiApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('exports unified, filtered, tenant-scoped history from version-first routes', async () => {
    const app = createApiApp({
      repository: repositoryFixture('business'),
      authProvider: createHeaderAuthProvider(),
    });
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/governance/change-history',
      headers: authHeaders,
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json<{ events: GovernanceChangeEvent[] }>();
    expect(body.events.map((event) => event.action)).toEqual([
      'governance.membership_role_changed',
      'release.publish.completed',
      'document.version_saved',
    ]);
    expect(body.events.every((event) => !event.id.includes('foreign'))).toBe(true);
    expect(body.events.find((event) => event.category === 'release')?.details).toMatchObject({
      expectedGeneration: 1,
      resultGeneration: 2,
    });

    const filtered = await app.inject({
      method: 'GET',
      url: `/v1/governance/change-history?category=document&documentId=${DOCUMENT_ID}`,
      headers: authHeaders,
    });
    expect(filtered.statusCode, filtered.body).toBe(200);
    expect(filtered.json()).toMatchObject({
      events: [{ category: 'document', documentId: DOCUMENT_ID, action: 'document.version_saved' }],
    });

    const csv = await app.inject({
      method: 'GET',
      url: '/v1/governance/change-history.csv?category=release',
      headers: authHeaders,
    });
    expect(csv.statusCode, csv.body).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('lodariq-change-history.csv');
    expect(csv.body).toContain('release.publish.completed');
    expect(csv.body).not.toContain('document.version_saved');

    const unversioned = await app.inject({
      method: 'GET',
      url: '/governance/change-history',
      headers: authHeaders,
    });
    expect(unversioned.statusCode).toBe(404);
  });

  it('requires the commercial export entitlement and protects spreadsheet cells', async () => {
    const app = createApiApp({
      repository: repositoryFixture('starter'),
      authProvider: createHeaderAuthProvider(),
    });
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/governance/change-history',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'commercial_entitlement_exceeded' });

    const csv = governanceChangeHistoryCsv([
      {
        schemaVersion: '2026-08-22.1',
        id: 'change:test:formula',
        category: 'governance',
        action: 'governance.exported',
        actorUserId: USER_ID,
        documentId: null,
        environmentId: null,
        resourceId: '=HYPERLINK("https://invalid.example")',
        occurredAt: NOW,
        details: {},
      },
    ]);
    expect(csv).toContain("'=HYPERLINK");
  });
});

function repositoryFixture(planId: CommercialPlanId) {
  const document = structuredClone(tourFixture) as LodariqDocument;
  document.id = DOCUMENT_ID;
  document.workspaceId = WORKSPACE_ID;
  const foreignDocument = structuredClone(document);
  foreignDocument.id = 'doc_foreign';
  foreignDocument.workspaceId = FOREIGN_WORKSPACE_ID;

  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: USER_ID,
        legacyIdentityId: null,
        email: 'change-history-owner@example.com',
        name: 'Change History Owner',
        emailVerifiedAt: NOW,
        createdAt: NOW,
      },
    ],
    workspaces: [
      { id: WORKSPACE_ID, name: 'Change History', createdAt: NOW, updatedAt: NOW },
      { id: FOREIGN_WORKSPACE_ID, name: 'Foreign', createdAt: NOW, updatedAt: NOW },
    ],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'owner', createdAt: NOW },
    ],
    workspaceSubscriptions: [subscription(WORKSPACE_ID, planId)],
    documentVersions: [
      {
        id: 'docv_change_history',
        workspaceId: WORKSPACE_ID,
        documentId: DOCUMENT_ID,
        version: 3,
        canonical: document,
        createdByUserId: USER_ID,
        createdAt: '2026-08-22T15:00:00.000Z',
      },
      {
        id: 'docv_foreign',
        workspaceId: FOREIGN_WORKSPACE_ID,
        documentId: foreignDocument.id,
        version: 1,
        canonical: foreignDocument,
        createdByUserId: null,
        createdAt: '2026-08-22T15:30:00.000Z',
      },
    ],
    releaseOperations: [
      {
        id: 'relop_change_history',
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_production',
        documentId: DOCUMENT_ID,
        action: 'publish',
        requestedArtifactId: 'artifact_change_history',
        requestedSourcePublicationId: null,
        requestedActivePublicationId: null,
        actualActivePublicationId: null,
        sourcePublicationId: null,
        expectedGeneration: 1,
        resultGeneration: 2,
        idempotencyKey: 'change-history:publish',
        requestHash: 'sha256-request',
        status: 'completed',
        correlationId: 'correlation_change_history',
        requestedByUserId: USER_ID,
        resultPublicationId: null,
        reason: null,
        errorCode: null,
        createdAt: '2026-08-22T15:10:00.000Z',
        completedAt: '2026-08-22T15:20:00.000Z',
      },
    ],
    tenantAuditEvents: [
      {
        id: 'tenevt_change_history',
        workspaceId: WORKSPACE_ID,
        actorUserId: USER_ID,
        eventType: 'membership_role_changed',
        targetUserId: 'usr_changed_member',
        invitationId: null,
        previousRole: 'viewer',
        nextRole: 'member',
        occurredAt: '2026-08-22T15:30:00.000Z',
      },
      {
        id: 'tenevt_foreign',
        workspaceId: FOREIGN_WORKSPACE_ID,
        actorUserId: 'usr_foreign',
        eventType: 'membership_role_changed',
        targetUserId: USER_ID,
        invitationId: null,
        previousRole: 'viewer',
        nextRole: 'member',
        occurredAt: '2026-08-22T15:40:00.000Z',
      },
    ],
  });
}

function subscription(workspaceId: string, planId: CommercialPlanId) {
  return {
    workspaceId,
    planId,
    planVersion: COMMERCIAL_PLAN_VERSION,
    status: 'active' as const,
    entitlementOverrides: {},
    currentPeriodStart: '2026-08-01T00:00:00.000Z',
    currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
