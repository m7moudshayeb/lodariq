import {
  AUTHORING_OPERATIONS_REQUEST_TYPE,
  type AuthoringOperationsMethod,
  type AuthoringOperationsResultMessage,
} from '@lodariq/schema';
import type { AuthoringOperationsServices } from './operations-services';

/**
 * The frame's half of the Operations boundary.
 *
 * Every section — measurement, analytics, experiments, comments, step locks —
 * used to read whatever local state the frame happened to hold, which meant the
 * numbers a creator saw were never the numbers the product had. These calls now
 * cross the bridge to the host, which owns the URL and the bearer, and come back
 * as normalized data. The frame still never learns either.
 *
 * A request that never gets an answer would leave a section spinning forever, so
 * each one carries its own deadline.
 */
export const OPERATIONS_REQUEST_TIMEOUT_MS = 15_000;

export interface OperationsBridgePort {
  /** Sends the request. The host replies with a matching `requestId`. */
  send: (requestId: string, method: AuthoringOperationsMethod, args: readonly unknown[]) => void;
  /** Subscribes to results; returns an unsubscribe. */
  subscribe: (listener: (message: AuthoringOperationsResultMessage) => void) => () => void;
  /** Injectable for tests; defaults to `window.setTimeout`. */
  readonly timeoutMs?: number;
}

export function createBridgeOperationsServices(
  port: OperationsBridgePort,
): AuthoringOperationsServices {
  let sequence = 0;

  const call = <T>(method: AuthoringOperationsMethod, ...args: readonly unknown[]): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      sequence += 1;
      const requestId = `ops_${sequence}`;
      let timer = 0;

      const unsubscribe = port.subscribe((message) => {
        if (message.requestId !== requestId) return;
        settle();
        if (message.error) reject(new Error(message.error));
        else resolve(message.result as T);
      });

      const settle = (): void => {
        unsubscribe();
        if (timer) globalThis.clearTimeout(timer);
      };

      timer = globalThis.setTimeout(() => {
        settle();
        reject(new Error(`Operations request timed out (${method})`));
      }, port.timeoutMs ?? OPERATIONS_REQUEST_TIMEOUT_MS) as unknown as number;

      try {
        port.send(requestId, method, args);
      } catch (error) {
        settle();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

  return {
    readMeasurement: () => call('readMeasurement'),
    updateMeasurement: (request) => call('updateMeasurement', request),
    readAnalytics: (environmentId) => call('readAnalytics', environmentId),
    listSessions: () => call('listSessions'),
    readExperiment: () => call('readExperiment'),
    createExperiment: (request) => call('createExperiment', request),
    updateExperiment: (experimentId, request) => call('updateExperiment', experimentId, request),
    listComments: () => call('listComments'),
    addComment: (anchor, body) => call('addComment', anchor, body),
    replyToComment: (commentId, body) => call('replyToComment', commentId, body),
    resolveComment: (commentId, resolved) => call('resolveComment', commentId, resolved),
    listStepLocks: () => call('listStepLocks'),
    claimStepLock: (stepId, takeover) => call('claimStepLock', stepId, takeover),
    releaseStepLock: (stepId) => call('releaseStepLock', stepId),
    heartbeatCollaboration: (state) => call('heartbeatCollaboration', state),
    leaveCollaboration: () => call('leaveCollaboration'),
    listApplications: () => call('listApplications'),
    readCommercialUsage: () => call('readCommercialUsage'),
    instantiateTemplate: (templateId) => call('instantiateTemplate', templateId),
    listDocumentVersions: () => call('listDocumentVersions'),
    compareDocumentVersions: (beforeVersionId, afterVersionId) =>
      call('compareDocumentVersions', beforeVersionId, afterVersionId),
    listCopySuggestions: () => call('listCopySuggestions'),
    createCopySuggestions: (beforeVersionId, afterVersionId) =>
      call('createCopySuggestions', beforeVersionId, afterVersionId),
    decideCopySuggestion: (suggestionId, decision) =>
      call('decideCopySuggestion', suggestionId, decision),
    requestAiAssist: (request) => call('requestAiAssist', request),
    generateNarration: (stepId) => call('generateNarration', stepId),
    listAuditEvents: () => call('listAuditEvents'),
    exportAuditCsv: () => call('exportAuditCsv'),
    readDemoLinks: () => call('readDemoLinks'),
    readDemoAnalytics: () => call('readDemoAnalytics'),
    reviewDemoArtifact: (request) => call('reviewDemoArtifact', request),
    createDemoLink: (request) => call('createDemoLink', request),
    revokeDemoLink: (demoId) => call('revokeDemoLink', demoId),
  };
}

export { AUTHORING_OPERATIONS_REQUEST_TYPE };
