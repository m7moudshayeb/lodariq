import { describe, expect, it } from 'vitest';
import {
  createInMemoryControlPlaneRepository,
  runWithAuthOutboxWorkerScope,
  sanitizeAuthEmailFailureCode,
  type AuthOutboxRecord,
  type SetPasswordOutboxRecord,
  type WorkspaceInvitationOutboxRecord,
} from '@lodariq/database';

const NOW = '2026-08-07T12:00:00.000Z';

describe('@lodariq/database unified auth-email outbox', () => {
  it('fairly leases a bounded due batch across both purposes and rejects stale ack', async () => {
    const verification = verificationOutbox('verify-a', '2026-08-07T11:00:00.000Z');
    const laterVerification = verificationOutbox('verify-b', '2026-08-07T11:30:00.000Z');
    const reset = setPasswordOutbox('reset-a', '2026-08-07T10:00:00.000Z');
    const repository = createInMemoryControlPlaneRepository({
      authOutbox: [verification, laterVerification],
      setPasswordOutbox: [reset],
    });

    const claimed = await repository.claimDue({
      now: NOW,
      limit: 2,
      leaseDurationMs: 60_000,
    });
    expect(claimed).toEqual([
      {
        id: reset.id,
        recipientEmail: reset.recipientEmail,
        purpose: 'set_password',
        challengeId: reset.payload.challengeId,
        keyId: 'legacy',
        attempt: 1,
        leaseVersion: 1,
        createdAt: reset.createdAt,
      },
      {
        id: verification.id,
        recipientEmail: verification.recipientEmail,
        purpose: 'email_verification',
        challengeId: verification.payload.challengeId,
        keyId: 'legacy',
        attempt: 1,
        leaseVersion: 1,
        createdAt: verification.createdAt,
      },
    ]);
    await expect(
      repository.claimDue({ now: NOW, limit: 2, leaseDurationMs: 60_000 }),
    ).resolves.toEqual([
      expect.objectContaining({ id: laterVerification.id, purpose: 'email_verification' }),
    ]);

    await expect(
      repository.acknowledge({
        id: reset.id,
        purpose: 'email_verification',
        leaseVersion: 1,
        processedAt: '2026-08-07T12:00:30.000Z',
      }),
    ).resolves.toBe(false);
    await expect(
      repository.acknowledge({
        id: reset.id,
        purpose: 'set_password',
        leaseVersion: 1,
        processedAt: '2026-08-07T12:00:30.000Z',
      }),
    ).resolves.toBe(true);
    await expect(
      repository.acknowledge({
        id: reset.id,
        purpose: 'set_password',
        leaseVersion: 1,
        processedAt: '2026-08-07T12:00:31.000Z',
      }),
    ).resolves.toBe(false);
  });

  it('invalidates a lease on retry and permanently excludes terminal rows', async () => {
    const row = verificationOutbox('retry-a', '2026-08-07T11:00:00.000Z');
    const repository = createInMemoryControlPlaneRepository({ authOutbox: [row] });
    const [firstLease] = await repository.claimDue({
      now: NOW,
      limit: 1,
      leaseDurationMs: 60_000,
    });
    expect(firstLease).toBeDefined();
    if (!firstLease) throw new Error('Expected first auth-email lease');

    await expect(
      repository.retry({
        id: row.id,
        purpose: 'email_verification',
        leaseVersion: firstLease.leaseVersion,
        failureCode: ' SMTP 5.0 / temporary\nsecret ',
        availableAt: '2026-08-07T12:05:00.000Z',
        terminal: false,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.acknowledge({
        id: row.id,
        purpose: 'email_verification',
        leaseVersion: firstLease.leaseVersion,
        processedAt: '2026-08-07T12:00:30.000Z',
      }),
    ).resolves.toBe(false);
    await expect(
      repository.claimDue({
        now: '2026-08-07T12:04:59.000Z',
        limit: 1,
        leaseDurationMs: 60_000,
      }),
    ).resolves.toEqual([]);

    const [secondLease] = await repository.claimDue({
      now: '2026-08-07T12:05:00.000Z',
      limit: 1,
      leaseDurationMs: 60_000,
    });
    expect(secondLease).toMatchObject({ attempt: 2, leaseVersion: 3 });
    if (!secondLease) throw new Error('Expected second auth-email lease');
    await expect(
      repository.retry({
        id: row.id,
        purpose: 'email_verification',
        leaseVersion: secondLease.leaseVersion,
        failureCode: 'permanent-provider-rejection',
        availableAt: null,
        terminal: true,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.claimDue({
        now: '2026-08-08T12:00:00.000Z',
        limit: 1,
        leaseDurationMs: 60_000,
      }),
    ).resolves.toEqual([]);
  });

  it('caps batches and sanitizes persisted failure codes', async () => {
    const rows = Array.from({ length: 30 }, (_, index) =>
      verificationOutbox(`bounded-${index}`, '2026-08-07T11:00:00.000Z'),
    );
    const repository = createInMemoryControlPlaneRepository({ authOutbox: rows });
    await expect(
      repository.claimDue({ now: NOW, limit: 1_000, leaseDurationMs: 60_000 }),
    ).resolves.toHaveLength(25);
    const sanitized = sanitizeAuthEmailFailureCode(` -- Provider secret / ${'X'.repeat(200)}  `);
    expect(sanitized).toMatch(/^[a-z0-9][a-z0-9_-]{0,63}$/u);
    expect(sanitized).toHaveLength(64);
  });

  it('leases and acknowledges workspace invitation delivery with the unified queue', async () => {
    const invitation = workspaceInvitationOutbox('invite-a', '2026-08-07T11:00:00.000Z');
    const repository = createInMemoryControlPlaneRepository({
      workspaceInvitationOutbox: [invitation],
    });
    const [claimed] = await repository.claimDue({
      now: NOW,
      limit: 1,
      leaseDurationMs: 60_000,
    });
    expect(claimed).toMatchObject({
      id: invitation.id,
      purpose: 'workspace_invitation',
      challengeId: invitation.invitationId,
      leaseVersion: 1,
    });
    await expect(
      repository.acknowledge({
        id: invitation.id,
        purpose: 'workspace_invitation',
        leaseVersion: 1,
        processedAt: '2026-08-07T12:00:30.000Z',
      }),
    ).resolves.toBe(true);
  });

  it('sets the exact transaction-local worker scope before queue access', async () => {
    const calls: string[] = [];
    const result = await runWithAuthOutboxWorkerScope(
      {
        async transaction(operation) {
          calls.push('transaction:start');
          const value = await operation({
            async execute() {
              calls.push('worker-scope:set');
            },
          });
          calls.push('transaction:end');
          return value;
        },
      },
      async () => {
        calls.push('queue-operation');
        return 'claimed';
      },
    );
    expect(result).toBe('claimed');
    expect(calls).toEqual([
      'transaction:start',
      'worker-scope:set',
      'queue-operation',
      'transaction:end',
    ]);
  });
});

function verificationOutbox(suffix: string, availableAt: string): AuthOutboxRecord {
  const idSuffix = suffix.replace(/[^A-Za-z0-9_-]/gu, '_').padEnd(24, 'x');
  return {
    id: `outbox_${idSuffix}`,
    type: 'email_verification',
    userId: `usr_${idSuffix}`,
    recipientEmail: 'creator@example.com',
    payload: {
      challengeId: `verify_${idSuffix}`,
      verificationPath: `/verify-email?challenge=verify_${idSuffix}`,
      keyId: 'legacy',
    },
    availableAt,
    processedAt: null,
    attempts: 0,
    leaseVersion: 0,
    lastError: null,
    terminalAt: null,
    createdAt: availableAt,
  };
}

function setPasswordOutbox(suffix: string, availableAt: string): SetPasswordOutboxRecord {
  const idSuffix = suffix.replace(/[^A-Za-z0-9_-]/gu, '_').padEnd(24, 'x');
  const challengeId = `reset_${idSuffix}`;
  return {
    id: `outbox_${idSuffix}`,
    type: 'set_password',
    userId: `usr_${idSuffix}`,
    recipientEmail: 'creator@example.com',
    payload: {
      purpose: 'set_password',
      challengeId,
      resetPath: `/reset-password?challenge=${challengeId}`,
      keyId: 'legacy',
    },
    availableAt,
    processedAt: null,
    attempts: 0,
    leaseVersion: 0,
    lastError: null,
    terminalAt: null,
    createdAt: availableAt,
  };
}

function workspaceInvitationOutbox(
  suffix: string,
  availableAt: string,
): WorkspaceInvitationOutboxRecord {
  const idSuffix = suffix.replace(/[^A-Za-z0-9_-]/gu, '_').padEnd(24, 'x');
  const invitationId = `invite_${idSuffix}`;
  return {
    id: `outbox_${idSuffix}`,
    type: 'workspace_invitation',
    workspaceId: `wk_${idSuffix}`,
    invitationId,
    recipientEmail: 'invitee@example.com',
    payload: {
      purpose: 'workspace_invitation',
      invitationId,
      acceptancePath: '/accept-invitation',
      keyId: 'legacy',
    },
    availableAt,
    processedAt: null,
    attempts: 0,
    leaseVersion: 0,
    lastError: null,
    terminalAt: null,
    createdAt: availableAt,
  };
}
