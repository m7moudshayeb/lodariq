import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  AnalyticsExportGenerationError,
  type ControlPlaneRepository,
  type PersistedAnalyticsExportJob,
} from '@lodariq/database';
import {
  buildAnalyticsExport,
  type AnalyticsExportGenerationInput,
} from './analytics-export-generation';
import type { AnalyticsExportGenerationWorkerResponse } from './analytics-export-generation-worker';

export interface AnalyticsExportWorker {
  start(): void;
  runOnce(): Promise<number>;
  stop(): Promise<void>;
}

export interface AnalyticsExportWorkerOptions {
  repository: ControlPlaneRepository;
  clock?: () => Date;
  intervalMs?: number;
  workerId?: string;
  batchSize?: number;
  /**
   * Whether formatting runs in a worker thread. Defaults to whether the
   * entrypoint below is actually on disk — see `analyticsExportGenerationMode`.
   */
  generateInWorker?: boolean;
  /**
   * The bundled generation entrypoint. Overridable so the worker path itself can
   * be tested — the default resolves a sibling of the built bundle, which does
   * not exist when the suite runs from source.
   */
  generationWorkerUrl?: URL;
  /** Overridable so the timeout path is testable without waiting a minute. */
  generationTimeoutMs?: number;
}

/**
 * The bundled sibling `tsup.config.ts` emits. Nothing but a matching string in
 * that config keeps it alive: the response type is imported `import type` and
 * erases at compile time, so dropping the entry still builds, typechecks and
 * deploys green.
 */
const GENERATION_WORKER_URL = new URL(
  './analytics-export-generation-worker.js',
  import.meta.url,
);

/**
 * Which generation path this process takes.
 *
 * Not keyed on `NODE_ENV`: every Lodariq tier sets it to `production` —
 * development and staging included — so it names "deployed", not "the
 * production tier", and reads as the opposite of what it does. Keying on it
 * also meant local runs and CI took a path no deployment takes, which is how
 * two ways of permanently stalling this worker survived review.
 *
 * Nor on this file's own extension. That answers "was I bundled", and the
 * question is "can I spawn the worker" — which is only the same thing while the
 * entry stays in the build config under the name used here. A missing artifact
 * would fail every export job instead of falling back, so ask about the
 * artifact.
 */
export function analyticsExportGenerationMode(
  env: NodeJS.ProcessEnv = process.env,
  workerUrl: URL = GENERATION_WORKER_URL,
): 'worker' | 'inline' {
  const configured = env['LODARIQ_ANALYTICS_EXPORT_GENERATION']?.trim();
  // An operator override is honoured either way; forcing a worker that is not
  // there is a choice this cannot improve on by overruling it.
  if (configured === 'inline' || configured === 'worker') return configured;
  return generationWorkerExists(workerUrl) ? 'worker' : 'inline';
}

function generationWorkerExists(workerUrl: URL): boolean {
  try {
    return workerUrl.protocol === 'file:' && existsSync(fileURLToPath(workerUrl));
  } catch {
    return false;
  }
}

export function createAnalyticsExportWorker(
  options: AnalyticsExportWorkerOptions,
): AnalyticsExportWorker {
  const intervalMs = Math.max(250, options.intervalMs ?? 5_000);
  const workerId = options.workerId ?? `analytics_export_${randomUUID()}`;
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 2, 10));
  // Decided about the entrypoint this will actually spawn, not the default one.
  const generationWorkerUrl = options.generationWorkerUrl ?? GENERATION_WORKER_URL;
  const generateInWorker =
    options.generateInWorker ??
    analyticsExportGenerationMode(process.env, generationWorkerUrl) === 'worker';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  let active: Promise<number> | null = null;

  const runOnce = async (): Promise<number> => {
    const now = (options.clock?.() ?? new Date()).toISOString();
    await maintainPartitions(options, now);
    const jobs = await options.repository.claimAnalyticsExportJobs({
      workerId,
      now,
      limit: batchSize,
    });
    for (const job of jobs) {
      await processJob(options.repository, job, workerId, options.clock, {
        generateInWorker,
        workerUrl: generationWorkerUrl,
        ...(options.generationTimeoutMs === undefined
          ? {}
          : { timeoutMs: options.generationTimeoutMs }),
      });
    }
    return jobs.length;
  };
  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(run, intervalMs);
    timer.unref?.();
  };
  const run = (): void => {
    if (stopped || active) return;
    active = runOnce()
      .catch(() => 0)
      .finally(() => {
        active = null;
        schedule();
      });
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      run();
    },
    runOnce,
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await active;
    },
  };
}

