import { Type, type Static, type TSchema } from '@sinclair/typebox';
import {
  ACCESSIBILITY_FINDING_CODES,
  ACCESSIBILITY_FINDING_SEVERITIES,
  ACCESSIBILITY_FINDING_STATUSES,
  ACCESSIBILITY_GOVERNANCE_CONTRACT_VERSION,
} from './accessibility-governance-runtime';

export {
  ACCESSIBILITY_FINDING_CODES,
  ACCESSIBILITY_FINDING_LABELS,
  ACCESSIBILITY_FINDING_SEVERITIES,
  ACCESSIBILITY_FINDING_STATUSES,
  ACCESSIBILITY_GOVERNANCE_CONTRACT_VERSION,
} from './accessibility-governance-runtime';

const Identifier = Type.String({ minLength: 1, maxLength: 256 });
const NullableIdentifier = Type.Union([Identifier, Type.Null()]);
const NullableHash = Type.Union([Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }), Type.Null()]);

export const AccessibilityFindingCode = Type.Union(
  ACCESSIBILITY_FINDING_CODES.map((code) => Type.Literal(code)),
  { $id: 'AccessibilityFindingCode' },
);
export type AccessibilityFindingCode = Static<typeof AccessibilityFindingCode>;

export const AccessibilityFindingSeverity = Type.Union(
  ACCESSIBILITY_FINDING_SEVERITIES.map((severity) => Type.Literal(severity)),
  { $id: 'AccessibilityFindingSeverity' },
);
export type AccessibilityFindingSeverity = Static<typeof AccessibilityFindingSeverity>;

export const AccessibilityFindingStatus = Type.Union(
  ACCESSIBILITY_FINDING_STATUSES.map((status) => Type.Literal(status)),
  { $id: 'AccessibilityFindingStatus' },
);
export type AccessibilityFindingStatus = Static<typeof AccessibilityFindingStatus>;

export const AccessibilitySweep = Type.Object(
  {
    schemaVersion: Type.Literal(ACCESSIBILITY_GOVERNANCE_CONTRACT_VERSION),
    id: Identifier,
    status: Type.Literal('completed'),
    requestedByUserId: Identifier,
    documentCount: Type.Integer({ minimum: 0 }),
    localeCount: Type.Integer({ minimum: 0 }),
    blockerCount: Type.Integer({ minimum: 0 }),
    warningCount: Type.Integer({ minimum: 0 }),
    startedAt: Type.String({ format: 'date-time' }),
    completedAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'AccessibilitySweep', additionalProperties: false },
);
export type AccessibilitySweep = Static<typeof AccessibilitySweep>;

export const AccessibilityFinding = Type.Object(
  {
    schemaVersion: Type.Literal(ACCESSIBILITY_GOVERNANCE_CONTRACT_VERSION),
    id: Identifier,
    sweepId: Identifier,
    documentId: Identifier,
    documentVersionId: Identifier,
    artifactId: NullableIdentifier,
    contentHash: NullableHash,
    code: Type.Ref(AccessibilityFindingCode),
    severity: Type.Ref(AccessibilityFindingSeverity),
    status: Type.Ref(AccessibilityFindingStatus),
    locale: Type.String({ minLength: 1, maxLength: 64 }),
    stepId: NullableIdentifier,
    nodeId: NullableIdentifier,
    measuredRatio: Type.Union([Type.Number({ minimum: 1, maximum: 21 }), Type.Null()]),
    requiredRatio: Type.Union([Type.Number({ minimum: 1, maximum: 21 }), Type.Null()]),
    revision: Type.Integer({ minimum: 1 }),
    resolvedByUserId: NullableIdentifier,
    resolutionNote: Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]),
    resolvedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'AccessibilityFinding', additionalProperties: false },
);
export type AccessibilityFinding = Static<typeof AccessibilityFinding>;

export const AccessibilitySweepResult = Type.Object(
  {
    sweep: Type.Ref(AccessibilitySweep),
    findings: Type.Array(Type.Ref(AccessibilityFinding), { maxItems: 10_000 }),
  },
  { $id: 'AccessibilitySweepResult', additionalProperties: false },
);
export type AccessibilitySweepResult = Static<typeof AccessibilitySweepResult>;

export const AccessibilitySweepList = Type.Object(
  { sweeps: Type.Array(Type.Ref(AccessibilitySweep), { maxItems: 1_000 }) },
  { $id: 'AccessibilitySweepList', additionalProperties: false },
);

export const AccessibilityFindingList = Type.Object(
  { findings: Type.Array(Type.Ref(AccessibilityFinding), { maxItems: 10_000 }) },
  { $id: 'AccessibilityFindingList', additionalProperties: false },
);

export const AccessibilitySweepQuery = Type.Object(
  { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_000, default: 100 })) },
  { $id: 'AccessibilitySweepQuery', additionalProperties: false },
);
export type AccessibilitySweepQuery = Static<typeof AccessibilitySweepQuery>;

export const AccessibilityFindingQuery = Type.Object(
  {
    documentId: Type.Optional(Identifier),
    documentVersionId: Type.Optional(Identifier),
    sweepId: Type.Optional(Identifier),
    severity: Type.Optional(Type.Ref(AccessibilityFindingSeverity)),
    status: Type.Optional(Type.Ref(AccessibilityFindingStatus)),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000, default: 1_000 })),
  },
  { $id: 'AccessibilityFindingQuery', additionalProperties: false },
);
export type AccessibilityFindingQuery = Static<typeof AccessibilityFindingQuery>;

export const ResolveAccessibilityFindingRequest = Type.Object(
  {
    expectedRevision: Type.Integer({ minimum: 1 }),
    resolutionNote: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { $id: 'ResolveAccessibilityFindingRequest', additionalProperties: false },
);
export type ResolveAccessibilityFindingRequest = Static<typeof ResolveAccessibilityFindingRequest>;

export const RunAccessibilitySweepRequest = Type.Object(
  {
    operationId: Type.String({
      minLength: 8,
      maxLength: 200,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$',
    }),
  },
  { $id: 'RunAccessibilitySweepRequest', additionalProperties: false },
);
export type RunAccessibilitySweepRequest = Static<typeof RunAccessibilitySweepRequest>;

export const ACCESSIBILITY_GOVERNANCE_REFERENCE_SCHEMAS: TSchema[] = [
  AccessibilityFindingCode,
  AccessibilityFindingSeverity,
  AccessibilityFindingStatus,
  AccessibilitySweep,
  AccessibilityFinding,
];
export const ACCESSIBILITY_GOVERNANCE_SCHEMAS: TSchema[] = [
  AccessibilitySweepResult,
  AccessibilitySweepList,
  AccessibilityFindingList,
  AccessibilitySweepQuery,
  AccessibilityFindingQuery,
  ResolveAccessibilityFindingRequest,
  RunAccessibilitySweepRequest,
];
