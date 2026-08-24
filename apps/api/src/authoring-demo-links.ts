import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalJson, sha256Hex } from '@lodariq/compiler';
import {
  CompiledDocument as CompiledDocumentSchema,
  DemoArtifactReview,
  DEMO_PUBLIC_ORIGIN,
  DemoLink,
  PublicDemoArtifact as PublicDemoArtifactSchema,
  type CreateDemoLinkRequest,
  type DemoAnalyticsSummary,
  type DemoArtifactReview as DemoArtifactReviewValue,
  type DemoLink as DemoLinkValue,
  type DemoLinkAnalyticsEvent,
  type PublicDemoArtifact,
  isValid,
} from '@lodariq/schema';
import type { AuthoringRoadmapRecord, ControlPlaneRepository } from '@lodariq/database';
import { preparePublicDemoArtifact } from './public-demo-artifact';

const DEMO_COOKIE_NAME = 'lodariq_demo_session';
/** Generous for a real viewer, useless for inflating a funnel. */
const DEMO_EVENT_WINDOW_MS = 60_000;
const DEMO_EVENT_WINDOW_LIMIT = 120;
const DEMO_EVENT_WINDOW_MAX_KEYS = 10_000;
const DEMO_COOKIE_MAX_AGE_SECONDS = 86_400;

interface DemoLinkRecordPayload {
  schemaVersion: '1';
  link: DemoLinkValue;
  artifactId: string;
  operationId: string;
  requestHash: string;
  review: DemoArtifactReviewValue;
  publicArtifact: PublicDemoArtifact;
}

interface DemoAnalyticsRecordPayload {
  schemaVersion: '1';
  demoId: string;
  event: DemoLinkAnalyticsEvent['event'];
  stepId?: string;
}

export class AuthoringDemoLinkError extends Error {
  constructor(
    readonly code:
      | 'publication_scope_invalid'
      | 'publication_content_changed'
      | 'demo_link_not_found'
      | 'demo_link_expired'
      | 'demo_link_revoked'
      | 'demo_origin_invalid'
      | 'demo_session_invalid'
      | 'demo_artifact_unavailable'
      | 'demo_event_invalid'
      | 'demo_event_rate_limited'
      | 'demo_review_stale'
      | 'demo_operation_conflict',
    message: string,
  ) {
    super(message);
    this.name = 'AuthoringDemoLinkError';
  }
}

/** Thrown when a demo link is asked for without a configured signing secret. */
export class DemoLinkSecretUnavailableError extends Error {
  readonly code = 'demo_links_unavailable';

  constructor() {
    super('Public demo links require a configured signing secret');
    this.name = 'DemoLinkSecretUnavailableError';
  }
}

