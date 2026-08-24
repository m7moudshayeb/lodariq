import { createSign } from 'node:crypto';
import type { AnalyticsWarehouseDeliveryBatch, WarehouseAnalyticsEvent } from '@lodariq/database';
import type { AnalyticsWarehouseDestination } from '@lodariq/schema/analytics-warehouse';
import type {
  AnalyticsWarehouseDeliveryResult,
  AnalyticsWarehouseProvider,
} from './analytics-warehouse';

const BIGQUERY_PROVIDER_ID = 'bigquery';
const BIGQUERY_API_BASE_URL = 'https://bigquery.googleapis.com/bigquery/v2';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BIGQUERY_SCOPE = 'https://www.googleapis.com/auth/bigquery.insertdata';
const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_TTL_SECONDS = 3_600;
/** Refresh early so a token cannot expire between signing and the insert landing. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1_000;

/** BigQuery caps `insertAll` payloads; stay well inside the documented request limit. */
const MAX_ROWS_PER_INSERT = 500;

export interface BigQueryServiceAccount {
  clientEmail: string;
  privateKey: string;
  projectId: string;
}

export interface BigQueryTableTarget {
  projectId: string;
  datasetId: string;
  tableId: string;
}

export interface BigQueryWarehouseProviderOptions {
  serviceAccount: BigQueryServiceAccount;
  /**
   * Destination `credentialReference` to the table it may write.
   *
   * A reference, never a credential: the destination row holds only the lookup
   * key, so a workspace cannot name a table it was not granted.
   */
  tables: Readonly<Record<string, BigQueryTableTarget>>;
  fetchImplementation?: typeof fetch;
  clock?: () => Date;
}

/**
 * Builds every configured warehouse provider (ADR 0031).
 *
 * Returns an empty list when nothing is configured, which leaves warehouse
 * destinations answering 503 rather than accepting rows nothing will deliver.
 */
export function createAnalyticsWarehouseProvidersFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): AnalyticsWarehouseProvider[] {
  const bigQuery = createBigQueryWarehouseProviderFromEnvironment(environment, fetchImplementation);
  return bigQuery ? [bigQuery] : [];
}

export function createBigQueryWarehouseProviderFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): AnalyticsWarehouseProvider | undefined {
  const serviceAccount = readServiceAccount(environment);
  const tables = readTableTargets(environment);
  if (!serviceAccount || Object.keys(tables).length === 0) return undefined;
  return createBigQueryWarehouseProvider({ serviceAccount, tables, fetchImplementation });
}

export function createBigQueryWarehouseProvider(
  options: BigQueryWarehouseProviderOptions,
): AnalyticsWarehouseProvider {
  const fetcher = options.fetchImplementation ?? fetch;
  const clock = options.clock ?? (() => new Date());
  let cachedToken: { value: string; expiresAtMs: number } | null = null;

  const accessToken = async (signal?: AbortSignal): Promise<string> => {
    const now = clock().getTime();
    if (cachedToken && cachedToken.expiresAtMs - TOKEN_REFRESH_MARGIN_MS > now) {
      return cachedToken.value;
    }
    const assertion = signedJwtAssertion(options.serviceAccount, now);
    const response = await withTimeout(signal, (requestSignal) =>
      fetcher(GOOGLE_TOKEN_URL, {
        method: 'POST',
        signal: requestSignal,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
      }),
    );
    if (!response.ok) throw new Error(`bigquery_token_http_${response.status}`);
    const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
      throw new Error('bigquery_token_missing');
    }
    const lifetimeSeconds =
      typeof payload.expires_in === 'number' && payload.expires_in > 0
        ? payload.expires_in
        : TOKEN_TTL_SECONDS;
    cachedToken = { value: payload.access_token, expiresAtMs: now + lifetimeSeconds * 1_000 };
    return cachedToken.value;
  };

  return {
    id: BIGQUERY_PROVIDER_ID,

    async deliver(input: {
      destination: AnalyticsWarehouseDestination;
      credentialReference: string;
      idempotencyKey: string;
      batch: AnalyticsWarehouseDeliveryBatch;
    }): Promise<AnalyticsWarehouseDeliveryResult> {
      const table = options.tables[input.credentialReference];
      if (!table) throw new Error('bigquery_table_not_configured');
      if (input.batch.events.length === 0) {
        return {
          providerBatchId: `${BIGQUERY_PROVIDER_ID}:${input.idempotencyKey}`,
          acceptedEventCount: 0,
          batchHash: input.batch.batchHash,
        };
      }

      const token = await accessToken();
      let accepted = 0;
      for (const chunk of chunked(input.batch.events, MAX_ROWS_PER_INSERT)) {
        const response = await withTimeout(undefined, (requestSignal) =>
          fetcher(insertAllUrl(table), {
            method: 'POST',
            signal: requestSignal,
            headers: {
              accept: 'application/json',
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              kind: 'bigquery#tableDataInsertAllRequest',
              /*
               * A malformed row is a contract bug, not a transient failure.
               * Skipping it would drop analytics silently; failing the batch
               * leaves it on the queue where the error is visible.
               */
              skipInvalidRows: false,
              ignoreUnknownValues: false,
              rows: chunk.map((event) => ({
                /*
                 * BigQuery deduplicates on insertId, which is what makes a
                 * replay of this batch idempotent. Keyed by batch and event so
                 * the same event in a later batch is still inserted once.
                 */
                insertId: `${input.idempotencyKey}:${event.eventId}`.slice(0, 128),
                json: warehouseRow(event),
              })),
            }),
          }),
        );
        if (!response.ok) throw new Error(`bigquery_insert_http_${response.status}`);
        const payload = (await response.json()) as { insertErrors?: unknown };
        if (Array.isArray(payload.insertErrors) && payload.insertErrors.length > 0) {
          throw new Error('bigquery_insert_rejected');
        }
        accepted += chunk.length;
      }

      return {
        providerBatchId: `${BIGQUERY_PROVIDER_ID}:${input.idempotencyKey}`,
        acceptedEventCount: accepted,
        batchHash: input.batch.batchHash,
      };
    },
  };
}

