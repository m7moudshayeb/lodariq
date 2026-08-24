import { Type, type Static } from '@sinclair/typebox';

export const DATA_RESIDENCY_REGIONS = ['us', 'eu', 'apac'] as const;
export type DataResidencyRegion = (typeof DATA_RESIDENCY_REGIONS)[number];

export const DATA_RESIDENCY_MIGRATION_STATUSES = [
  'requested',
  'copying',
  'verifying',
  'cutover-ready',
  'completed',
  'failed',
  'cancelled',
] as const;
export type DataResidencyMigrationStatus = (typeof DATA_RESIDENCY_MIGRATION_STATUSES)[number];

const Identifier = Type.String({
  minLength: 1,
  maxLength: 256,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$',
});
const Timestamp = Type.String({ minLength: 20, maxLength: 40, format: 'date-time' });

function regionVariants() {
  return DATA_RESIDENCY_REGIONS.map((region) => Type.Literal(region));
}

function migrationStatusVariants() {
  return DATA_RESIDENCY_MIGRATION_STATUSES.map((status) => Type.Literal(status));
}

export const DataResidencyRegion = Type.Union(regionVariants(), {
  $id: 'DataResidencyRegion',
});

export const WorkspaceDataPlacement = Type.Object(
  {
    workspaceId: Identifier,
    region: Type.Ref(DataResidencyRegion),
    generation: Type.Integer({ minimum: 0 }),
    activeMigrationId: Type.Union([Identifier, Type.Null()]),
    updatedAt: Timestamp,
  },
  { $id: 'WorkspaceDataPlacement', additionalProperties: false },
);
export type WorkspaceDataPlacement = Static<typeof WorkspaceDataPlacement>;

export const DataResidencyMigration = Type.Object(
  {
    id: Identifier,
    workspaceId: Identifier,
    sourceRegion: Type.Ref(DataResidencyRegion),
    targetRegion: Type.Ref(DataResidencyRegion),
    status: Type.Union(migrationStatusVariants()),
    expectedPlacementGeneration: Type.Integer({ minimum: 0 }),
    idempotencyKey: Type.String({
      minLength: 8,
      maxLength: 200,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$',
    }),
    requestedByUserId: Identifier,
    failureCode: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  },
  { $id: 'DataResidencyMigration', additionalProperties: false },
);
export type DataResidencyMigration = Static<typeof DataResidencyMigration>;

export const WorkspaceDataResidencyState = Type.Object(
  {
    placement: Type.Ref(WorkspaceDataPlacement),
    migration: Type.Union([Type.Ref(DataResidencyMigration), Type.Null()]),
  },
  { $id: 'WorkspaceDataResidencyState', additionalProperties: false },
);
export type WorkspaceDataResidencyState = Static<typeof WorkspaceDataResidencyState>;

export const RequestDataResidencyMigration = Type.Object(
  {
    targetRegion: Type.Ref(DataResidencyRegion),
    expectedPlacementGeneration: Type.Integer({ minimum: 0 }),
  },
  { $id: 'RequestDataResidencyMigration', additionalProperties: false },
);
export type RequestDataResidencyMigration = Static<typeof RequestDataResidencyMigration>;

const ALLOWED_DATA_RESIDENCY_TRANSITIONS = {
  requested: ['copying', 'failed', 'cancelled'],
  copying: ['verifying', 'failed'],
  verifying: ['cutover-ready', 'failed'],
  'cutover-ready': ['completed', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
} as const satisfies Readonly<
  Record<DataResidencyMigrationStatus, readonly DataResidencyMigrationStatus[]>
>;

export function canTransitionDataResidencyMigration(
  from: DataResidencyMigrationStatus,
  to: DataResidencyMigrationStatus,
): boolean {
  const allowed: readonly DataResidencyMigrationStatus[] = ALLOWED_DATA_RESIDENCY_TRANSITIONS[from];
  return allowed.includes(to);
}

export function dataResidencyRouteKey(region: DataResidencyRegion): string {
  return `primary-${region}`;
}
