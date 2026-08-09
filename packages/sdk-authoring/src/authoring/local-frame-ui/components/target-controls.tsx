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
  Focus,
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

type TargetMenuTab = 'behavior' | 'details';

const TARGET_MENU_TAB_VALUES = new Set<string>(['behavior', 'details']);

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
  const targetBlock = targetBearingBlock(block, targetId);
  const presentationAnchor = targetBlock?.props.presentationAnchor;
  const usesExactArea =
    presentationAnchor?.kind === 'point' || presentationAnchor?.kind === 'region';
  const [menuOpen, setMenuOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TargetMenuTab>('behavior');
  const closeMenu = (): void => setMenuOpen(false);
  const updateMenuOpen = (open: boolean): void => {
    setMenuOpen(open);
    if (open) {
      setAdvancedOpen(false);
      setActiveTab('behavior');
    }
  };
  const status = inspection?.diagnostic.state ?? 'unchecked';
  const statusText = inspection ? targetHealthTitle(inspection.diagnostic) : 'Unverified';
  const lifecycle = target?.lifecycle ?? {};
  const openPanelEnabled = Boolean(lifecycle.openPanel);
  const selectTabEnabled = Boolean(lifecycle.selectTab);

  return (
    <div className={`target-control ${status} ${usesExactArea ? 'exact-area' : ''}`.trim()}>
      <AuthoringPopover
        align="center"
        content={
          <div className="target-menu">
            <div className="target-menu-header">
              <span className="target-menu-eyebrow">Placement</span>
              <strong title={targetLabel}>{targetLabel}</strong>
              <span className={`target-menu-status ${status}`.trim()}>{statusText}</span>
            </div>
            <section className="target-menu-panel" aria-label="Placement actions">
              <div className="target-menu-actions">
                <AuthoringButton
                  aria-label="Show element on page"
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
                  Show on page
                </AuthoringButton>
                <AuthoringButton
                  aria-label="Choose another element"
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
                  Choose another
                </AuthoringButton>
                <AuthoringButton
                  aria-label={usesExactArea ? 'Use whole element' : 'Use exact area'}
                  className="target-menu-action target-menu-action-exact"
                  data-action={
                    usesExactArea ? 'presentation-anchor-reset' : 'presentation-anchor-pick'
                  }
                  data-block-id={block.id}
                  data-target-id={targetId}
                  icon={<Focus size={14} strokeWidth={2.2} />}
                  onClick={() => {
                    closeMenu();
                    if (usesExactArea) {
                      controller.useWholeElement(block.id, targetId);
                      return;
                    }
                    controller.startPresentationAnchorPick(block.id, targetId);
                  }}
                >
                  {usesExactArea ? 'Use whole element' : 'Use exact area'}
                </AuthoringButton>
              </div>
              {inspection && inspection.diagnostic.state !== 'found' ? (
                <TargetHealth inspection={inspection} />
              ) : null}
              <details
                className="target-menu-disclosure"
                onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
                open={advancedOpen}
              >
                <summary data-action="target-more-options">
                  <MoreHorizontal aria-hidden="true" size={15} strokeWidth={2.2} />
                  <span>More placement options</span>
                </summary>
                {advancedOpen ? (
                  <div className="target-menu-disclosure-content">
                    <AuthoringTabs
                      ariaLabel="More placement options"
                      defaultValue="behavior"
                      items={[
                        {
                          label: 'Before it appears',
                          value: 'behavior',
                          content: target ? (
                            <section
                              className="target-lifecycle"
                              aria-label="Before this element appears"
                            >
                              <div className="target-lifecycle-header">
                                <strong>Before this element appears</strong>
                                <span>{lifecycleSummary(lifecycle)}</span>
                              </div>
                              <label className="target-lifecycle-field">
                                <span>Wait for page text</span>
                                <WaitForTextField
                                  controller={controller}
                                  targetId={targetId}
                                  value={lifecycle.waitForText ?? ''}
                                />
                              </label>
                              <label className="target-lifecycle-field">
                                <span>Bring element into view</span>
                                <AuthoringSelect
                                  ariaLabel="How to bring the element into view"
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
                                <span>Open required UI first</span>
                                <div className="target-lifecycle-actions">
                                  <AuthoringButton
                                    aria-label={
                                      openPanelEnabled
                                        ? 'Do not open a panel first'
                                        : 'Open a panel first'
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
                                    Open a panel
                                  </AuthoringButton>
                                  <AuthoringButton
                                    aria-label={
                                      selectTabEnabled
                                        ? 'Do not select a tab first'
                                        : 'Select a tab first'
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
                                    Select a tab
                                  </AuthoringButton>
                                </div>
                              </div>
                            </section>
                          ) : (
                            <p className="target-health target-health-empty">
                              Choose an element first.
                            </p>
                          ),
                        },
                        {
                          label: 'Troubleshoot',
                          value: 'details',
                          content: (
                            <section
                              className="target-troubleshoot"
                              aria-label="Troubleshoot placement"
                            >
                              <div className="target-menu-actions">
                                <AuthoringButton
                                  aria-label="Check placement"
                                  className="target-menu-action"
                                  data-action="target-test"
                                  data-block-id={block.id}
                                  data-target-id={targetId}
                                  icon={<Activity size={14} strokeWidth={2.2} />}
                                  onClick={() =>
                                    controller.requestTargetInspection(block.id, targetId, 'test')
                                  }
                                >
                                  Check placement
                                </AuthoringButton>
                                <AuthoringButton
                                  aria-label="Verify placement again"
                                  className="target-menu-action"
                                  data-action="target-health"
                                  data-block-id={block.id}
                                  data-target-id={targetId}
                                  icon={<Activity size={14} strokeWidth={2.2} />}
                                  onClick={() =>
                                    controller.requestTargetInspection(block.id, targetId, 'health')
                                  }
                                >
                                  Verify again
                                </AuthoringButton>
                              </div>
                              <TargetHealth inspection={inspection} />
                              {target ? (
                                <details className="target-matching-details">
                                  <summary>Matching details</summary>
                                  <div
                                    className="target-advanced"
                                    aria-label="Placement matching details"
                                  >
                                    <span>
                                      {inspection
                                        ? targetSupportDetails(inspection)
                                        : 'Not checked yet'}
                                    </span>
                                    <dl>
                                      {anchorSupportRows(target).map((row) => (
                                        <div key={row.label}>
                                          <dt>{row.label}</dt>
                                          <dd>{row.value}</dd>
                                        </div>
                                      ))}
                                    </dl>
                                  </div>
                                </details>
                              ) : null}
                              <div className="target-menu-secondary-actions">
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
                                  Remove placement
                                </AuthoringButton>
                              </div>
                            </section>
                          ),
                        },
                      ]}
                      onValueChange={(value) => setActiveTab(targetMenuTabValue(value))}
                      value={activeTab}
                    />
                  </div>
                ) : null}
              </details>
            </section>
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
              {usesExactArea ? <span className="target-chip-anchor-mode">Exact area</span> : null}
              <span className="target-chip-status">{statusText}</span>
            </span>
            <MoreHorizontal className="target-chip-more" size={15} strokeWidth={2.2} />
          </AuthoringButton>
        }
      />
    </div>
  );
}

function targetBearingBlock(block: LodariqBlock, targetId: string): LodariqBlock | null {
  if (block.props.targetId === targetId) return block;
  for (const child of block.children) {
    const match = targetBearingBlock(child, targetId);
    if (match) return match;
  }
  return null;
}

function targetMenuTabValue(value: string): TargetMenuTab {
  return TARGET_MENU_TAB_VALUES.has(value) ? (value as TargetMenuTab) : 'behavior';
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
  const activeCount = [
    lifecycle?.waitForText,
    lifecycle?.scrollStrategy,
    lifecycle?.openPanel,
    lifecycle?.selectTab,
  ].filter(Boolean).length;
  if (!activeCount) return 'No extra setup';
  return `${activeCount} setup action${activeCount === 1 ? '' : 's'}`;
}

function anchorSupportRows(target: DocumentTarget): Array<{
  label: string;
  value: string;
}> {
  if (target.identity) {
    const localeCoverage = target.identity.localizedEvidence
      .map((evidence) => evidence.locale)
      .join(', ');
    return [
      {
        label: 'Element kind',
        value: target.identity.intent.elementKind,
      },
      {
        label: 'Identity evidence',
        value: target.identity.captureEvidence.stableSignalFamilies.join(', ') || 'None observed',
      },
      {
        label: 'Locale coverage',
        value: localeCoverage || 'No text dependency',
      },
      {
        label: 'Layout profiles',
        value: String(target.identity.visualTopologies?.length ?? 0),
      },
    ];
  }
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
    { label: 'Element type', value: fingerprint.role ?? fingerprint.tagName.toLowerCase() },
    {
      label: 'Nearby cue',
      value: fingerprint.title ?? fingerprint.placeholder ?? nearbyText ?? 'None found',
    },
    { label: 'Page area', value: landmark ?? 'Current page' },
  ];
}

function TargetHealth({ inspection }: { inspection: TargetInspectionState | undefined }) {
  if (!inspection) {
    return (
      <p className="target-health target-health-empty">
        <strong>Unverified</strong>
        Verify this placement on the current environment before publishing.
      </p>
    );
  }

  return (
    <p className={`target-health ${inspection.diagnostic.state}`}>
      <strong>{targetHealthTitle(inspection.diagnostic)}</strong>
      {targetHealthDetails(inspection)}
    </p>
  );
}
