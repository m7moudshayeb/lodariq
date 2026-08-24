import { useEffect, useRef } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from './controller';
import { targetIdOf } from './utils';

/**
 * Asks the ledger to look at every step's target once.
 *
 * The ledger only records explicit inspections, so a surface that reads health
 * without requesting it reports "we have not looked" as "we looked and failed".
 * Asked-for ids are remembered because a request changes the snapshot, and
 * re-reading health from the new one would ask again before the answer landed.
 */
export function useTargetInspections(
  controller: LocalAuthoringFrameController,
  steps: readonly LodariqBlock[],
): void {
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const step of steps) {
      const targetId = targetIdOf(step);
      if (!targetId || asked.current.has(targetId)) continue;
      asked.current.add(targetId);
      controller.requestTargetInspection(step.id, targetId, 'health');
    }
  }, [controller, steps]);
}
