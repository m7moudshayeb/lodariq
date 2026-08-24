import { createHash } from 'node:crypto';
import type { BrandDriftCheckResult } from '@lodariq/schema';
import { readAuthEmailDeliveryEnvironment } from './auth';

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';
const DELIVERY_TIMEOUT_MS = 10_000;

export interface BrandDriftEmailNotification {
  recipientEmail: string;
  recipientName: string | null;
  workspaceId: string;
  documentId: string;
  environmentId: string;
  drift: BrandDriftCheckResult;
}

export interface BrandDriftEmailNotifier {
  send(notification: BrandDriftEmailNotification): Promise<void>;
}

export function createBrandDriftEmailNotifierFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): BrandDriftEmailNotifier | undefined {
  if (environment.LODARIQ_EMAIL_DELIVERY_MODE?.trim() !== 'resend') return undefined;
  const config = readAuthEmailDeliveryEnvironment(environment);
  if (config.mode !== 'resend') return undefined;
  return createResendBrandDriftEmailNotifier({
    apiKey: config.apiKey,
    from: config.from,
    fetchImplementation,
  });
}

export function createResendBrandDriftEmailNotifier(options: {
  apiKey: string;
  from: string;
  fetchImplementation?: typeof fetch;
}): BrandDriftEmailNotifier {
  const fetcher = options.fetchImplementation ?? fetch;
  return {
    async send(notification) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      timeout.unref?.();
      try {
        const response = await fetcher(RESEND_EMAILS_ENDPOINT, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': notificationIdempotencyKey(notification),
            'user-agent': 'lodariq-brand-drift/1.0',
          },
          body: JSON.stringify(emailPayload(options.from, notification)),
        });
        if (!response.ok) throw new Error(`brand_drift_email_http_${response.status}`);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function notificationIdempotencyKey(notification: BrandDriftEmailNotification): string {
  const digest = createHash('sha256')
    .update(
      `${notification.workspaceId}:${notification.documentId}:${notification.drift.checkId}:${notification.recipientEmail}`,
    )
    .digest('base64url');
  return `lodariq-brand-drift/${digest}`;
}

function emailPayload(from: string, notification: BrandDriftEmailNotification) {
  const classification = notification.drift.classification;
  const changedRoles = notification.drift.changedRoles.join(', ') || 'none';
  const greeting = notification.recipientName?.trim()
    ? `Hi ${notification.recipientName.trim()},`
    : 'Hi,';
  const subject = `Lodariq detected ${classification} Brand drift`;
  const text = `${greeting}\n\nLodariq detected ${classification} Brand drift for document ${notification.documentId} in environment ${notification.environmentId}. Changed semantic roles: ${changedRoles}. Confidence: ${notification.drift.confidence}%. Review the proposed theme in authoring before applying anything.\n\nNo live artifact was changed.`;
  return {
    from,
    to: notification.recipientEmail,
    subject,
    text,
    html: `<p>${escapeHtml(greeting)}</p><p>Lodariq detected <strong>${escapeHtml(classification)}</strong> Brand drift for document <code>${escapeHtml(notification.documentId)}</code> in environment <code>${escapeHtml(notification.environmentId)}</code>.</p><p>Changed semantic roles: ${escapeHtml(changedRoles)}. Confidence: ${notification.drift.confidence}%.</p><p>Review the proposed theme in authoring before applying anything. No live artifact was changed.</p>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}
