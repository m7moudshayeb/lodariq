import { pgEnum, timestamp } from 'drizzle-orm/pg-core';

const environmentValues = ['development', 'staging', 'production'] as const;
const documentDeploymentStateValues = ['active', 'inactive'] as const;
const releaseActionValues = ['publish', 'promote', 'rollback', 'unpublish'] as const;
const releaseOperationStatusValues = [
  'awaiting_approval',
  'activating',
  'completed',
  'failed',
] as const;

export const environmentEnum = pgEnum('lodariq_environment', environmentValues);
export const documentDeploymentStateEnum = pgEnum(
  'lodariq_document_deployment_state',
  documentDeploymentStateValues,
);
export const releaseActionEnum = pgEnum('lodariq_release_action', releaseActionValues);
export const releaseOperationStatusEnum = pgEnum(
  'lodariq_release_operation_status',
  releaseOperationStatusValues,
);

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
