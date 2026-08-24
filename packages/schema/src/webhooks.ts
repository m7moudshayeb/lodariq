import { Type, type Static } from '@sinclair/typebox';

export const WEBHOOK_EVENT_SCHEMA_VERSION = '1' as const;
export const WEBHOOK_EVENT_TYPES = [
  'release.activated',
  'release.rolled_back',
  'release.unpublished',
  'brand.drift_detected',
  'governance.capability_profile_changed',
  'residency.migration_changed',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'delivering', 'succeeded', 'dead'] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

const Identifier = Type.String({
  minLength: 1,
  maxLength: 256,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$',
});
const Timestamp = Type.String({ minLength: 20, maxLength: 40, format: 'date-time' });
const WebhookUrl = Type.String({
  minLength: 9,
  maxLength: 2_048,
  pattern: '^https://[^\\s]+$',
});

function eventTypeVariants() {
  return WEBHOOK_EVENT_TYPES.map((eventType) => Type.Literal(eventType));
}

function deliveryStatusVariants() {
  return WEBHOOK_DELIVERY_STATUSES.map((status) => Type.Literal(status));
}

export const WebhookEventType = Type.Union(eventTypeVariants(), { $id: 'WebhookEventType' });

export const WebhookEndpoint = Type.Object(
  {
    id: Identifier,
    workspaceId: Identifier,
    url: WebhookUrl,
    eventTypes: Type.Array(Type.Ref(WebhookEventType), {
      minItems: 1,
      maxItems: WEBHOOK_EVENT_TYPES.length,
      uniqueItems: true,
    }),
    secretVersion: Type.Integer({ minimum: 1 }),
    enabled: Type.Boolean(),
    createdByUserId: Identifier,
    createdAt: Timestamp,
    updatedAt: Timestamp,
  },
  { $id: 'WebhookEndpoint', additionalProperties: false },
);
export type WebhookEndpoint = Static<typeof WebhookEndpoint>;

export const CreateWebhookEndpointRequest = Type.Object(
  {
    url: WebhookUrl,
    eventTypes: WebhookEndpoint.properties.eventTypes,
  },
  { $id: 'CreateWebhookEndpointRequest', additionalProperties: false },
);
export type CreateWebhookEndpointRequest = Static<typeof CreateWebhookEndpointRequest>;

export const CreateWebhookEndpointResult = Type.Object(
  {
    endpoint: Type.Ref(WebhookEndpoint),
    signingSecret: Type.String({
      minLength: 43,
      maxLength: 128,
      pattern: '^whsec_[A-Za-z0-9_-]{32,}$',
    }),
  },
  { $id: 'CreateWebhookEndpointResult', additionalProperties: false },
);
export type CreateWebhookEndpointResult = Static<typeof CreateWebhookEndpointResult>;

export const WebhookEndpointList = Type.Object(
  { endpoints: Type.Array(Type.Ref(WebhookEndpoint), { maxItems: 1_000 }) },
  { $id: 'WebhookEndpointList', additionalProperties: false },
);

export const WebhookEventEnvelope = Type.Object(
  {
    schemaVersion: Type.Literal(WEBHOOK_EVENT_SCHEMA_VERSION),
    id: Identifier,
    workspaceId: Identifier,
    type: Type.Ref(WebhookEventType),
    occurredAt: Timestamp,
    data: Type.Record(Type.String({ minLength: 1, maxLength: 128 }), Type.Unknown(), {
      maxProperties: 64,
    }),
  },
  { $id: 'WebhookEventEnvelope', additionalProperties: false },
);
export type WebhookEventEnvelope = Static<typeof WebhookEventEnvelope>;

export const WebhookDelivery = Type.Object(
  {
    id: Identifier,
    workspaceId: Identifier,
    endpointId: Identifier,
    eventId: Identifier,
    status: Type.Union(deliveryStatusVariants()),
    attempts: Type.Integer({ minimum: 0, maximum: 8 }),
    availableAt: Timestamp,
    lastResponseStatus: Type.Union([Type.Integer({ minimum: 100, maximum: 599 }), Type.Null()]),
    lastErrorCode: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
    deliveredAt: Type.Union([Timestamp, Type.Null()]),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  },
  { $id: 'WebhookDelivery', additionalProperties: false },
);
export type WebhookDelivery = Static<typeof WebhookDelivery>;

export const WebhookDeliveryList = Type.Object(
  { deliveries: Type.Array(Type.Ref(WebhookDelivery), { maxItems: 10_000 }) },
  { $id: 'WebhookDeliveryList', additionalProperties: false },
);

/**
 * Hostnames that resolve to a cloud instance-metadata service. Each has a dot,
 * none ends in `.local`, and every one of them hands out credentials to
 * whatever asks — so a host allow-list built from "looks like a domain" lets
 * them all through.
 */
const METADATA_HOSTNAMES: ReadonlySet<string> = new Set([
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
]);

/**
 * Whether a literal address is one the public internet can route to.
 *
 * A hostname that is not a literal returns `true` here: this answers the
 * *syntactic* question only. Whether the name resolves somewhere private is a
 * different question with a different answer at a different time, which is why
 * `assertPublicWebhookAddress` re-asks it at delivery.
 */
export function isPubliclyRoutableAddress(host: string): boolean {
  const literal = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(literal);
  if (v4) {
    const octets = v4.slice(1, 5).map(Number);
    if (octets.some((octet) => !Number.isInteger(octet) || octet > 255)) return false;
    const [a, b] = octets as [number, number, number, number];
    if (a === 0) return false; // 0.0.0.0/8 — routes to loopback on Linux.
    if (a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false; // link-local, incl. 169.254.169.254.
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT.
    if (a === 192 && b === 0) return false; // 192.0.0.0/24 protocol assignments.
    if (a >= 224) return false; // multicast and reserved.
    return true;
  }
  if (!literal.includes(':')) return true;
  const v6 = literal.toLocaleLowerCase().split('%')[0]!;
  if (v6 === '::' || v6 === '::1') return false;
  if (v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) {
    return false; // fe80::/10 link-local.
  }
  if (/^f[cd]/u.test(v6)) return false; // fc00::/7 unique-local.
  // IPv4-mapped and IPv4-compatible forms carry a v4 address inside a v6 one.
  const embedded = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/u.exec(v6);
  if (embedded) return isPubliclyRoutableAddress(embedded[1]!);
  return true;
}

export function isSafeWebhookEndpointUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      (url.port && url.port !== '443')
    ) {
      return false;
    }
    const host = url.hostname.toLocaleLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
      return false;
    if (METADATA_HOSTNAMES.has(host)) return false;
    if (!isPubliclyRoutableAddress(host)) return false;
    return Boolean(host.includes('.'));
  } catch {
    return false;
  }
}