async function processJob(
  repository: ControlPlaneRepository,
  job: PersistedAnalyticsExportJob,
  workerId: string,
  clock?: () => Date,
  generation: { generateInWorker: boolean; workerUrl: URL; timeoutMs?: number } = {
    generateInWorker: false,
    workerUrl: GENERATION_WORKER_URL,
  },
): Promise<void> {
  try {
    const source = await readExportSource(repository, job);
    const result = generation.generateInWorker
      ? await generateExportInWorker({ job, source }, generation.workerUrl, generation.timeoutMs)
      : buildAnalyticsExport({ job, source });
    const completedAt = (clock?.() ?? new Date()).toISOString();
    await repository.completeAnalyticsExportJob({
      workspaceId: job.workspaceId,
      jobId: job.id,
      workerId,
      filename: result.filename,
      contentType: result.contentType,
      contentBase64: Buffer.from(result.content, 'utf8').toString('base64'),
      byteLength: result.byteLength,
      contentHash: result.contentHash,
      completedAt,
    });
  } catch (error) {
    const errorCode =
      error instanceof AnalyticsExportGenerationError ? error.code : 'generation_failed';
    await repository.failAnalyticsExportJob({
      workspaceId: job.workspaceId,
      jobId: job.id,
      workerId,
      errorCode,
      failedAt: (clock?.() ?? new Date()).toISOString(),
    });
  }
}

async function readExportSource(
  repository: ControlPlaneRepository,
  job: PersistedAnalyticsExportJob,
): Promise<AnalyticsExportGenerationInput['source']> {
  if (job.kind === 'raw-events-jsonl') {
    const events = await repository.readAnalyticsExportEvents({
      workspaceId: job.workspaceId,
      environmentId: job.environmentId,
      documentId: job.documentId,
      retentionCutoff: job.retentionCutoff,
      requestedAt: job.createdAt,
      ...(job.release ? { release: job.release } : {}),
    });
    return { kind: 'raw-events-jsonl', events };
  }
  const document = await repository.getDocument(job.workspaceId, job.documentId);
  if (!document) throw new AnalyticsExportGenerationError('source_unavailable');
  const analytics = await repository.readExperienceAnalytics({
    workspaceId: job.workspaceId,
    environmentId: job.environmentId,
    documentId: job.documentId,
    stepIdsInOrder: document.document.blocks
      .filter((block) => block.type === 'tourStep')
      .map((block) => block.id),
    asOf: job.createdAt,
  });
  return { kind: 'summary-csv', analytics };
}

/**
 * Comfortably inside `ANALYTICS_EXPORT_LEASE_MS`, so a wedged generation is
 * abandoned while this worker still owns the job rather than after another pod
 * has already claimed it.
 */
const GENERATION_TIMEOUT_MS = 60_000;

/**
 * Every terminal path settles this promise, which is the whole contract.
 *
 * `runOnce` awaits each job and only re-arms its timer in a `finally`, so a
 * promise that never settles does not fail one export — it stops this process
 * from ever running another one, silently and until restart. Two paths used to
 * do exactly that: a worker exiting cleanly without posting a message, and a
 * generation that never finishes at all, which is the CPU-heavy work this
 * boundary exists to contain.
 */
function generateExportInWorker(
  input: AnalyticsExportGenerationInput,
  workerUrl: URL,
  timeoutMs = GENERATION_TIMEOUT_MS,
) {
  return new Promise<ReturnType<typeof buildAnalyticsExport>>((resolve, reject) => {
    const worker = new Worker(workerUrl);
    let settled = false;
    const settle = (outcome: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate().catch(() => undefined);
      outcome();
    };
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(new Error('Analytics export generation worker exceeded its time budget')),
        ),
      timeoutMs,
    );
    timer.unref?.();
    worker.once('message', (message: AnalyticsExportGenerationWorkerResponse) => {
      settle(() => {
        if (message.ok) resolve(message.result);
        else reject(new AnalyticsExportGenerationError(message.errorCode));
      });
    });
    worker.once('error', (error) => settle(() => reject(error)));
    // Including a clean exit: a worker that ends without answering has failed.
    worker.once('exit', (code) =>
      settle(() =>
        reject(new Error(`Analytics export generation worker exited with code ${code}`)),
      ),
    );
    try {
      worker.postMessage(input);
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

/**
 * H12 retention, on this worker's own tick.
 *
 * Same reasoning as the webhook delivery sweep: a separate process for one
 * maintenance call is more moving parts than the problem deserves, and this
 * worker already owns the analytics lifecycle. It is a no-op until `0041`
 * partitions the table.
 */
async function maintainPartitions(
  options: AnalyticsExportWorkerOptions,
  now: string,
): Promise<void> {
  try {
    await options.repository.maintainAnalyticsEventPartitions({ now });
  } catch {
    /* Retention must never stop exports; the next tick tries again. */
  }
}