export class AuthoringDemoLinks {
  private readonly secret: Buffer;
  /**
   * A link outlives the process that minted it, so an ephemeral secret is not a
   * usable default: every already-shared link stops verifying on restart, or on
   * whichever machine did not mint it. Unconfigured means the feature refuses
   * rather than mints something that will stop working.
   */
  private readonly configured: boolean;
  private readonly publicEventWindows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly repository: ControlPlaneRepository,
    secret: string | null,
    private readonly publicOrigin = DEMO_PUBLIC_ORIGIN,
  ) {
    this.configured = Boolean(secret?.trim());
    this.secret = Buffer.from(secret ?? '', 'utf8');
    if (this.configured && this.secret.length < 32) {
      throw new Error('demo link secret must be at least 32 bytes');
    }
    new URL(publicOrigin);
  }

  /** Every path that mints or verifies a signature passes through here first. */
  private assertConfigured(): void {
    if (!this.configured) throw new DemoLinkSecretUnavailableError();
  }

  async create(input: {
    workspaceId: string;
    environmentId: string;
    documentId: string;
    actorUserId: string;
    request: CreateDemoLinkRequest;
  }): Promise<DemoLinkValue> {
    const requestHash = `sha256-${await sha256Hex(canonicalJson(input.request))}`;
    const existing = (
      await this.repository.listAuthoringRoadmapRecords(
        input.workspaceId,
        'demo_link',
        input.documentId,
      )
    ).find((record) => {
      const payload = readLinkPayload(record);
      return (
        payload?.operationId === input.request.operationId &&
        record.environmentId === input.environmentId &&
        payload.link.scope.publicationId === input.request.publicationId
      );
    });
    if (existing) {
      const payload = readLinkPayload(existing);
      if (payload?.requestHash !== requestHash) {
        throw new AuthoringDemoLinkError(
          'demo_operation_conflict',
          'That demo operation identifier was already used for different input',
        );
      }
      return this.currentLink(existing);
    }

    const prepared = await this.prepare(input);
    if (prepared.review.reviewHash !== input.request.reviewHash) {
      throw new AuthoringDemoLinkError(
        'demo_review_stale',
        'The structured-artifact review changed; review the publication again before sharing it',
      );
    }

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + input.request.expiresInSeconds * 1_000).toISOString();
    const id = `demo_${randomToken(18)}`;
    const link: DemoLinkValue = {
      schemaVersion: '1',
      id,
      url: `${this.publicOrigin}/d/${id}`,
      scope: {
        schemaVersion: '1',
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        documentId: input.documentId,
        publicationId: prepared.publication.id,
        contentHash: prepared.publication.contentHash,
        origin: DEMO_PUBLIC_ORIGIN,
        redaction: 'structured-artifact',
        analytics: 'scoped-anonymous',
      },
      createdAt,
      expiresAt,
      status: 'active',
    };
    await this.repository.createAuthoringRoadmapRecord({
      record: {
        id,
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        documentId: input.documentId,
        kind: 'demo_link',
        status: 'active',
        payload: {
          schemaVersion: '1',
          link,
          artifactId: prepared.publication.compiledArtifactId,
          operationId: input.request.operationId,
          requestHash,
          review: prepared.review,
          publicArtifact: {
            schemaVersion: '1',
            demoId: id,
            contentHash: prepared.publication.contentHash,
            presentationContentHash: prepared.artifact.contentHash,
            artifact: prepared.artifact,
          },
        } satisfies DemoLinkRecordPayload,
        createdByUserId: input.actorUserId,
        createdAt,
        updatedAt: createdAt,
        expiresAt,
        revokedAt: null,
      },
    });
    return link;
  }

  async review(input: {
    workspaceId: string;
    environmentId: string;
    documentId: string;
    request: { publicationId: string; contentHash: string };
  }): Promise<DemoArtifactReviewValue> {
    return (await this.prepare(input)).review;
  }

  async list(input: {
    workspaceId: string;
    environmentId: string;
    documentId: string;
  }): Promise<DemoLinkValue[]> {
    const records = await this.repository.listAuthoringRoadmapRecords(
      input.workspaceId,
      'demo_link',
      input.documentId,
    );
    return records
      .filter((record) => record.environmentId === input.environmentId)
      .map((record) => this.currentLink(record));
  }

  async revoke(input: {
    workspaceId: string;
    environmentId: string;
    documentId: string;
    id: string;
  }): Promise<DemoLinkValue> {
    const record = await this.repository.getAuthoringRoadmapRecord(input.workspaceId, input.id);
    if (
      !record ||
      record.kind !== 'demo_link' ||
      record.environmentId !== input.environmentId ||
      record.documentId !== input.documentId
    ) {
      throw new AuthoringDemoLinkError('demo_link_not_found', 'Demo link not found');
    }
    const now = new Date().toISOString();
    const link = { ...this.currentLink(record), revokedAt: now, status: 'revoked' as const };
    await this.repository.updateAuthoringRoadmapRecord({
      workspaceId: input.workspaceId,
      id: input.id,
      status: 'revoked',
      payload: { ...record.payload, link },
      revokedAt: now,
      updatedAt: now,
    });
    return link;
  }

  async analytics(input: {
    workspaceId: string;
    environmentId: string;
    documentId: string;
  }): Promise<DemoAnalyticsSummary> {
    const links = await this.list(input);
    const ids = new Set(links.map((link) => link.id));
    const events = await this.repository.listAuthoringRoadmapRecords(
      input.workspaceId,
      'demo_analytics',
      input.documentId,
    );
    const summary: DemoAnalyticsSummary = {
      schemaVersion: '1',
      views: 0,
      completions: 0,
      dismissals: 0,
      lastStepIds: [],
    };
    const steps: string[] = [];
    for (const record of events) {
      if (record.environmentId !== input.environmentId) continue;
      const payload = readAnalyticsPayload(record);
      if (!payload || !ids.has(payload.demoId)) continue;
      if (payload.event === 'viewed') summary.views += 1;
      if (payload.event === 'completed') summary.completions += 1;
      if (payload.event === 'dismissed') summary.dismissals += 1;
      if (payload.stepId && !steps.includes(payload.stepId)) steps.push(payload.stepId);
    }
    summary.lastStepIds = steps.slice(-100);
    return summary;
  }

  async publicShell(input: {
    demoId: string;
    requestOrigin?: string;
    requestHost?: string;
    cookieHeader?: string;
  }): Promise<{ setCookie?: string }> {
    const access = await this.authorizePublicAccess(input);
    return access.setCookie ? { setCookie: access.setCookie } : {};
  }

  async publicArtifact(input: {
    demoId: string;
    requestOrigin?: string;
    requestHost?: string;
    cookieHeader?: string;
  }): Promise<{ artifact: PublicDemoArtifact; setCookie?: string }> {
    const { record, payload, link, setCookie } = await this.authorizePublicAccess(input);
    const artifact = await this.repository.getCompiledArtifact(
      record.workspaceId,
      record.documentId,
      payload.artifactId,
    );
    if (!artifact || artifact.contentHash !== link.scope.contentHash) {
      throw new AuthoringDemoLinkError(
        'demo_artifact_unavailable',
        'The immutable demo artifact is no longer available',
      );
    }
    if (
      payload.publicArtifact.contentHash !== link.scope.contentHash ||
      payload.publicArtifact.presentationContentHash !== payload.review.presentationContentHash
    ) {
      throw new AuthoringDemoLinkError(
        'demo_artifact_unavailable',
        'The reviewed public demo artifact no longer matches its immutable publication pin',
      );
    }
    return {
      artifact: payload.publicArtifact,
      ...(setCookie ? { setCookie } : {}),
    };
  }

  async recordPublicEvent(input: {
    demoId: string;
    event: DemoLinkAnalyticsEvent;
    requestOrigin?: string;
    requestHost?: string;
    cookieHeader?: string;
  }): Promise<void> {
    this.assertDemoOrigin(input.requestOrigin, input.requestHost);
    const record = await this.repository.getAuthoringRoadmapRecordById(input.demoId);
    const payload = record ? readLinkPayload(record) : null;
    if (!record || record.kind !== 'demo_link' || !payload) {
      throw new AuthoringDemoLinkError('demo_link_not_found', 'Demo link not found');
    }
    const link = this.currentLink(record);
    if (link.status !== 'active') {
      throw new AuthoringDemoLinkError(
        link.status === 'expired' ? 'demo_link_expired' : 'demo_link_revoked',
        'This demo link is not active',
      );
    }
    if (!this.verifyCookie(input.cookieHeader, link)) {
      throw new AuthoringDemoLinkError('demo_session_invalid', 'Demo session is invalid');
    }
    if (
      input.event.stepId &&
      !artifactStepIds(payload.publicArtifact.artifact).has(input.event.stepId)
    ) {
      throw new AuthoringDemoLinkError('demo_event_invalid', 'Demo event is outside the artifact');
    }
    /*
     * A demo link is public and its events are anonymous, so the only thing
     * standing between it and an inflated funnel is a ceiling. Counted per
     * session rather than per link: the session cookie is what a viewer has,
     * and a genuine viewer of a demo produces tens of events, not thousands.
     */
    if (!this.admitPublicEvent(link.id, input.cookieHeader ?? '')) {
      throw new AuthoringDemoLinkError('demo_event_rate_limited', 'Too many demo events');
    }
    const createdAt = new Date().toISOString();
    await this.repository.createAuthoringRoadmapRecord({
      record: {
        id: `demoevt_${randomToken(18)}`,
        workspaceId: record.workspaceId,
        environmentId: record.environmentId,
        documentId: record.documentId,
        kind: 'demo_analytics',
        status: 'event',
        payload: {
          schemaVersion: '1',
          demoId: link.id,
          event: input.event.event,
          ...(input.event.stepId ? { stepId: input.event.stepId } : {}),
        } satisfies DemoAnalyticsRecordPayload,
        createdByUserId: null,
        createdAt,
        updatedAt: createdAt,
        expiresAt: null,
        revokedAt: null,
      },
    });
  }

  /**
   * A fixed window per session. In-process on purpose: this is a cheap ceiling
   * on anonymous writes, not an accounting record, and a per-machine limit that
   * costs nothing beats a shared one that costs a round trip on every event.
   */
  private admitPublicEvent(linkId: string, cookieHeader: string): boolean {
    const now = Date.now();
    const key = `${linkId}:${createHash('sha256').update(cookieHeader).digest('base64url')}`;
    const window = this.publicEventWindows.get(key);
    if (!window || now >= window.resetAt) {
      if (this.publicEventWindows.size > DEMO_EVENT_WINDOW_MAX_KEYS) {
        for (const [existing, entry] of this.publicEventWindows) {
          if (now >= entry.resetAt) this.publicEventWindows.delete(existing);
        }
      }
      this.publicEventWindows.set(key, { count: 1, resetAt: now + DEMO_EVENT_WINDOW_MS });
      return true;
    }
    if (window.count >= DEMO_EVENT_WINDOW_LIMIT) return false;
    window.count += 1;
    return true;
  }

  private async prepare(input: {
    workspaceId: string;
    environmentId: string;
    documentId: string;
    request: { publicationId: string; contentHash: string };
  }) {
    const publication = await this.repository.getPublicationById(
      input.workspaceId,
      input.request.publicationId,
    );
    if (
      !publication ||
      publication.environmentId !== input.environmentId ||
      publication.documentId !== input.documentId
    ) {
      throw new AuthoringDemoLinkError(
        'publication_scope_invalid',
        'The selected publication is outside this authoring session',
      );
    }
    if (publication.contentHash !== input.request.contentHash) {
      throw new AuthoringDemoLinkError(
        'publication_content_changed',
        'The selected publication changed; refresh release state before sharing it',
      );
    }
    const artifact = await this.repository.getCompiledArtifact(
      input.workspaceId,
      input.documentId,
      publication.compiledArtifactId,
    );
    if (!artifact || artifact.contentHash !== publication.contentHash) {
      throw new AuthoringDemoLinkError(
        'demo_artifact_unavailable',
        'The immutable publication artifact is unavailable for review',
      );
    }
    try {
      const prepared = await preparePublicDemoArtifact({
        publicationId: publication.id,
        artifact: artifact.compiled,
      });
      return { publication, ...prepared };
    } catch (error) {
      throw new AuthoringDemoLinkError(
        'demo_artifact_unavailable',
        error instanceof Error ? error.message : 'The public demo artifact could not be reviewed',
      );
    }
  }

  private async authorizePublicAccess(input: {
    demoId: string;
    requestOrigin?: string;
    requestHost?: string;
    cookieHeader?: string;
  }): Promise<{
    record: AuthoringRoadmapRecord;
    payload: DemoLinkRecordPayload;
    link: DemoLinkValue;
    setCookie?: string;
  }> {
    this.assertDemoOrigin(input.requestOrigin, input.requestHost);
    const record = await this.repository.getAuthoringRoadmapRecordById(input.demoId);
    const payload = record ? readLinkPayload(record) : null;
    if (!record || record.kind !== 'demo_link' || !payload) {
      throw new AuthoringDemoLinkError('demo_link_not_found', 'Demo link not found');
    }
    const link = this.currentLink(record);
    if (link.status === 'revoked') {
      throw new AuthoringDemoLinkError('demo_link_revoked', 'This demo link has been revoked');
    }
    if (link.status === 'expired') {
      throw new AuthoringDemoLinkError('demo_link_expired', 'This demo link has expired');
    }
    const session = this.verifyCookie(input.cookieHeader, link);
    if (input.cookieHeader && !session) {
      throw new AuthoringDemoLinkError('demo_session_invalid', 'Demo session is invalid');
    }
    return {
      record,
      payload,
      link,
      ...(session ? {} : { setCookie: this.createCookie(link) }),
    };
  }

  private currentLink(record: AuthoringRoadmapRecord): DemoLinkValue {
    const payload = readLinkPayload(record);
    if (!payload) throw new AuthoringDemoLinkError('demo_link_not_found', 'Demo link not found');
    const link = payload.link;
    if (record.status === 'revoked' || record.revokedAt) {
      return { ...link, revokedAt: record.revokedAt, status: 'revoked' };
    }
    if (Date.parse(link.expiresAt) <= Date.now()) {
      if (record.status === 'active') {
        void this.repository.updateAuthoringRoadmapRecord({
          workspaceId: record.workspaceId,
          id: record.id,
          status: 'expired',
          updatedAt: new Date().toISOString(),
        });
      }
      return { ...link, status: 'expired' };
    }
    return { ...link, status: 'active' };
  }

  private assertDemoOrigin(requestOrigin?: string, requestHost?: string): void {
    const expected = new URL(this.publicOrigin);
    const originOk = !requestOrigin || requestOrigin === this.publicOrigin;
    const hostOk = !requestHost || requestHost === expected.host;
    if (!originOk || !hostOk || (!requestOrigin && !requestHost)) {
      throw new AuthoringDemoLinkError(
        'demo_origin_invalid',
        'Demo requests must use the exact public demo origin',
      );
    }
  }

  private createCookie(link: DemoLinkValue): string {
    const expiresInSeconds = Math.max(
      1,
      Math.min(
        DEMO_COOKIE_MAX_AGE_SECONDS,
        Math.floor((Date.parse(link.expiresAt) - Date.now()) / 1_000),
      ),
    );
    const value = `${link.id}.${Math.floor(Date.parse(link.expiresAt) / 1_000)}.${this.signature(
      link.id,
      link.expiresAt,
    )}`;
    /*
     * `Path=/` because the endpoints that read this cookie are
     * `/v1/demos/:demoId/artifact` and `/v1/demos/:demoId/events`, not `/d/...`.
     * Scoped to the link's own page the browser never sent it anywhere it was
     * read: every demo analytics POST answered 401 `demo_session_invalid`, and
     * the artifact route's session gate was inert, since it only rejects a
     * cookie that is present and wrong.
     */
    return `${DEMO_COOKIE_NAME}=${value}; Max-Age=${expiresInSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  }

  private verifyCookie(cookieHeader: string | undefined, link: DemoLinkValue): boolean {
    const value = cookieHeader
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${DEMO_COOKIE_NAME}=`))
      ?.slice(DEMO_COOKIE_NAME.length + 1);
    if (!value) return false;
    const [id, expires, signature] = value.split('.');
    if (id !== link.id || expires !== String(Math.floor(Date.parse(link.expiresAt) / 1_000))) {
      return false;
    }
    const expected = this.signature(link.id, link.expiresAt);
    return Boolean(signature && safeEqual(signature, expected));
  }

  private signature(id: string, expiresAt: string): string {
    this.assertConfigured();
    return createHmac('sha256', this.secret).update(`${id}:${expiresAt}`).digest('base64url');
  }
}

