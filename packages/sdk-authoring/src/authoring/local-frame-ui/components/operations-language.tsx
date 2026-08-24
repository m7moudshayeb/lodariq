import { productCapabilityIsImplemented } from '@lodariq/schema/product-capabilities-runtime';
import { useEffect, useState, type ReactNode } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { contentLocaleLabel } from '../../content-locales';
import { ContentLocalePicker } from './experience-language-select';
import { localeCoverage, type LocaleCoverage } from '../../publish-check';
import { CircleAlert, Globe, Image, LoaderCircle, Plus, Wand2 } from '../design-system';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { buildOperationsCheckReport } from './operations-check-report';

const ADD_LOCALE_AVAILABLE = productCapabilityIsImplemented('authoring.add-locale');
const LOCALE_MEDIA_AVAILABLE = productCapabilityIsImplemented('authoring.locale-media');

/**
 * Operations → Language (§4.6).
 *
 * Targets are shared across locales, so what varies is text — which is why this
 * is a coverage table rather than a per-locale copy of the tour. One row per
 * language, how much of it is written, and the way into it.
 */
export function OperationsLanguage({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  const document = snapshot.canonicalDocumentState ?? snapshot.documentState;
  const defaultLocale = document.localization?.defaultLocale ?? 'en';
  const variants = document.localization?.variants ?? [];
  const coverage = localeCoverage(
    document,
    variants.map((variant) => variant.locale),
  );
  const behind = coverage.filter((row) => row.missing > 0);
  const translating = snapshot.translation.state === 'translating';
  const layoutReport = buildOperationsCheckReport(
    snapshot,
    document.blocks.filter((block) => block.type === 'tourStep'),
  );
  const configuredLocales = [defaultLocale, ...variants.map((variant) => variant.locale)];
  const usage = snapshot.commercialUsage;
  const autoTranslateEnabled = !usage || usage.features.includes('auto-translate');
  const localeLimit = usage?.locales.limit;
  const localeLimitReached =
    usage !== undefined &&
    localeLimit !== undefined &&
    localeLimit !== null &&
    usage.locales.used >= localeLimit;
  const mediaBlocks = collectMediaBlocks(document.blocks);

  return (
    <section className="operations-language" aria-label={authoringText('Language')}>
      <div className="ops-box">
        <h3>
          <Globe size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Languages')}
          <span className="ops-box-actions">
            {/*
              Picking a language the document does not have yet is how one is
              added: `mutableVariant` writes the variant on the first edit made
              while it is selected. This was a disabled button claiming it needed
              a control-plane write it never needed.
            */}
            <ContentLocalePicker
              className="ops-btn"
              controller={controller}
              disabled={!ADD_LOCALE_AVAILABLE || localeLimitReached}
              leadingIcon={<Plus size={13} strokeWidth={2.4} aria-hidden="true" />}
              onPick={(locale) => controller.addContentLocale(locale)}
              size="compact"
              snapshot={snapshot}
              title={
                localeLimitReached
                  ? authoringText('The workspace has reached its language limit.')
                  : undefined
              }
              triggerLabel={authoringText('Add a language')}
            />
            <button
              className="ops-btn"
              data-size="sm"
              data-variant="primary"
              disabled={
                !autoTranslateEnabled ||
                !snapshot.translation.available ||
                behind.length === 0 ||
                translating
              }
              onClick={() => void controller.translateMissingCopy()}
              title={draftTooltip(snapshot, behind.length, autoTranslateEnabled)}
              type="button"
            >
              {translating ? (
                <LoaderCircle size={13} aria-hidden="true" />
              ) : (
                <Wand2 size={13} strokeWidth={2} aria-hidden="true" />
              )}
              {translating
                ? authoringText('Drafting…')
                : authoringText('Draft every missing string')}
            </button>
          </span>
        </h3>

        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">{authoringText('Language')}</th>
              <th scope="col">{authoringText('Written')}</th>
              <th scope="col">{authoringText('Missing')}</th>
              <th scope="col">
                <span className="operations-language-actions-heading">
                  {authoringText('Actions')}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* The source is a row like any other, because it is the one every
                other row is measured against. It is never "missing" anything. */}
            <tr data-selected={snapshot.contentLocale === defaultLocale ? 'true' : 'false'}>
              <td className="ops-table-key">
                {localeLabel(defaultLocale)}
                <span className="ops-tag" data-tone="accent">
                  {authoringText('Source')}
                </span>
              </td>
              <td colSpan={2}>{authoringText('Everything is written here first.')}</td>
              <td className="operations-language-actions">
                {snapshot.contentLocale === defaultLocale ? (
                  <span className="ops-tag">{authoringText('Editing')}</span>
                ) : (
                  <button
                    className="ops-btn"
                    data-size="sm"
                    onClick={() => controller.setContentLocale(defaultLocale)}
                    type="button"
                  >
                    {authoringText('Switch to')}
                  </button>
                )}
              </td>
            </tr>
            {coverage.map((row) => (
              <LocaleRow
                controller={controller}
                editing={snapshot.contentLocale === row.locale}
                key={row.locale}
                row={row}
              />
            ))}
            {coverage.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  {authoringText('Only the source language so far. Add one to translate into.')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="ops-cols" data-cols="2">
        <div className="ops-box">
          <h3>
            <CircleAlert size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Still to write')}
          </h3>
          {behind.length === 0 ? (
            <p className="ops-box-body">
              {coverage.length === 0
                ? authoringText('Nothing to translate yet.')
                : authoringText('Every language has every string. Nothing is waiting.')}
            </p>
          ) : (
            <ul className="ops-list">
              {behind.map((row) => (
                <li key={row.locale}>
                  <span>
                    {localeLabel(row.locale)}
                    <small className="ops-list-meta">
                      {authoringText(
                        row.missing === 1
                          ? '{count} string still in the source language'
                          : '{count} strings still in the source language',
                        { count: row.missing },
                      )}
                    </small>
                  </span>
                  <button
                    className="ops-btn"
                    data-size="sm"
                    onClick={() => {
                      controller.setContentLocale(row.locale);
                      controller.closeOperationsMode();
                    }}
                    type="button"
                  >
                    {authoringText('Take me there')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ops-box">
          <h3>
            <Image size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Pictures in other languages')}
          </h3>
          <LocaleMediaWorkspace
            controller={controller}
            defaultLocale={defaultLocale}
            enabled={LOCALE_MEDIA_AVAILABLE}
            locales={configuredLocales}
            mediaBlocks={mediaBlocks}
            snapshot={snapshot}
          />
        </div>
      </div>

      <div className="ops-box">
        <h3>
          <CircleAlert size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Layout by language')}
        </h3>
        <ul className="ops-list">
          {configuredLocales.map((locale) => {
            const findings = layoutReport.rows.filter(
              (row) => row.kind === 'layout' && row.locale === locale,
            );
            return (
              <li key={locale}>
                <span>
                  {localeLabel(locale)}
                  <small className="ops-list-meta">
                    {findings.length === 0
                      ? authoringText('Copy fits the authored card sizes.')
                      : authoringText(
                          findings.length === 1
                            ? '{count} card needs more room'
                            : '{count} cards need more room',
                          { count: findings.length },
                        )}
                  </small>
                </span>
                <span className="ops-tag" data-tone={findings.length === 0 ? 'ok' : 'warning'}>
                  {findings.length === 0 ? authoringText('Fits') : findings.length}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function LocaleMediaWorkspace({
  controller,
  defaultLocale,
  enabled,
  locales,
  mediaBlocks,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  defaultLocale: string;
  enabled: boolean;
  locales: readonly string[];
  mediaBlocks: readonly LodariqBlock[];
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  const localeChoices = locales.filter((locale) => locale !== defaultLocale);
  const [blockId, setBlockId] = useState(mediaBlocks[0]?.id ?? '');
  const [locale, setLocale] = useState(localeChoices[0] ?? defaultLocale);
  const block = mediaBlocks.find((candidate) => candidate.id === blockId) ?? mediaBlocks[0];
  const media = block?.props.media;
  const variant = media?.localeVariants?.find((candidate) => candidate.locale === locale);
  const [assetId, setAssetId] = useState(variant?.assetId ?? '');
  const [accessibilityName, setAccessibilityName] = useState(variant?.accessibilityName ?? '');
  const [captionsAssetId, setCaptionsAssetId] = useState(variant?.captionsAssetId ?? '');

  useEffect(() => {
    setAssetId(variant?.assetId ?? '');
    setAccessibilityName(variant?.accessibilityName ?? '');
    setCaptionsAssetId(variant?.captionsAssetId ?? '');
  }, [variant?.accessibilityName, variant?.assetId, variant?.captionsAssetId]);

  if (!enabled) {
    return <p className="ops-box-body">{authoringText('Locale media is not available.')}</p>;
  }
  if (!mediaBlocks.length || !media) {
    return (
      <p className="ops-box-body">
        {authoringText('Add an image or video block before assigning locale media.')}
      </p>
    );
  }

  const assets = snapshot.mediaAssets.filter((asset) => asset.kind === media.kind);
  const captionsAssets = snapshot.mediaAssets.filter((asset) => asset.kind === 'captions');
  const assetExists = assets.some((asset) => asset.id === assetId);
  const valid = Boolean(assetId && assetExists && accessibilityName.trim());
  const currentVariants = media.localeVariants ?? [];

  return (
    <div className="operations-locale-media">
      <p className="ops-box-body">
        {authoringText(
          'Choose an approved asset and accessible description per locale. The base asset remains the explicit fallback, and missing variants are reported before publication.',
        )}
      </p>
      <label className="ops-field">
        <span>{authoringText('Media block')}</span>
        <select value={block.id} onChange={(event) => setBlockId(event.currentTarget.value)}>
          {mediaBlocks.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.content || candidate.id}
            </option>
          ))}
        </select>
      </label>
      <label className="ops-field">
        <span>{authoringText('Locale')}</span>
        <select value={locale} onChange={(event) => setLocale(event.currentTarget.value)}>
          {(localeChoices.length ? localeChoices : [defaultLocale]).map((candidate) => (
            <option key={candidate} value={candidate}>
              {localeLabel(candidate)}
            </option>
          ))}
        </select>
      </label>
      <label className="ops-field">
        <span>{authoringText('Approved {kind} asset', { kind: media.kind })}</span>
        <select value={assetId} onChange={(event) => setAssetId(event.currentTarget.value)}>
          <option value="">{authoringText('Choose an approved asset')}</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.filename}
            </option>
          ))}
        </select>
      </label>
      <label className="ops-field">
        <span>{authoringText('Locale alt text')}</span>
        <input
          maxLength={300}
          onChange={(event) => setAccessibilityName(event.currentTarget.value)}
          value={accessibilityName}
        />
      </label>
      {media.kind === 'video' ? (
        <label className="ops-field">
          <span>{authoringText('Locale captions asset')}</span>
          <select
            value={captionsAssetId}
            onChange={(event) => setCaptionsAssetId(event.currentTarget.value)}
          >
            <option value="">{authoringText('Choose captions')}</option>
            {captionsAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.filename}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="ops-row">
        <button
          className="ops-btn"
          data-variant="primary"
          disabled={!valid}
          onClick={() =>
            controller.setMediaLocaleVariant(
              block.id,
              {
                locale,
                assetId,
                accessibilityName: accessibilityName.trim(),
                ...(media.kind === 'video' && captionsAssetId ? { captionsAssetId } : {}),
              },
              defaultLocale,
            )
          }
          type="button"
        >
          {authoringText('Save locale variant')}
        </button>
        <span className="ops-tag" data-tone={valid ? 'ok' : 'warning'}>
          {valid
            ? authoringText('Ready for review')
            : authoringText('Needs approved asset and alt text')}
        </span>
      </div>
      {currentVariants.length ? (
        <ul className="ops-list">
          {currentVariants.map((candidate) => {
            const exists = snapshot.mediaAssets.some((asset) => asset.id === candidate.assetId);
            return (
              <li key={candidate.locale}>
                <span>
                  <strong>{localeLabel(candidate.locale)}</strong>
                  <span className="ops-list-meta">{candidate.accessibilityName}</span>
                </span>
                <span className="ops-tag" data-tone={exists ? 'ok' : 'warning'}>
                  {exists ? authoringText('Approved') : authoringText('Orphaned asset')}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function collectMediaBlocks(blocks: readonly LodariqBlock[]): LodariqBlock[] {
  return blocks.flatMap((block) => [
    ...(block.type === 'media' ? [block] : []),
    ...collectMediaBlocks(block.children),
  ]);
}

function LocaleRow({
  controller,
  editing,
  row,
}: {
  controller: LocalAuthoringFrameController;
  editing: boolean;
  row: LocaleCoverage;
}): ReactNode {
  const tone = row.percent === 100 ? 'ok' : row.percent >= 50 ? 'warning' : 'blocker';
  return (
    <tr data-selected={editing ? 'true' : 'false'}>
      <td className="ops-table-key">{localeLabel(row.locale)}</td>
      {/* The bar is never the message: the percentage sits beside it, and the
          count of what is missing is its own column. */}
      <td>
        <span className="operations-language-coverage">
          <span className="ops-meter">
            <i data-tone={tone} style={{ width: `${row.percent}%` }} />
          </span>
          <span>{authoringText('{percent}%', { percent: row.percent })}</span>
        </span>
      </td>
      <td>
        {row.missing === 0 ? (
          <span className="ops-tag" data-tone="ok">
            {authoringText('Complete')}
          </span>
        ) : (
          <span className="ops-tag" data-tone={tone}>
            {authoringText('{count} of {total}', { count: row.missing, total: row.total })}
          </span>
        )}
      </td>
      <td className="operations-language-actions">
        {editing ? (
          <span className="ops-tag">{authoringText('Editing')}</span>
        ) : (
          <button
            className="ops-btn"
            data-size="sm"
            onClick={() => controller.setContentLocale(row.locale)}
            type="button"
          >
            {authoringText('Switch to')}
          </button>
        )}
      </td>
    </tr>
  );
}

/** The language's own name for itself, falling back to the bare tag. */
const localeLabel = contentLocaleLabel;

function draftTooltip(
  snapshot: LocalAuthoringFrameSnapshot,
  behind: number,
  autoTranslateEnabled: boolean,
): string {
  if (!autoTranslateEnabled) {
    return authoringText('This tool is not included in the current workspace plan.');
  }
  if (!snapshot.translation.available) {
    return authoringText('Automatic translation is not configured');
  }
  if (behind === 0) return authoringText('Every language has every string. Nothing is waiting.');
  return authoringText('Drafts stay drafts — nothing is published on your behalf.');
}
