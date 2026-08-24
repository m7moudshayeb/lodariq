import { createHash } from 'node:crypto';
import {
  authoringPresenceParticipantId,
  type AuthoringPresenceRecord,
  type ControlPlaneRepository,
  type ExperienceStepLockRecord,
} from '@lodariq/database';
import type { AuthoringCollaborationSnapshot, ExperienceComment } from '@lodariq/schema';

const COLLABORATION_RECONCILE_MS = 5_000;
const COLLABORATION_RECONCILE_JITTER_MS = 750;
const COLLABORATION_PUBLISH_DEBOUNCE_MS = 25;
const MAX_COLLABORATORS_PER_DOCUMENT = 100;

export interface AuthoringCollaborationScope {
  workspaceId: string;
  documentId: string;
}

interface CollaborationBaseSnapshot {
  presence: AuthoringPresenceRecord[];
  locks: ExperienceStepLockRecord[];
  comments: ExperienceComment[];
  documentUpdatedAt: string;
}

interface CollaborationSubscriber {
  sessionId: string;
  creatorId: string;
  send: (eventId: string, snapshot: AuthoringCollaborationSnapshot) => boolean;
  replaced: () => void;
  initialized: boolean;
}

interface CollaborationChannel {
  scope: AuthoringCollaborationScope;
  subscribers: Map<string, CollaborationSubscriber>;
  lastHash: string | null;
  refreshPromise: Promise<void> | null;
  refreshRequested: boolean;
  publishTimer: ReturnType<typeof setTimeout> | null;
  reconcileTimer: ReturnType<typeof setTimeout> | null;
  revision: number;
}

/**
 * One bounded poller per active document, regardless of tab count. Mutation
 * routes publish immediately; the poller reconciles changes from another API
 * process without requiring Redis or a second source of truth.
 */
export class AuthoringCollaborationHub {
  private readonly channels = new Map<string, CollaborationChannel>();

  constructor(private readonly repository: ControlPlaneRepository) {}

  subscribe(
    scope: AuthoringCollaborationScope,
    subscriber: Omit<CollaborationSubscriber, 'initialized'>,
  ): () => void {
    const channel = this.channel(scope);
    const existing = channel.subscribers.get(subscriber.sessionId);
    existing?.replaced();
    if (!existing && channel.subscribers.size >= MAX_COLLABORATORS_PER_DOCUMENT) {
      throw new Error('collaboration_capacity_reached');
    }
    const registered: CollaborationSubscriber = { ...subscriber, initialized: false };
    channel.subscribers.set(subscriber.sessionId, registered);
    this.schedulePublish(channel, 0);
    this.scheduleReconcile(channel);
    return () => {
      if (channel.subscribers.get(subscriber.sessionId) !== registered) return;
      channel.subscribers.delete(subscriber.sessionId);
      if (channel.subscribers.size === 0) this.destroyChannel(channel);
    };
  }

  publish(scope: AuthoringCollaborationScope): void {
    const channel = this.channels.get(scopeKey(scope));
    if (channel) this.schedulePublish(channel, COLLABORATION_PUBLISH_DEBOUNCE_MS);
  }

  activeChannelCount(): number {
    return this.channels.size;
  }

  private channel(scope: AuthoringCollaborationScope): CollaborationChannel {
    const key = scopeKey(scope);
    const existing = this.channels.get(key);
    if (existing) return existing;
    const channel: CollaborationChannel = {
      scope: { ...scope },
      subscribers: new Map(),
      lastHash: null,
      refreshPromise: null,
      refreshRequested: false,
      publishTimer: null,
      reconcileTimer: null,
      revision: 0,
    };
    this.channels.set(key, channel);
    return channel;
  }

  private schedulePublish(channel: CollaborationChannel, delayMs: number): void {
    if (channel.publishTimer) return;
    if (channel.refreshPromise) {
      channel.refreshRequested = true;
      return;
    }
    channel.publishTimer = setTimeout(() => {
      channel.publishTimer = null;
      channel.refreshPromise = this.refresh(channel)
        .catch(() => undefined)
        .finally(() => {
          channel.refreshPromise = null;
          if (channel.refreshRequested && channel.subscribers.size > 0) {
            channel.refreshRequested = false;
            this.schedulePublish(channel, 0);
          }
        });
    }, delayMs);
  }

