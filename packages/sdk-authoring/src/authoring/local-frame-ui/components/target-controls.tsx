import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import {
  Activity,
  AuthoringButton,
  AuthoringPopover,
  AuthoringSelect,
  AuthoringTabs,
  Eye,
  MoreHorizontal,
  MousePointer2,
  Trash2,
} from '../design-system';
import {
  TARGET_LIFECYCLE_SCROLL_OPTIONS,
  type DocumentTarget,
  type LocalAuthoringFrameSnapshot,
  type TargetInspectionState,
} from '../types';
import { targetById, targetHealthDetails, targetHealthTitle, targetSupportDetails } from '../utils';

type TargetMenuTab = 'placement' | 'behavior' | 'details';

const TARGET_MENU_TAB_VALUES = new Set<string>(['placement', 'behavior', 'details']);

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TargetMenuTab>('placement');
  const closeMenu = (): void => setMenuOpen(false);
  const updateMenuOpen = (open: boolean): void => {
    setMenuOpen(open);
    if (open) setActiveTab('placement');
  };
  const status = inspection?.diagnostic.state ?? 'unchecked';
  const statusText = inspection ? targetHealthTitle(inspection.diagnostic.state) : 'Needs check';
  const lifecycle = target?.lifecycle ?? {};
  const openPanelEnabled = Boolean(lifecycle.openPanel);
  const selectTabEnabled = Boolean(lifecycle.selectTab);

  return (
    <div className={`target-control ${status}`.trim()}>
      <AuthoringPopover
        align="center"
        content={
          <div className="target-menu">
            <div className="target-menu-header">
              <span className="target-menu-eyebrow">Target</span>
              <strong title={targetLabel}>{targetLabel}</strong>
              <span className={`target-menu-status ${status}`.trim()}>{statusText}</span>
            </div>
            <AuthoringTabs
              ariaLabel="Placement settings"
              defaultValue="placement"
              items={[
                {
                  label: 'Find',
                  value: 'placement',
                  content: (
                    <section className="target-menu-panel" aria-label="Placement actions">
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
                          Highlight
                        </AuthoringButton>
                        <AuthoringButton
                          aria-label="Try target click"
                          className="target-menu-action"
                          data-action="target-test"
                          data-block-id={block.id}
                          data-target-id={targetId}
                          icon={<Activity size={14} strokeWidth={2.2} />}
                          onClick={() => {
                            controller.requestTargetInspection(block.id, targetId, 'test');
                          }}
                        >
                          Try click
                        </AuthoringButton>
                        <AuthoringButton
                          aria-label="Check placement"
                          className="target-menu-action"
                          data-action="target-health"
                          data-block-id={block.id}
                          data-target-id={targetId}
                          icon={<Activity size={14} strokeWidth={2.2} />}
                          onClick={() => {
                            controller.requestTargetInspection(block.id, targetId, 'health');
                          }}
                        >
                          Run check
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
                          Change
                        </AuthoringButton>
                      </div>
                      <TargetHealth inspection={inspection} />
                      <div className="target-menu-secondary-actions">
                        <AuthoringButton
                          aria-label="View placement matching details"
                          className="target-secondary-action"
                          data-action="target-advanced"
                          data-block-id={block.id}
                          data-target-id={targetId}
                          onClick={() => setActiveTab('details')}
                          tone="ghost"
                        >
                          Debug
                        </AuthoringButton>
                        <AuthoringButton
                          aria-label="Remove placement"
                          className="target-secondary-action target-secondary-action-danger"
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
                          Remove
                        </AuthoringButton>
                      </div>
                    </section>
                  ),
                },
                {
                  label: 'Conditions',
                  value: 'behavior',
                  content: target ? (
                    <section className="target-lifecycle" aria-label="Placement lifecycle">
                      <div className="target-lifecycle-header">
                        <strong>Find conditions</strong>
                        <span>{lifecycleSummary(lifecycle)}</span>
                      </div>
                      <label className="target-lifecycle-field">
                        <span>Wait until text appears</span>
                        <WaitForTextField
                          controller={controller}
                          targetId={targetId}
                          value={lifecycle.waitForText ?? ''}
                        />
                      </label>
                      <label className="target-lifecycle-field">
                        <span>Scroll into view</span>
                        <AuthoringSelect
                          ariaLabel="Scroll behavior"
                          dataAction="set-lifecycle-scroll"
                          dataBlockId={block.id}
                          onValueChange={(value) =>
                            controller.setTargetScrollStrategy(targetId, value)
                          }
                          options={TARGET_LIFECYCLE_SCROLL_OPTIONS}
                          value={lifecycle.scrollStrategy ?? ''}
                        />
                      </label>
                      <div className="target-lifecycle-control-group">
                        <span>Click first</span>
                        <div className="target-lifecycle-actions">
                          <AuthoringButton
                            aria-label={
                              openPanelEnabled ? 'Clear panel opener' : 'Use as panel opener'
                            }
                            aria-pressed={openPanelEnabled}
                            className={`target-lifecycle-action ${
                              openPanelEnabled ? 'selected' : ''
                            }`.trim()}
                            data-action="set-lifecycle-open-panel"
                            data-target-id={targetId}
                            icon={<Activity size={14} strokeWidth={2.2} />}
                            onClick={() =>
                              controller.setTargetLifecycleControl(
                                targetId,
                                'openPanel',
                                !openPanelEnabled,
                              )
                            }
                          >
                            Open panel first
                          </AuthoringButton>
                          <AuthoringButton
                            aria-label={
                              selectTabEnabled ? 'Clear tab selector' : 'Use as tab selector'
                            }
                            aria-pressed={selectTabEnabled}
                            className={`target-lifecycle-action ${
                              selectTabEnabled ? 'selected' : ''
                            }`.trim()}
                            data-action="set-lifecycle-select-tab"
                            data-target-id={targetId}
                            icon={<Activity size={14} strokeWidth={2.2} />}
                            onClick={() =>
                              controller.setTargetLifecycleControl(
                                targetId,
                                'selectTab',
                                !selectTabEnabled,
                              )
                            }
                          >
                            Select tab first
                          </AuthoringButton>
                        </div>
                      </div>
                    </section>
                  ) : (
                    <p className="target-health target-health-empty">Choose a placement first.</p>
                  ),
                },
                {
                  label: 'Debug',
                  value: 'details',
                  content: target ? (
                    <section className="target-advanced" aria-label="Placement matching details">
                      <strong>Debug data</strong>
                      <span>
                        {inspection ? targetSupportDetails(inspection) : 'Not checked yet'}
                      </span>
                      <dl>
                        {anchorSupportRows(target).map((row) => (
                          <div key={row.label}>
                            <dt>{row.label}</dt>
                            <dd>{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ) : (
                    <p className="target-health target-health-empty">No placement details.</p>
                  ),
                },
              ]}
              onValueChange={(value) => setActiveTab(targetMenuTabValue(value))}
              value={activeTab}
            />
          </div>
        }
        contentClassName="target-popover"
        onOpenChange={updateMenuOpen}
        open={menuOpen}
        portal
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

function targetMenuTabValue(value: string): TargetMenuTab {
  return TARGET_MENU_TAB_VALUES.has(value) ? (value as TargetMenuTab) : 'placement';
}

function WaitForTextField({
  controller,
  targetId,
  value,
}: {
  controller: LocalAuthoringFrameController;
  targetId: string;
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input?.ownerDocument.activeElement === input) return;
    if (input && input.value !== value) input.value = value;
  }, [value]);

  const commitDraft = (): void => {
    const input = inputRef.current;
    const draft = input?.value ?? '';
    const nextValue = draft.trim();
    if (input && input.value !== nextValue) input.value = nextValue;
    if (nextValue !== value) controller.setTargetWaitForText(targetId, nextValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.currentTarget.value = value;
  };

  return (
    <input
      ref={inputRef}
      aria-label="Wait for text"
      data-action="set-lifecycle-wait-text"
      data-target-id={targetId}
      onBlur={commitDraft}
      onKeyDown={handleKeyDown}
      placeholder="Projects loaded"
      type="text"
      defaultValue={value}
    />
  );
}

function lifecycleSummary(lifecycle: DocumentTarget['lifecycle'] | undefined): string {
  const active = [
    lifecycle?.waitForText ? 'text' : '',
    lifecycle?.scrollStrategy ? 'scroll' : '',
    lifecycle?.openPanel ? 'panel' : '',
    lifecycle?.selectTab ? 'tab' : '',
  ].filter(Boolean);
  return active.length ? active.join(', ') : 'No extra conditions';
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
