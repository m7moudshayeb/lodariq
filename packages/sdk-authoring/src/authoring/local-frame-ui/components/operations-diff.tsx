import { useEffect, useState, type ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import { FileJson } from '../design-system';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

const CATEGORY_LABELS = {
  content: authoringText('Content'),
  targets: authoringText('Targets'),
  theme: authoringText('Theme'),
  conditions: authoringText('Conditions'),
  flow: authoringText('Flow'),
  media: authoringText('Media'),
  renderer: authoringText('Renderer'),
} as const;

export function OperationsDiff({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  const versions = snapshot.documentVersions ?? [];
  const [beforeVersionId, setBeforeVersionId] = useState('');
  const [afterVersionId, setAfterVersionId] = useState('');
  const diff = snapshot.semanticVersionDiff;

  useEffect(() => {
    if (versions.length < 2) return;
    setBeforeVersionId((current) =>
      versions.some((version) => version.id === current) ? current : versions[1]!.id,
    );
    setAfterVersionId((current) =>
      versions.some((version) => version.id === current) ? current : versions[0]!.id,
    );
  }, [versions]);

  return (
    <section className="operations-diff" aria-label={authoringText('Semantic version diff')}>
      <div className="ops-box">
        <h3>
          <FileJson size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Semantic change review')}
        </h3>
        <p className="ops-box-body">
          {authoringText(
            'Serialization noise is ignored. Review is organized by content, targets, conditions, flow, media, theme, and renderer contract before an immutable artifact is approved.',
          )}
        </p>
        {versions.length >= 2 ? (
          <div className="ops-row">
            <label>
              <span>{authoringText('Before')}</span>
              <select
                aria-label={authoringText('Before version')}
                value={beforeVersionId}
                onChange={(event) => setBeforeVersionId(event.currentTarget.value)}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {authoringText('Version {version}', { version: version.version })} ·{' '}
                    {new Date(version.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{authoringText('After')}</span>
              <select
                aria-label={authoringText('After version')}
                value={afterVersionId}
                onChange={(event) => setAfterVersionId(event.currentTarget.value)}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {authoringText('Version {version}', { version: version.version })} ·{' '}
                    {new Date(version.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="ops-btn"
              disabled={!beforeVersionId || !afterVersionId || beforeVersionId === afterVersionId}
              onClick={() => controller.compareDocumentVersions(beforeVersionId, afterVersionId)}
              type="button"
            >
              {authoringText('Compare')}
            </button>
          </div>
        ) : (
          <p role="status">
            {authoringText('Save another document version to compare persisted history.')}
          </p>
        )}
        {diff ? (
          <span className="ops-tag" data-tone={diff.requiresReview ? 'warning' : 'ok'}>
            {diff.requiresReview
              ? authoringText('{count} semantic changes require review', {
                  count: diff.entries.length,
                })
              : authoringText('No semantic changes detected')}
          </span>
        ) : null}
      </div>
      {diff?.entries.length ? (
        <div className="ops-box">
          <ul className="ops-list">
            {diff.entries.map((entry) => (
              <li key={`${entry.category}:${entry.path}`}>
                <span>
                  <strong>{CATEGORY_LABELS[entry.category]}</strong>
                  <span className="ops-list-meta">
                    {entry.summary} · {entry.path}
                  </span>
                </span>
                <span className="ops-tag">{authoringText('Review')}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {versions.length >= 2 && versions.some((version) => !version.hasCompiledArtifact) ? (
        <p className="ops-callout" data-tone="info">
          {authoringText(
            'Canonical content is always compared. Theme and renderer changes are included when both saved versions have immutable compiled artifacts.',
          )}
        </p>
      ) : null}
    </section>
  );
}