function insertAllUrl(table: BigQueryTableTarget): string {
  return `${BIGQUERY_API_BASE_URL}/projects/${encodeURIComponent(
    table.projectId,
  )}/datasets/${encodeURIComponent(table.datasetId)}/tables/${encodeURIComponent(
    table.tableId,
  )}/insertAll`;
}

/**
 * The versioned warehouse contract, flattened one level.
 *
 * `props` stays JSON-encoded rather than becoming columns: it is caller-shaped,
 * and a schema that grows a column per key is a schema that breaks on the next
 * event.
 */
function warehouseRow(event: WarehouseAnalyticsEvent): Record<string, unknown> {
  return {
    schema_version: event.schemaVersion,
    event_id: event.eventId,
    workspace_id: event.workspaceId,
    environment_id: event.environmentId,
    document_id: event.documentId,
    publication_id: event.publicationId,
    content_hash: event.contentHash,
    pointer_generation: event.pointerGeneration,
    experiment_id: event.experimentId ?? null,
    arm_id: event.armId ?? null,
    experiment_allocation_revision: event.experimentAllocationRevision ?? null,
    audience_segment: event.audienceSegment ? JSON.stringify(event.audienceSegment) : null,
    name: event.name,
    step_id: event.stepId ?? null,
    sdk_version: event.sdkVersion,
    correlation_id: event.correlationId ?? null,
    timestamp: event.timestamp,
    props: event.props ? JSON.stringify(event.props) : null,
    ingested_at: event.ingestedAt,
  };
}

/** RS256 JWT bearer assertion — the documented service-account grant. */
function signedJwtAssertion(account: BigQueryServiceAccount, nowMs: number): string {
  const issuedAt = Math.floor(nowMs / 1_000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: BIGQUERY_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      exp: issuedAt + TOKEN_TTL_SECONDS,
      iat: issuedAt,
    }),
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(account.privateKey);
  return `${header}.${claims}.${base64UrlFromBuffer(signature)}`;
}

function base64Url(value: string): string {
  return base64UrlFromBuffer(Buffer.from(value, 'utf8'));
}

function base64UrlFromBuffer(value: Buffer): string {
  return value.toString('base64').replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

async function withTimeout(
  upstream: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<Response>,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  timeout.unref?.();
  const abort = () => controller.abort();
  upstream?.addEventListener('abort', abort, { once: true });
  try {
    return await run(controller.signal);
  } finally {
    upstream?.removeEventListener('abort', abort);
    clearTimeout(timeout);
  }
}

function* chunked<T>(items: readonly T[], size: number): Generator<readonly T[]> {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size);
  }
}

function readServiceAccount(environment: NodeJS.ProcessEnv): BigQueryServiceAccount | null {
  const raw = environment.LODARIQ_BIGQUERY_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    // Base64 keeps a PEM's newlines intact through environments that strip them.
    parsed = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const clientEmail = record.client_email;
  const privateKey = record.private_key;
  const projectId = record.project_id;
  if (
    typeof clientEmail !== 'string' ||
    typeof privateKey !== 'string' ||
    typeof projectId !== 'string'
  ) {
    return null;
  }
  return { clientEmail, privateKey, projectId };
}

/**
 * `LODARIQ_BIGQUERY_TABLE_<REFERENCE>` as `<project>:<dataset>.<table>`.
 *
 * The reference is uppercased with non-alphanumerics as underscores, because a
 * credential reference may contain characters an environment name cannot.
 */
function readTableTargets(
  environment: NodeJS.ProcessEnv,
): Record<string, BigQueryTableTarget> {
  const prefix = 'LODARIQ_BIGQUERY_TABLE_';
  const targets: Record<string, BigQueryTableTarget> = {};
  const references = environment.LODARIQ_BIGQUERY_CREDENTIAL_REFERENCES?.trim();
  if (!references) return targets;
  for (const reference of references.split(',')) {
    const trimmed = reference.trim();
    if (!trimmed) continue;
    const value = environment[`${prefix}${envSuffix(trimmed)}`]?.trim();
    const target = value ? parseTableTarget(value) : null;
    if (target) targets[trimmed] = target;
  }
  return targets;
}

function parseTableTarget(value: string): BigQueryTableTarget | null {
  const [projectId, rest] = value.split(':');
  if (!projectId || !rest) return null;
  const separator = rest.indexOf('.');
  if (separator <= 0) return null;
  const datasetId = rest.slice(0, separator);
  const tableId = rest.slice(separator + 1);
  if (!datasetId || !tableId) return null;
  return { projectId, datasetId, tableId };
}

function envSuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9]/gu, '_').toUpperCase();
}
