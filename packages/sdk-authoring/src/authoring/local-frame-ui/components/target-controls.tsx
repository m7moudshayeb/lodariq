import { useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import {
  Activity,
  AuthoringButton,
  AuthoringPopover,
  Braces,
  Eye,
  MoreHorizontal,
  MousePointer2,
  Trash2,
} from '../design-system';
import type { LocalAuthoringFrameSnapshot, TargetInspectionState } from '../types';
import { targetById, targetHealthDetails, targetHealthTitle } from '../utils';

export function TargetControls({
  block,
  targetId,
  targetLabel,
  snapshot,
  controller,
}: {
  block: LodariqBlock;
  targetId: string;
  targetLabel: string;
  snapshot: LocalAuthoringFrameSnapshot;
  controller: LocalAuthoringFrameController;
}) {
  const inspection = snapshot.targetDiagnostics.get(targetId);
  const target = targetById(snapshot.documentState, targetId);
  const advancedOpen = snapshot.advancedTargetIds.has(targetId);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = (): void => setMenuOpen(false);
  const status = inspection?.diagnostic.state ?? 'unchecked';
  const statusText = inspection ? targetHealthTitle(inspection.diagnostic.state) : 'Not checked';

  return (
    <div className={`target-control ${status}`.trim()}>
      <span className="target-chip" title={targetId}>
        <span className="target-chip-label">{targetLabel}</span>
        <span className="target-chip-status">{statusText}</span>
      </span>
      <AuthoringPopover
        align="start"
        content={
          <div className="target-menu">
            <div className="target-menu-header">
              <span>Attached target</span>
              <strong title={targetLabel}>{targetLabel}</strong>
            </div>
            <div className="target-menu-actions">
              <AuthoringButton
                aria-label="View target"
                className="target-menu-action target-menu-action-featured"
                data-action="target-view"
                data-block-id={block.id}
                data-target-id={targetId}
                icon={<Eye size={14} strokeWidth={2.2} />}
                onClick={() => {
                  closeMenu();
                  controller.requestTargetInspection(block.id, targetId, 'view');
                }}
              >
                <span className="target-action-copy">
                  <strong>View target</strong>
                  <small>Highlight it on the page</small>
                </span>
              </AuthoringButton>
              <AuthoringButton
                aria-label="Change target"
                className="target-menu-action"
                data-action="target-change"
                data-block-id={block.id}
                data-target-id={targetId}
                icon={<MousePointer2 size={14} strokeWidth={2.2} />}
                onClick={() => {
                  closeMenu();
                  controller.startTargetPick(block.id);
                }}
              >
                <span className="target-action-copy">
                  <strong>Change target</strong>
                  <small>Pick a different product element</small>
                </span>
              </AuthoringButton>
              <AuthoringButton
                aria-label="Test target"
                className="target-menu-action"
                data-action="target-test"
                data-block-id={block.id}
                data-target-id={targetId}
                icon={<Activity size={14} strokeWidth={2.2} />}
                onClick={() => {
                  closeMenu();
                  controller.requestTargetInspection(block.id, targetId, 'test');
                }}
              >
                <span className="target-action-copy">
                  <strong>Test target</strong>
                  <small>Check whether it can be found now</small>
                </span>
              </AuthoringButton>
              <AuthoringButton
                aria-label="Target health"
                className="target-menu-action"
                data-action="target-health"
                data-block-id={block.id}
                data-target-id={targetId}
                icon={<Activity size={14} strokeWidth={2.2} />}
                onClick={() => {
                  closeMenu();
                  controller.requestTargetInspection(block.id, targetId, 'health');
                }}
              >
                <span className="target-action-copy">
                  <strong>Target health</strong>
                  <small>Inspect resolver confidence</small>
                </span>
              </AuthoringButton>
              <AuthoringButton
                aria-label="Advanced details"
                className="target-menu-action"
                data-action="target-advanced"
                data-block-id={block.id}
                data-target-id={targetId}
                icon={<Braces size={14} strokeWidth={2.2} />}
                onClick={() => controller.toggleTargetAdvanced(targetId)}
              >
                <span className="target-action-copy">
                  <strong>Advanced details</strong>
                  <small>Show fingerprint diagnostics</small>
                </span>
              </AuthoringButton>
              <AuthoringButton
                aria-label="Remove target"
                className="target-menu-action target-menu-action-danger"
                data-action="target-remove"
                data-block-id={block.id}
                data-target-id={targetId}
                icon={<Trash2 size={14} strokeWidth={2.2} />}
                onClick={() => {
                  closeMenu();
                  controller.removeTargetFromBlock(block.id, targetId);
                }}
                tone="danger"
              >
                <span className="target-action-copy">
                  <strong>Remove target</strong>
                  <small>Detach this block from the page</small>
                </span>
              </AuthoringButton>
            </div>
            <TargetHealth inspection={inspection} />
            {advancedOpen && target ? (
              <pre className="target-advanced" aria-label="Target advanced details">
                {JSON.stringify(target.fingerprint, null, 2)}
              </pre>
            ) : null}
          </div>
        }
        contentClassName="target-popover"
        onOpenChange={setMenuOpen}
        open={menuOpen}
        trigger={
          <AuthoringButton
            aria-label={`Target ${targetLabel} actions`}
            className="target-menu-trigger"
            icon={<MoreHorizontal size={15} strokeWidth={2.2} />}
          />
        }
      />
    </div>
  );
}

function TargetHealth({ inspection }: { inspection: TargetInspectionState | undefined }) {
  if (!inspection) {
    return (
      <p className="target-health target-health-empty">
        <strong>Target health</strong>
        Not checked yet
      </p>
    );
  }

  return (
    <p className={`target-health ${inspection.diagnostic.state}`}>
      <strong>{targetHealthTitle(inspection.diagnostic.state)}</strong>
      {targetHealthDetails(inspection)}
    </p>
  );
}
