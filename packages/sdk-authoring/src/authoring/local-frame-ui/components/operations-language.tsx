import { localeOption } from '@lodariq/i18n';
import type { ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import { localeCoverage, type LocaleCoverage } from '../../publish-check';
import { CircleAlert, Globe, Image, LoaderCircle, Wand2 } from '../design-system';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

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
  const defaultLocale = snapshot.documentState.localization?.defaultLocale ?? 'en';
  const variants = snapshot.documentState.localization?.variants ?? [];
  const coverage = localeCoverage(
    snapshot.documentState,
    variants.map((variant) => variant.locale),
  );
  const behind = coverage.filter((row) => row.missing > 0);
  const translating = snapshot.translation.state === 'translating';

  return (
    <section className="operations-language" aria-label={authoringText('Language')}>
      <div className="ops-box">
        <h3>
          <Globe size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Languages')}
          <span className="ops-box-actions">
            {/*
              WIRE_BE: adding a language creates a document variant, which is a
              control-plane write this frame has no message for. Switching
              between the ones that exist is local and works.
            */}
            <button
              className="ops-btn"
              data-size="sm"
              disabled
              title={authoringText('Adding a language is not available yet.')}
              type="button"
            >
              {authoringText('Add a language')}
            </button>
            <button
              className="ops-btn"
              data-size="sm"
              data-variant="primary"
              disabled={!snapshot.translation.available || behind.length === 0 || translating}
              onClick={() => void controller.translateMissingCopy()}
              title={draftTooltip(snapshot, behind.length)}
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

        {/*
          WIRE_BE: per-locale media is a workspace asset story — one screenshot
          per language, swapped at publish. Nothing in the document models it, so
          this states the problem it solves rather than pretending to solve it.
        */}
        <div className="ops-box">
          <h3>
            <Image size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Pictures in other languages')}
          </h3>
          <p className="ops-box-body">
            {authoringText(
              'A tour in Japanese showing screenshots of the English product is the failure nobody catches in review. Swapping the picture per language keeps its size and its description shared.',
            )}
          </p>
          <button
            className="ops-btn"
            data-size="sm"
            disabled
            title={authoringText('Per-language pictures are not available yet.')}
            type="button"
          >
            {authoringText('Manage pictures per language')}
          </button>
        </div>
      </div>

      {/*
        WIRE_IFRAME: a card that fits in English can overflow in German, and only
        the host page can measure that. The check runs against the source
        language today, so a per-language placement column would be four copies
        of one number.
      */}
      <p className="ops-callout" data-tone="info">
        {authoringText(
          'Checks run against the source language for now. Card sizes are not yet re-measured per language.',
        )}
      </p>
    </section>
  );
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

/** The creator's own name for the language, not its tag. */
function localeLabel(locale: string): string {
  try {
    return localeOption(locale as Parameters<typeof localeOption>[0]).label;
  } catch {
    return locale;
  }
}

function draftTooltip(snapshot: LocalAuthoringFrameSnapshot, behind: number): string {
  if (!snapshot.translation.available) {
    return authoringText('Automatic translation is not configured');
  }
  if (behind === 0) return authoringText('Every language has every string. Nothing is waiting.');
  return authoringText('Drafts stay drafts — nothing is published on your behalf.');
}
