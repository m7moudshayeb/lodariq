import { Type, type Static } from '@sinclair/typebox';
import { TenantAuditEvent } from './tenant-administration';

export const AuthoringAuditEvent = Type.Object(
  {
    ...TenantAuditEvent.properties,
    actorName: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
    targetName: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
  },
  { $id: 'AuthoringAuditEvent', additionalProperties: false },
);
export type AuthoringAuditEvent = Static<typeof AuthoringAuditEvent>;

export const AuthoringAuditEventList = Type.Object(
  { events: Type.Array(Type.Ref(AuthoringAuditEvent), { maxItems: 10_000 }) },
  { $id: 'AuthoringAuditEventList', additionalProperties: false },
);
export type AuthoringAuditEventList = Static<typeof AuthoringAuditEventList>;