  private scheduleReconcile(channel: CollaborationChannel): void {
    if (channel.reconcileTimer) return;
    const jitter = Math.floor(Math.random() * (COLLABORATION_RECONCILE_JITTER_MS * 2 + 1));
    const delay = COLLABORATION_RECONCILE_MS - COLLABORATION_RECONCILE_JITTER_MS + jitter;
    channel.reconcileTimer = setTimeout(() => {
      channel.reconcileTimer = null;
      this.schedulePublish(channel, 0);
      if (channel.subscribers.size > 0) this.scheduleReconcile(channel);
    }, delay);
  }

  private async refresh(channel: CollaborationChannel): Promise<void> {
    if (channel.subscribers.size === 0) return;
    const snapshot = await loadBaseSnapshot(this.repository, channel.scope);
    const hash = snapshotHash(snapshot);
    const changed = hash !== channel.lastHash;
    const recipients = changed
      ? [...channel.subscribers.values()]
      : [...channel.subscribers.values()].filter((subscriber) => !subscriber.initialized);
    if (recipients.length === 0) return;
    if (changed) channel.lastHash = hash;
    channel.revision += 1;
    const eventId = `collab_${channel.revision}`;
    for (const subscriber of recipients) {
      const sent = subscriber.send(eventId, snapshotForSubscriber(snapshot, subscriber));
      if (!sent) {
        subscriber.replaced();
        if (channel.subscribers.get(subscriber.sessionId) === subscriber) {
          channel.subscribers.delete(subscriber.sessionId);
        }
      } else {
        subscriber.initialized = true;
      }
    }
    if (channel.subscribers.size === 0) this.destroyChannel(channel);
  }

  private destroyChannel(channel: CollaborationChannel): void {
    if (channel.publishTimer) clearTimeout(channel.publishTimer);
    if (channel.reconcileTimer) clearTimeout(channel.reconcileTimer);
    channel.publishTimer = null;
    channel.reconcileTimer = null;
    channel.refreshRequested = false;
    this.channels.delete(scopeKey(channel.scope));
  }
}

export async function readAuthoringCollaborationSnapshot(
  repository: ControlPlaneRepository,
  scope: AuthoringCollaborationScope,
  subscriber: { sessionId: string; creatorId: string },
): Promise<AuthoringCollaborationSnapshot> {
  return snapshotForSubscriber(await loadBaseSnapshot(repository, scope), subscriber);
}

async function loadBaseSnapshot(
  repository: ControlPlaneRepository,
  scope: AuthoringCollaborationScope,
): Promise<CollaborationBaseSnapshot> {
  const [presence, locks, comments, document] = await Promise.all([
    repository.listAuthoringPresence(scope),
    repository.listExperienceStepLockRecords(scope),
    repository.listExperienceComments(scope),
    repository.getDocument(scope.workspaceId, scope.documentId),
  ]);
  if (!document) throw new Error('authoring_document_not_found');
  return { presence, locks, comments, documentUpdatedAt: document.updatedAt };
}

function snapshotForSubscriber(
  base: CollaborationBaseSnapshot,
  subscriber: Pick<CollaborationSubscriber, 'sessionId' | 'creatorId'>,
): AuthoringCollaborationSnapshot {
  const selfParticipantId = authoringPresenceParticipantId(subscriber.sessionId);
  const self = base.presence.find((entry) => entry.sessionId === subscriber.sessionId);
  const participantBySession = new Map(
    base.presence.map((entry) => [
      entry.sessionId,
      authoringPresenceParticipantId(entry.sessionId),
    ]),
  );
  return {
    selfParticipantId,
    generatedAt: new Date().toISOString(),
    documentUpdatedAt: base.documentUpdatedAt,
    draftChanged: Boolean(
      self?.documentUpdatedAt && self.documentUpdatedAt !== base.documentUpdatedAt,
    ),
    peers: base.presence
      .filter((entry) => entry.sessionId !== subscriber.sessionId)
      .map((entry) => ({
        participantId: authoringPresenceParticipantId(entry.sessionId),
        creatorId: entry.creatorId,
        name: entry.creatorName,
        stepId: entry.stepId,
        selection: entry.selection,
        lastSeenAt: entry.lastSeenAt,
        sameCreator: entry.creatorId === subscriber.creatorId,
      })),
    locks: base.locks.map((lock) => ({
      stepId: lock.stepId,
      holderName: lock.holderName,
      ...(participantBySession.get(lock.sessionId)
        ? { holderParticipantId: participantBySession.get(lock.sessionId)! }
        : {}),
      expiresAt: lock.expiresAt,
    })),
    comments: base.comments,
  };
}

function snapshotHash(snapshot: CollaborationBaseSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function scopeKey(scope: AuthoringCollaborationScope): string {
  return `${scope.workspaceId}\u0000${scope.documentId}`;
}
