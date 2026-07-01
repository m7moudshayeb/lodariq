import { useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import {
  Activity,
  AuthoringButton,
  AuthoringPopover,
  Eye,
  MoreHorizontal,
  MousePointer2,
  Trash2,
} from '../design-system';
import type { DocumentTarget, LocalAuthoringFrameSnapshot, TargetInspectionState } from '../types';
import {
  targetById,
  targetHealthDetails,
  targetHealthTitle,
  targetSupportDetails,
} from '../utils';

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
  const statusText = inspection ? targetHealthTitle(inspection.diagnostic.state) : 'Needs check';

  return (
    <div className={`target-control ${status}`.trim()}>
      <AuthoringPopover
        align="center"
        content={
          <div className="target-menu">
            <div className="target-menu-header">
              <span>Step placement</span>
              <strong title={targetLabel}>{targetLabel}</strong>
            </div>
            <div className="target-menu-actions">
              <AuthoringButton
                aria-label="Show placement on page"
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
                  <strong>Show on page</strong>
                  <small>Highlight where this step appears</small>
                </span>
              </AuthoringButton>
              <AuthoringButton
                aria-label="Change placement"
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
                  <strong>Change placement</strong>
                  <small>Pick a different place for this step</small>
                </span>
              </AuthoringButton>
              <AuthoringButton
                aria-label="Check placement"
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
                  <strong>Check placement</strong>
                  <small>Make sure this place is still available</small>
                </span>
              </AuthoringButton>
              <AuthoringButton
                aria-label="View placement matching details"
                className="target-menu-action"
                data-action="target-advanced"
                data-block-id={block.id}
                data-target-id={targetId}
                icon={<Activity size={14} strokeWidth={2.2} />}
                onClick={() => controller.toggleTargetAdvanced(targetId)}
              >
                <span className="target-action-copy">
                  <strong>Matching details</strong>
                  <small>Use when this step cannot find its place</small>
                </span>
              </AuthoringButton>
              <AuthoringButton
                aria-label="Remove placement"
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
                  <strong>Remove placement</strong>
                  <small>Detach this step from the page</small>
                </span>
              </AuthoringButton>
            </div>
            <TargetHealth inspection={inspection} />
            {advancedOpen && target ? (
              <section className="target-advanced" aria-label="Placement matching details">
                <strong>Matching details</strong>
                {inspection ? <span>{targetSupportDetails(inspection)}</span> : null}
                <dl>
                  {anchorSupportRows(target).map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
          </div>
        }
        contentClassName="target-popover"
        onOpenChange={setMenuOpen}
        open={menuOpen}
        trigger={
          <AuthoringButton
            aria-label={`Placement ${targetLabel} actions`}
            className="target-menu-trigger target-combo-trigger"
            title={`Placement: ${targetLabel}`}
          >
            <span className="target-chip">
              <MousePointer2 className="target-chip-icon" size={13} strokeWidth={2.3} />
              <span className="target-chip-label">{targetLabel}</span>
              <span className="target-chip-status">{statusText}</span>
            </span>
            <MoreHorizontal className="target-chip-more" size={15} strokeWidth={2.2} />
          </AuthoringButton>
        }
      />
    </div>
  );
}

function anchorSupportRows(target: DocumentTarget): Array<{
  label: string;
  value: string;
}> {
  const fingerprint = target.fingerprint;
  const landmarks = fingerprint.ancestorLandmarks
    ?.map((item) => [item.role, item.accessibleName].filter(Boolean).join(' '))
    .filter(Boolean);
  const landmark = landmarks?.[landmarks.length - 1];
  const nearbyText = fingerprint.nearbyText?.find((item) => item.trim())?.trim();
  return [
    {
      label: 'Page label',
      value: fingerprint.accessibleName ?? fingerprint.label ?? 'Not named',
    },
    { label: 'Item type', value: fingerprint.role ?? fingerprint.tagName.toLowerCase() },
    {
      label: 'Visible cue',
      value: fingerprint.title ?? fingerprint.placeholder ?? nearbyText ?? 'None found',
    },
    { label: 'Page area', value: landmark ?? 'Current page' },
  ];
}

function TargetHealth({ inspection }: { inspection: TargetInspectionState | undefined }) {
  if (!inspection) {
    return (
      <p className="target-health target-health-empty">
        <strong>Placement check</strong>
        Check this placement before publishing.
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
