import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createInMemoryControlPlaneRepository } from '@lodariq/database';
import { COMMERCIAL_PLAN_VERSION } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import {
  analyticsExportGenerationMode,
  createAnalyticsExportWorker,
} from '../../../../apps/api/src/index';

/**
 * The production path, which nothing else covers.
 *
 * `generateInWorker` defaults to `NODE_ENV === 'production'`, so every other
 * test of this worker exercises the synchronous branch. That matters more than
 * it sounds: `runOnce` awaits each job and only re-arms its timer in a
 * `finally`, so a generation promise that never settles does not fail one
 * export — it stops the process from ever running another one, silently, until
 * restart. These are the two ways that used to happen.
 */
const WORKSPACE_ID = 'wk_export_worker';
const AT = '2026-08-23T00:00:00.000Z';

describe('analytics export generation worker boundary', () => {
  it('recovers when the worker exits without answering', async () => {
    // Exits cleanly and says nothing. The old code only rejected on a non-zero
    // exit code, so this hung for good.
    const { repository, jobId } = await queuedJob();
    const worker = createAnalyticsExportWorker({
      repository,
      workerId: 'export_worker_silent',
      clock: () => new Date(AT),
      generateInWorker: true,
      generationWorkerUrl: workerScript('process.exit(0);'),
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    // Attempted and returned to the queue with its attempt spent — a retryable
    // failure, which is the point: the tick resolved instead of wedging.
    const job = await repository.getAnalyticsExportJob(WORKSPACE_ID, jobId);
    expect(job).toMatchObject({ status: 'queued', attemptCount: 1 });
  });

  it('recovers when generation never finishes', async () => {
    const { repository, jobId } = await queuedJob();
    const worker = createAnalyticsExportWorker({
      repository,
      workerId: 'export_worker_wedged',
      clock: () => new Date(AT),
      generateInWorker: true,
      // Receives the payload and never answers, which is what a pathological
      // input does to CPU-bound formatting.
      generationWorkerUrl: workerScript(
        "require('node:worker_threads').parentPort.on('message', () => {});",
      ),
      generationTimeoutMs: 250,
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    const job = await repository.getAnalyticsExportJob(WORKSPACE_ID, jobId);
    expect(job).toMatchObject({ status: 'queued', attemptCount: 1 });
  });

  it('completes the job when the worker answers', async () => {
    const { repository, jobId } = await queuedJob();
    const worker = createAnalyticsExportWorker({
      repository,
      workerId: 'export_worker_ok',
      clock: () => new Date(AT),
      generateInWorker: true,
      generationWorkerUrl: workerScript(`
        const { parentPort } = require('node:worker_threads');
        const { createHash } = require('node:crypto');
        parentPort.on('message', () => {
          const content = 'generated-by-the-worker-thread';
          const bytes = Buffer.from(content, 'utf8');
          parentPort.postMessage({
            ok: true,
            result: {
              filename: 'lodariq-export.jsonl',
              contentType: 'application/x-ndjson; charset=utf-8',
              content,
              byteLength: bytes.length,
              contentHash: 'sha256-' + createHash('sha256').update(bytes).digest('hex'),
            },
          });
        });
      `),
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    const job = await repository.getAnalyticsExportJob(WORKSPACE_ID, jobId);
    expect(job?.status).toBe('completed');
    expect(job?.filename).toBe('lodariq-export.jsonl');
  });
});

/** A CommonJS worker on disk, so no build artifact is needed to spawn one. */
function workerScript(body: string): URL {
  const file = join(mkdtempSync(join(tmpdir(), 'lodariq-export-worker-')), 'worker.cjs');
  writeFileSync(file, body, 'utf8');
  return pathToFileURL(file);
}

async function queuedJob() {
  const repository = createInMemoryControlPlaneRepository({
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: 'usr_owner', role: 'owner', createdAt: AT },
    ],
    environments: [
      {
        id: 'env_production',
        workspaceId: WORKSPACE_ID,
        kind: 'production' as const,
        name: 'Production',
        originAllowlist: [],
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    documents: [
      {
        ...(structuredClone(tourFixture) as Record<string, unknown>),
        id: 'doc_worker_boundary',
        workspaceId: WORKSPACE_ID,
      },
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
  } as never);
  const job = await repository.createAnalyticsExportJob({
    workspaceId: WORKSPACE_ID,
    environmentId: 'env_production',
    documentId: 'doc_worker_boundary',
    operationId: `anxop_${'w'.repeat(24)}`,
    requestHash: `sha256-${'a'.repeat(64)}`,
    kind: 'raw-events-jsonl',
    actorUserId: 'usr_owner',
    requestedAt: AT,
  });
  return { repository, jobId: job.id };
}

/**
 * Which path a deployment takes, and why it is not `NODE_ENV`.
 *
 * Every Lodariq tier sets `NODE_ENV=production` — `fly.development.toml`,
 * `fly.staging.toml` and `fly.toml` alike, and `check-runtime-env.mjs` refuses
 * to start without it. So keying the switch on it named "deployed" while
 * reading as "the production tier", and left local runs and CI on a path no
 * deployment takes.
 */
describe('analytics export generation mode', () => {
  it('does not consult NODE_ENV at all', () => {
    // The old switch read `NODE_ENV === 'production'`, which every tier sets.
    const fromSource = analyticsExportGenerationMode({});
    expect(analyticsExportGenerationMode({ NODE_ENV: 'production' })).toBe(fromSource);
    expect(analyticsExportGenerationMode({ NODE_ENV: 'development' })).toBe(fromSource);
    expect(analyticsExportGenerationMode({ NODE_ENV: 'test' })).toBe(fromSource);
  });

  it('follows the entrypoint on disk, not this file\u2019s extension', () => {
    /*
     * The question is "can I spawn the worker", and only the artifact answers
     * it. An extension check answers "was I bundled", which is the same thing
     * only while the tsup entry keeps its name — and nothing enforces that: the
     * response type is imported `import type`, so it erases, and dropping the
     * entry builds, typechecks and deploys green while every export job fails.
     */
    const present = workerScript('parentPort.postMessage({});');
    const absent = new URL('./no-such-generation-worker.js', present);

    expect(analyticsExportGenerationMode({}, present)).toBe('worker');
    expect(analyticsExportGenerationMode({}, absent)).toBe('inline');
    // Same file, opposite answers — so the extension is not what decided it.
    expect(present.pathname.endsWith('.cjs')).toBe(true);
    expect(absent.pathname.endsWith('.js')).toBe(true);
  });

  it('defaults to inline from source, where no built entrypoint exists', () => {
    expect(analyticsExportGenerationMode({})).toBe('inline');
  });

  it('honours an operator override in both directions', () => {
    expect(
      analyticsExportGenerationMode({
        NODE_ENV: 'production',
        LODARIQ_ANALYTICS_EXPORT_GENERATION: 'inline',
      }),
    ).toBe('inline');
    expect(
      analyticsExportGenerationMode({ LODARIQ_ANALYTICS_EXPORT_GENERATION: 'worker' }),
    ).toBe('worker');
  });

  it('ignores a value it does not recognise rather than guessing', () => {
    expect(
      analyticsExportGenerationMode({ LODARIQ_ANALYTICS_EXPORT_GENERATION: 'threads-please' }),
    ).toBe(analyticsExportGenerationMode({}));
  });
});
