import { useMemo, useState } from 'react';
import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  resolveExperienceAppearance,
  type ExperienceAppearance,
  type RuntimeExperienceAppearance,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { AuthoringBrandRoleChange } from '../../local-frame-types';
import type { LocalAuthoringFrameController } from '../controller';
import {
  Check,
  ChevronRight,
  CircleCheck,
  LoaderCircle,
  LockKeyhole,
  Palette,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Wand2,
} from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { brandThemeOffer, type BrandVariantId } from '../../brand-theme-offer';
import { BrandDriftPanel } from './brand-drift';
import { BrandVariantChoice } from './brand-variant-choice';
import { PanelEmptyState, PanelFeedback, PanelModeShell } from './panel-mode-shell';

export function AppearanceMode({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const workflow = snapshot.panelWorkflow;
  const brand = workflow.brand;
  const appearance = resolveExperienceAppearance(
    snapshot.documentState.appearance ?? DEFAULT_EXPERIENCE_APPEARANCE,
  );
  const busy = workflow.operation === 'sampling-brand' || workflow.operation === 'applying-brand';
  const themeVersion =
    typeof brand.version === 'number'
      ? authoringText('Version {version}', { version: brand.version })
      : authoringText('Safe default');
  const bindingLabel =
    snapshot.documentState.themeBinding?.policy === 'pinned'
      ? authoringText('Pinned')
      : authoringText('Inherited');

  return (
    <PanelModeShell
      className="appearance-mode-shell"
      controller={controller}
      description={authoringText(
        'Start with the workspace theme, then keep only intentional differences.',
      )}
      eyebrow={authoringText('Appearance')}
      focusToken={workflow.focusToken}
      title={authoringText('Feel native to this product')}
    >
      <PanelFeedback error={workflow.error} notice={workflow.notice} />
      {snapshot.themeStale ? (
        <p className="appearance-theme-stale" role="status">
          <span>{authoringText('Theme updated — reload to see it')}</span>
          <button
            className="panel-mode-text-button"
            data-theme-reload
            onClick={() => controller.reloadTheme()}
            type="button"
          >
            <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
            {authoringText('Reload')}
          </button>
        </p>
      ) : null}
      <ol className="appearance-flow" aria-label={authoringText('Appearance setup')}>
        <li className="appearance-step completed" data-appearance-step="1">
          <span className="appearance-step-marker" aria-hidden="true">
            1
          </span>
          <div className="appearance-step-content">
            <div className="appearance-step-heading">
              <span className="appearance-step-heading-copy">
                <strong id="appearance-workspace-theme-title">
                  {authoringText('Workspace Brand theme')}
                </strong>
                <span className="appearance-step-pill inherited">{bindingLabel}</span>
              </span>
            </div>
            <section
              className="appearance-brand-row"
              aria-labelledby="appearance-workspace-theme-title brand-current-title"
            >
              <span className="appearance-brand-name">
                <span className="panel-mode-card-icon" aria-hidden="true">
                  <Palette size={16} strokeWidth={2.2} />
                </span>
                <strong id="brand-current-title">{brand.themeName}</strong>
              </span>
              <span className={`panel-status-pill ${brand.status}`}>{themeVersion}</span>
              <span className="appearance-brand-source">
                <CircleCheck size={17} strokeWidth={2.1} aria-hidden="true" />
                <span>
                  <strong>{brand.source.label}</strong>
                  {brand.source.revision ? (
                    <small>
                      {authoringText('Revision')} {brand.source.revision}
                    </small>
                  ) : null}
                </span>
              </span>
              <p className="panel-mode-help">{brand.source.detail}</p>
            </section>
          </div>
        </li>

        <li className="appearance-step completed" data-appearance-step="2">
          <span className="appearance-step-marker" aria-hidden="true">
            2
          </span>
          <div className="appearance-step-content">
            <div className="appearance-step-heading">
              <span className="appearance-step-heading-copy">
                <strong id="appearance-product-match-title">
                  {authoringText('Check and match product')}
                </strong>
                <span className="appearance-step-pill">{authoringText('Optional')}</span>
              </span>
            </div>

            <PanelFeedback error={workflow.brandDrift.error} notice={null} />
            <BrandDriftPanel
              acknowledging={workflow.brandDrift.operation === 'acknowledging'}
              checking={workflow.brandDrift.operation === 'checking'}
              previewActive={workflow.brandDrift.previewActive}
              previewing={workflow.brandDrift.operation === 'previewing'}
              previewMode={workflow.brandDrift.previewMode}
              model={workflow.brandDrift.model}
              onAcknowledge={() => controller.acknowledgeBrandTheme()}
              onCheck={() => controller.checkBrandDrift()}
              onPreviewCurrent={() => controller.previewCurrentBrandDrift()}
              onPreviewProposed={() => controller.previewProposedBrandDrift()}
              onReviewProposal={() => controller.reviewBrandDriftProposal()}
            />

            <div className="panel-mode-primary-actions appearance-match-actions">
              <button
                className="panel-mode-primary-button"
                disabled={busy || !brand.canEdit}
                onClick={() => controller.matchProductBrand('current-target')}
                type="button"
              >
                {busy ? (
                  <LoaderCircle className="tour-release-spinner" size={16} aria-hidden="true" />
                ) : (
                  <Wand2 size={16} strokeWidth={2.2} aria-hidden="true" />
                )}
                {busy ? authoringText('Matching product…') : authoringText('Match product')}
              </button>
              <button
                className="panel-mode-secondary-button"
                disabled={busy || !brand.canEdit}
                onClick={() => controller.matchProductBrand('select-element')}
                type="button"
              >
                <ScanSearch size={16} strokeWidth={2.2} aria-hidden="true" />
                {authoringText('Use this element’s look')}
              </button>
            </div>
            {!brand.canEdit ? (
              <p className="panel-mode-inline-note appearance-match-note">
                <LockKeyhole size={14} strokeWidth={2.1} aria-hidden="true" />
                <span>
                  {authoringText(
                    'Product matching becomes available in an authenticated authoring session with Brand edit access.',
                  )}
                </span>
              </p>
            ) : null}
          </div>
        </li>

        <li className="appearance-step current" data-appearance-step="3">
          <span className="appearance-step-marker" aria-hidden="true">
            3
          </span>
          <div className="appearance-step-content">
            <div className="appearance-step-heading appearance-step-heading-with-action">
              <span>
                <span className="appearance-step-heading-copy">
                  <strong id="appearance-experience-title">
                    {authoringText('Adjust this experience only')}
                  </strong>
                  <span className="appearance-step-pill">{authoringText('Optional')}</span>
                </span>
                <span className="appearance-step-summary">{appearanceSummary(appearance)}</span>
              </span>
              <button
                className="panel-mode-text-button appearance-reset-button"
                onClick={() => controller.setDocumentAppearance(DEFAULT_EXPERIENCE_APPEARANCE)}
                type="button"
              >
                <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                {authoringText('Reset')}
              </button>
            </div>
            <div className="appearance-overrides-grid">
              <AppearanceChoiceGroup
                label={authoringText('Style')}
                options={APPEARANCE_PRESET_OPTIONS}
                value={appearance.preset}
                onChange={(preset) => controller.setDocumentAppearance({ ...appearance, preset })}
              />
              <AppearanceChoiceGroup
                label={authoringText('Density')}
                options={APPEARANCE_DENSITY_OPTIONS}
                value={appearance.density}
                onChange={(density) => controller.setDocumentAppearance({ ...appearance, density })}
              />
              <AppearanceChoiceGroup
                label={authoringText('Width')}
                options={APPEARANCE_WIDTH_OPTIONS}
                value={appearance.width}
                onChange={(width) => controller.setDocumentAppearance({ ...appearance, width })}
              />
              <AppearanceChoiceGroup
                label={authoringText('Mode')}
                options={APPEARANCE_MODE_OPTIONS}
                value={appearance.colorMode}
                onChange={(colorMode) =>
                  controller.setDocumentAppearance({ ...appearance, colorMode })
                }
              />
              <AppearanceChoiceGroup
                label={authoringText('Display target outline')}
                options={APPEARANCE_TARGET_OUTLINE_OPTIONS}
                value={appearance.displayTargetOutline}
                onChange={(displayTargetOutline) =>
                  controller.setDocumentAppearance({ ...appearance, displayTargetOutline })
                }
              />
            </div>
          </div>
        </li>
      </ol>
    </PanelModeShell>
  );
}

export function BrandMatchReviewMode({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const workflow = snapshot.panelWorkflow;
  const proposal = workflow.brandProposal;
  const busy = workflow.operation === 'applying-brand' || workflow.operation === 'sampling-brand';
  const offer = useMemo(
    () => (proposal ? brandThemeOffer(proposal.evidence) : null),
    [proposal?.evidence],
  );
  const [variant, setVariant] = useState<BrandVariantId>('blended');

  return (
    <PanelModeShell
      controller={controller}
      eyebrow={authoringText('Brand match')}
      focusToken={workflow.focusToken}
      title={authoringText('Review meaningful changes')}
    >
      <PanelFeedback error={workflow.error} notice={workflow.notice} />
      {proposal ? (
        <>
          <section className="panel-mode-card brand-provenance-card">
            <div className="panel-mode-card-heading">
              <span className="panel-mode-card-icon" aria-hidden="true">
                <ScanSearch size={16} strokeWidth={2.2} />
              </span>
              <span>
                <small>{authoringText('Proposed from')}</small>
                <strong>{proposal.source.label}</strong>
              </span>
              <span className={`panel-confidence-pill ${proposal.confidence}`}>
                {confidenceLabel(proposal.confidence)}
              </span>
            </div>
            <p className="panel-mode-help">{proposal.confidenceReason}</p>
            {proposal.source.revision ? (
              <p className="panel-source-line">
                {authoringText('Source revision')} {proposal.source.revision}
              </p>
            ) : null}
          </section>

          {offer ? (
            <BrandVariantChoice chosen={variant} offer={offer} onChoose={setVariant} />
          ) : null}

          <section className="panel-mode-section" aria-labelledby="semantic-changes-title">
            <div className="panel-mode-section-heading">
              <span>
                <small>{authoringText('Before and after')}</small>
                <strong id="semantic-changes-title">{authoringText('Semantic roles only')}</strong>
              </span>
            </div>
            <div className="brand-change-list">
              {proposal.changes.map((change) => (
                <BrandRoleChange key={change.role} change={change} />
              ))}
            </div>
          </section>

          <div className="panel-mode-callout">
            <ShieldCheck size={16} strokeWidth={2.2} aria-hidden="true" />
            <p>
              {authoringText(
                'Raw CSS, selectors, class names, DOM snapshots, URLs, and coordinates are never saved as Brand data.',
              )}
            </p>
          </div>

          <div className="panel-mode-sticky-actions">
            <button
              className="panel-mode-primary-button"
              disabled={busy}
              onClick={() => controller.acceptBrandMatch(offer ? variant : undefined)}
              type="button"
            >
              {busy ? (
                <LoaderCircle className="tour-release-spinner" size={16} aria-hidden="true" />
              ) : (
                <Check size={16} strokeWidth={2.4} aria-hidden="true" />
              )}
              {busy ? authoringText('Saving proposal…') : authoringText('Use proposed draft')}
            </button>
            <button
              className="panel-mode-secondary-button"
              data-brand-variant="plain"
              disabled={busy}
              onClick={() => controller.startPlainBrandTheme()}
              type="button"
            >
              {authoringText('Start plain')}
            </button>
            <button
              className="panel-mode-secondary-button"
              disabled={busy}
              onClick={() => controller.chooseAnotherBrandSource()}
              type="button"
            >
              {authoringText('Choose another element')}
            </button>
          </div>
        </>
      ) : (
        <PanelEmptyState
          detail={authoringText(
            'Return to Appearance and choose Match product to create a safe semantic proposal.',
          )}
          title={authoringText('No Brand proposal to review')}
        />
      )}
    </PanelModeShell>
  );
}

function AppearanceChoiceGroup<TValue extends string | boolean>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: TValue) => void;
  options: ReadonlyArray<{ value: TValue; label: string }>;
  value: TValue;
}) {
  return (
    <fieldset className="appearance-choice-group">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={value === option.value ? 'selected' : ''}
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function BrandRoleChange({ change }: { change: AuthoringBrandRoleChange }) {
  return (
    <article className="brand-change-row">
      <span className="brand-change-label">{change.label}</span>
      <span className="brand-change-values">
        <span>
          <small>{authoringText('Before')}</small>
          <strong>{change.before}</strong>
        </span>
        <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
        <span>
          <small>{authoringText('Proposed')}</small>
          <strong>{change.after}</strong>
        </span>
      </span>
      {change.consequence ? (
        <small className="brand-change-consequence">{change.consequence}</small>
      ) : null}
    </article>
  );
}

function confidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
  if (confidence === 'high') return authoringText('High confidence');
  if (confidence === 'medium') return authoringText('Review source');
  return authoringText('Low confidence');
}

function appearanceSummary(appearance: RuntimeExperienceAppearance): string {
  const preset = APPEARANCE_PRESET_OPTIONS.find((option) => option.value === appearance.preset);
  const density = APPEARANCE_DENSITY_OPTIONS.find((option) => option.value === appearance.density);
  const width = APPEARANCE_WIDTH_OPTIONS.find((option) => option.value === appearance.width);
  const colorMode = APPEARANCE_MODE_OPTIONS.find((option) => option.value === appearance.colorMode);
  return [
    preset?.label,
    density?.label,
    width?.label,
    colorMode?.label,
    appearance.displayTargetOutline ? authoringText('Target outline') : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

const APPEARANCE_PRESET_OPTIONS = [
  { value: 'default' as const, label: authoringText('Brand') },
  { value: 'accent' as const, label: authoringText('Accent') },
  { value: 'inverse' as const, label: authoringText('Inverse') },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['preset']; label: string }>;

const APPEARANCE_DENSITY_OPTIONS = [
  { value: 'compact' as const, label: authoringText('Compact') },
  { value: 'comfortable' as const, label: authoringText('Comfortable') },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['density']; label: string }>;

const APPEARANCE_WIDTH_OPTIONS = [
  { value: 'narrow' as const, label: authoringText('Narrow') },
  { value: 'standard' as const, label: authoringText('Standard') },
  { value: 'wide' as const, label: authoringText('Wide') },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['width']; label: string }>;

const APPEARANCE_MODE_OPTIONS = [
  { value: 'system' as const, label: authoringText('System') },
  { value: 'light' as const, label: authoringText('Light') },
  { value: 'dark' as const, label: authoringText('Dark') },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['colorMode']; label: string }>;

const APPEARANCE_TARGET_OUTLINE_OPTIONS = [
  { value: false, label: authoringText('Off') },
  { value: true, label: authoringText('On') },
] satisfies ReadonlyArray<{
  value: NonNullable<ExperienceAppearance['displayTargetOutline']>;
  label: string;
}>;