function randomToken(byteLength: number): string {
  return randomBytes(byteLength).toString('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readLinkPayload(record: AuthoringRoadmapRecord): DemoLinkRecordPayload | null {
  const payload = record.payload as Partial<DemoLinkRecordPayload>;
  if (
    payload.schemaVersion !== '1' ||
    !payload.link ||
    !payload.artifactId ||
    !payload.operationId ||
    !payload.requestHash ||
    !isValid(DemoArtifactReview, payload.review) ||
    !isValid(PublicDemoArtifactSchema, payload.publicArtifact) ||
    !isValid(CompiledDocumentSchema, (payload.publicArtifact as PublicDemoArtifact).artifact)
  ) {
    return null;
  }
  const link = validateDemoLink(payload.link) ? payload.link : null;
  const publicArtifact = payload.publicArtifact as PublicDemoArtifact;
  if (
    !link ||
    publicArtifact.demoId !== link.id ||
    publicArtifact.contentHash !== link.scope.contentHash
  ) {
    return null;
  }
  return payload as DemoLinkRecordPayload;
}

function readAnalyticsPayload(record: AuthoringRoadmapRecord): DemoAnalyticsRecordPayload | null {
  const payload = record.payload as Partial<DemoAnalyticsRecordPayload>;
  if (
    payload.schemaVersion !== '1' ||
    typeof payload.demoId !== 'string' ||
    typeof payload.event !== 'string' ||
    !['viewed', 'step_started', 'completed', 'dismissed'].includes(payload.event)
  ) {
    return null;
  }
  return payload as DemoAnalyticsRecordPayload;
}

function validateDemoLink(value: unknown): value is DemoLinkValue {
  return isValid(DemoLink, value);
}

function artifactStepIds(artifact: PublicDemoArtifact['artifact']): Set<string> {
  return new Set(artifact.steps.map((step) => step.id));
}
