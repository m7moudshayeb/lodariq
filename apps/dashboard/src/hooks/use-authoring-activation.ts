'use client';

import { useMutation } from '@tanstack/react-query';
import {
  approveAuthoringActivation,
  inspectAuthoringActivation,
} from '../lib/client-authoring-activation-api';
export type { PendingActivation } from '../lib/client-authoring-activation-api';

export function useAuthoringActivation() {
  const inspect = useMutation({ mutationFn: inspectAuthoringActivation });
  const approve = useMutation({ mutationFn: approveAuthoringActivation });
  return { inspect, approve };
}
